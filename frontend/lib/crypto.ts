/**
 * End-to-end encryption for chat text messages.
 *
 * Scheme: hybrid RSA-OAEP + AES-GCM, the same shape real messaging apps use
 * at the primitive level (Signal/WhatsApp use a more elaborate ratchet on
 * top for forward secrecy - this is the straightforward version):
 *
 *   1. Each user generates an RSA-OAEP keypair the first time they log in.
 *      The public key is uploaded to the server; the private key is saved
 *      ONLY in this browser's IndexedDB and never transmitted anywhere.
 *   2. To send a message: generate a random one-time AES-256 key, encrypt
 *      the message text with it (AES-GCM), then RSA-encrypt that AES key
 *      twice - once with the recipient's public key, once with the
 *      sender's own public key (so the sender can also decrypt their own
 *      sent messages later on reload).
 *   3. The server stores/relays only ciphertext + the two RSA-encrypted AES
 *      keys. It never has the AES key or plaintext.
 *
 * Known limitations (see chat.py / README for the fuller list):
 *   - Single device only. Logging in on a second device generates a NEW
 *     keypair there, which can't decrypt messages encrypted for the first
 *     device's key. Real apps solve this with device-linking; out of scope
 *     here for now.
 *   - No private-key backup. Clearing browser storage or switching browsers
 *     loses the ability to decrypt past messages on that device.
 *   - Photos/videos are NOT encrypted by this module - only text content.
 */

const DB_NAME = "kindling-keys";
const STORE_NAME = "keys";
const PRIVATE_KEY_ID = "private-key";

const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function bufToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function exportPublicKeyBase64(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", key);
  return bufToBase64(spki);
}

async function importPublicKey(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    base64ToBuf(base64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
}

/**
 * Ensures this device has a keypair, generating one if needed. Returns the
 * base64 public key either way, and a flag indicating whether it was freshly
 * generated (so the caller knows whether it needs to upload it).
 */
export async function ensureKeysReady(): Promise<{ publicKeyBase64: string; isNew: boolean }> {
  const existing = await idbGet<CryptoKey>(PRIVATE_KEY_ID);
  if (existing) {
    const stored = await idbGet<string>("public-key-b64");
    if (stored) return { publicKeyBase64: stored, isNew: false };
  }

  const keyPair = await crypto.subtle.generateKey(RSA_PARAMS, false, ["encrypt", "decrypt"]);
  const publicKeyBase64 = await exportPublicKeyBase64(keyPair.publicKey);
  await idbSet(PRIVATE_KEY_ID, keyPair.privateKey);
  await idbSet("public-key-b64", publicKeyBase64);
  return { publicKeyBase64, isNew: true };
}

async function getPrivateKey(): Promise<CryptoKey | null> {
  const key = await idbGet<CryptoKey>(PRIVATE_KEY_ID);
  return key ?? null;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  encryptedKeyForRecipient: string;
  encryptedKeyForSelf: string;
}

/** Encrypts plaintext for a conversation between the sender and one recipient. */
export async function encryptMessage(
  plaintext: string,
  recipientPublicKeyBase64: string,
  ownPublicKeyBase64: string
): Promise<EncryptedPayload> {
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);

  const recipientPublicKey = await importPublicKey(recipientPublicKeyBase64);
  const ownPublicKey = await importPublicKey(ownPublicKeyBase64);

  const [keyForRecipient, keyForSelf] = await Promise.all([
    crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientPublicKey, rawAesKey),
    crypto.subtle.encrypt({ name: "RSA-OAEP" }, ownPublicKey, rawAesKey),
  ]);

  return {
    ciphertext: bufToBase64(ciphertextBuf),
    iv: bufToBase64(iv.buffer),
    encryptedKeyForRecipient: bufToBase64(keyForRecipient),
    encryptedKeyForSelf: bufToBase64(keyForSelf),
  };
}

/**
 * Decrypts a message using this device's private key. Returns null (instead
 * of throwing) if decryption fails - e.g. this message was encrypted for a
 * different device's key, or it's a legacy/media message that isn't
 * encrypted at all. Callers should fall back to showing the raw `content`
 * (for pre-E2E messages) or an explanatory placeholder when this returns null.
 */
export async function decryptMessage(
  ciphertextBase64: string,
  ivBase64: string,
  encryptedKeyBase64: string
): Promise<string | null> {
  try {
    const privateKey = await getPrivateKey();
    if (!privateKey) return null;

    const rawAesKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, base64ToBuf(encryptedKeyBase64));
    const aesKey = await crypto.subtle.importKey("raw", rawAesKey, { name: "AES-GCM" }, false, ["decrypt"]);
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBuf(ivBase64) },
      aesKey,
      base64ToBuf(ciphertextBase64)
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}

/** True if this browser has a locally stored private key (i.e. can decrypt). */
export async function hasLocalKey(): Promise<boolean> {
  return (await getPrivateKey()) !== null;
}