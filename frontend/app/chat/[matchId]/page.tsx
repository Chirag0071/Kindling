"use client";

import { useEffect, useRef, useState, useMemo, FormEvent, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { chat, getApiUrl, getWsUrl, ApiError } from "@/lib/api";
import { useWebRTCCall } from "@/lib/useWebRTCCall";
import EndConversationModal from "@/components/EndConversationModal";
import SafetyMenu from "@/components/SafetyMenu";
import VideoCallOverlay from "@/components/VideoCallOverlay";
import Avatar from "@/components/Avatar";
import MediaLightbox from "@/components/MediaLightbox";
import SharedMediaModal from "@/components/SharedMediaModal";
import { ensureKeysReady, encryptMessage, decryptMessage } from "@/lib/crypto";
import { auth as authApi } from "@/lib/api";
import type { ChatInfo, Message, CloseReason } from "@/lib/types";

const VIDEO_EXT = /\.(mp4|webm|mov|quicktime)$/i;

function formatDayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export default function ChatPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [info, setInfo] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showEndModal, setShowEndModal] = useState(false);
  const [showSafetyMenu, setShowSafetyMenu] = useState(false);
  const [showSharedMedia, setShowSharedMedia] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [ownPublicKey, setOwnPublicKey] = useState<string | null>(null);
  const [decrypted, setDecrypted] = useState<Record<string, string | null>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const call = useWebRTCCall(wsRef);

  // Every photo/video shared in this conversation, in chronological order -
  // powers both the "Shared with X" gallery and the tap-to-enlarge lightbox,
  // so the two stay in sync without a separate backend call.
  const mediaItems = useMemo(
    () =>
      messages
        .filter((m) => m.media_url)
        .map((m) => ({
          id: m.id,
          url: m.media_url as string,
          isVideo: VIDEO_EXT.test(m.media_url as string),
        })),
    [messages]
  );

  const mediaIndexById = useMemo(() => {
    const map = new Map<string, number>();
    mediaItems.forEach((item, i) => map.set(item.id, i));
    return map;
  }, [mediaItems]);

  const openLightboxForMessage = (messageId: string) => {
    const idx = mediaIndexById.get(messageId);
    if (idx !== undefined) setLightboxIndex(idx);
  };

  // Decrypt any encrypted messages we haven't decrypted yet, whenever the
  // message list changes (initial load, new message arriving over the WS).
  // Runs client-side only - the server never sees plaintext, so there's
  // nothing to do here except locally undo what encryptMessage() did on
  // the sender's device.
  useEffect(() => {
    const pending = messages.filter((m) => m.is_encrypted && m.content && !(m.id in decrypted));
    if (pending.length === 0) return;

    let cancelled = false;
    (async () => {
      const results: Record<string, string | null> = {};
      for (const m of pending) {
        const myKeyBlob = user?.id === m.user1_id ? m.encrypted_key_user1 : m.encrypted_key_user2;
        if (!myKeyBlob || !m.iv || !m.content) {
          results[m.id] = null;
          continue;
        }
        results[m.id] = await decryptMessage(m.content, m.iv, myKeyBlob);
      }
      if (!cancelled) setDecrypted((prev) => ({ ...prev, ...results }));
    })();
    return () => { cancelled = true; };
  }, [messages, user?.id, decrypted]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login");
  }, [authLoading, user, router]);

  // Set up this device's encryption keypair once logged in. If it's brand
  // new (first login on this device/browser), upload the public half so
  // other people can encrypt messages to this user - the private half never
  // leaves this function.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    ensureKeysReady().then(({ publicKeyBase64, isNew }) => {
      if (cancelled) return;
      setOwnPublicKey(publicKeyBase64);
      if (isNew) authApi.setPublicKey(publicKeyBase64).catch(() => {});
    });
    return () => { cancelled = true; };
  }, [user]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
  }, []);

  useEffect(() => {
    if (!user || !matchId) return;
    let cancelled = false;

    Promise.all([chat.info(matchId), chat.messages(matchId)])
      .then(([infoRes, messagesRes]) => {
        if (cancelled) return;
        setInfo(infoRes);
        setMessages(messagesRes);
        chat.markRead(matchId).catch(() => {});
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load this conversation.");
      })
      .finally(() => !cancelled && setLoading(false));

    return () => { cancelled = true; };
  }, [user, matchId]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!user || !matchId || !info?.is_active) return;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
      const ws = new WebSocket(getWsUrl(matchId));
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "chat") {
          setMessages((prev) => [...prev, {
            id: data.id, match_id: data.match_id, sender_id: data.sender_id,
            content: data.content, media_url: data.media_url, sent_at: data.sent_at, read_at: null,
            is_encrypted: data.is_encrypted, iv: data.iv,
            user1_id: data.user1_id, user2_id: data.user2_id,
            encrypted_key_user1: data.encrypted_key_user1, encrypted_key_user2: data.encrypted_key_user2,
          }]);
        } else if (data.type === "call-end" && data.message) {
          setMessages((prev) => [...prev, {
            id: data.message.id, match_id: data.message.match_id, sender_id: data.message.sender_id,
            content: data.message.content, media_url: null, sent_at: data.message.sent_at, read_at: null,
            is_encrypted: false, iv: null,
            user1_id: data.message.user1_id, user2_id: data.message.user2_id,
            encrypted_key_user1: null, encrypted_key_user2: null,
          }]);
          call.handleSignal(data);
        } else if (data.type?.startsWith("call-")) {
          call.handleSignal(data);
        } else if (data.type === "error") {
          // The backend rejects things like invalid media URLs over the
          // socket rather than the HTTP response, since the send happens
          // over the WS connection - this was previously discarded here
          // with zero visible trace, making rejections look identical to
          // "nothing happened."
          setUploadError(data.detail || "That message couldn't be sent.");
        }
      };

      // A dropped connection (network blip, backend restart, tab backgrounded
      // by the OS, etc.) used to just stay dead until a manual page refresh -
      // any file attached in the meantime uploaded fine but the chat message
      // silently never sent, with no error and no visible trace of the photo.
      // Reconnect automatically with a short backoff instead.
      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        if (cancelled) return;
        const delay = Math.min(1000 * 2 ** attempt, 8000);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, matchId, info?.is_active]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setUploadError("Connection lost - reconnecting, please try again in a moment.");
      return;
    }

    // Encrypt whenever both sides have a public key on file. If either
    // hasn't generated one yet (e.g. the other person hasn't opened the
    // app since this feature shipped), fall back to sending plain text
    // rather than blocking the conversation entirely - is_encrypted stays
    // false for that message, same as any pre-E2E message.
    if (ownPublicKey && info?.other_public_key) {
      try {
        const enc = await encryptMessage(text, info.other_public_key, ownPublicKey);
        wsRef.current.send(JSON.stringify({
          type: "chat",
          content: enc.ciphertext,
          is_encrypted: true,
          iv: enc.iv,
          encrypted_key_user1: user?.id === info.user1_id ? enc.encryptedKeyForSelf : enc.encryptedKeyForRecipient,
          encrypted_key_user2: user?.id === info.user2_id ? enc.encryptedKeyForSelf : enc.encryptedKeyForRecipient,
        }));
        setDraft("");
        return;
      } catch {
        // Encryption failing (e.g. a corrupt local key) shouldn't lose the
        // message entirely - fall through to sending it in plain text.
      }
    }

    wsRef.current.send(JSON.stringify({ type: "chat", content: text }));
    setDraft("");
  };

  const handleAttach = async (file: File) => {
    setUploadError("");
    setUploading(true);
    try {
      const uploaded = await chat.uploadMedia(matchId, file);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "chat", media_url: uploaded.url }));
      } else {
        // The file uploaded fine but the socket isn't open right now - it
        // used to just vanish silently here. Now the person at least knows
        // the send didn't go through instead of wondering where their photo went.
        setUploadError("Uploaded, but the connection dropped before it could send. Reconnecting - try attaching it again in a moment.");
      }
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Couldn't send that file.");
    } finally {
      setUploading(false);
    }
  };

  const handleEndConversation = async (reason: CloseReason, note?: string) => {
    await chat.close(matchId, reason, note);
    const updated = await chat.messages(matchId);
    setMessages(updated);
    setInfo((prev) => (prev ? { ...prev, is_active: false } : prev));
    setShowEndModal(false);
  };

  if (authLoading || loading) {
    return <main className="min-h-screen bg-dusk flex items-center justify-center text-slate font-mono text-sm">loading···</main>;
  }

  if (error || !info) {
    return (
      <main className="min-h-screen bg-dusk flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-slate text-sm">{error || "This conversation isn't available."}</p>
        <button onClick={() => router.push("/matches")} className="text-ember text-sm">Back to matches</button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dusk flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-ash bg-dusk/95 backdrop-blur px-4 py-3">
        <button onClick={() => router.push("/matches")} aria-label="Back" className="text-slate hover:text-birch p-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <Avatar
          url={info.other_photo_url}
          name={info.other_first_name}
          className="h-9 w-9 rounded-full shrink-0"
          textClassName="text-sm"
        />
        <button
          onClick={() => setShowSharedMedia(true)}
          className="font-sans font-medium text-birch flex-1 text-left hover:text-ember transition-colors"
        >
          {info.other_first_name}
        </button>
        {info.is_active && (
          <button onClick={() => call.startCall()} aria-label="Start video call" className="text-slate hover:text-birch p-1.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="5" width="15" height="14" rx="2" /><path d="M23 7l-7 5 7 5V7z" />
            </svg>
          </button>
        )}
        {info.is_active && (
          <button onClick={() => setShowSafetyMenu(true)} aria-label="More options" className="text-slate hover:text-birch p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {messages.length === 0 && (
          <p className="text-center text-slate text-sm font-mono mt-10">Say hello — that's how it starts.</p>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === user?.id;
          const isVideo = m.media_url ? VIDEO_EXT.test(m.media_url) : false;
          const prev = messages[i - 1];
          const showDaySeparator = !prev || !isSameDay(prev.sent_at, m.sent_at);
          return (
            <div key={m.id}>
              {showDaySeparator && (
                <div className="flex items-center justify-center py-2">
                  <span className="text-[11px] font-mono text-slate bg-dusk-deep border border-ash rounded-full px-3 py-1">
                    {formatDayLabel(m.sent_at)}
                  </span>
                </div>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <div
                    className={`rounded-2xl overflow-hidden text-sm ${
                      m.media_url ? "" : "px-4 py-2.5"
                    } ${mine ? "bg-ember text-birch rounded-br-md" : "bg-dusk-deep border border-ash text-birch rounded-bl-md"}`}
                  >
                    {m.media_url && (
                      isVideo ? (
                        <button
                          type="button"
                          onClick={() => openLightboxForMessage(m.id)}
                          className="relative block w-56 h-72 group"
                          aria-label="Open video"
                        >
                          <video src={getApiUrl(m.media_url)} muted className="h-full w-full object-cover rounded-t-2xl" />
                          <span className="absolute inset-0 flex items-center justify-center bg-dusk-deep/20 group-hover:bg-dusk-deep/35 transition-colors">
                            <span className="h-11 w-11 rounded-full bg-dusk-deep/70 flex items-center justify-center text-birch">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                            </span>
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openLightboxForMessage(m.id)}
                          className="relative block w-56 h-72"
                          aria-label="Open photo"
                        >
                          <Image src={getApiUrl(m.media_url)} alt="" fill className="object-cover" />
                        </button>
                      )
                    )}
                    {m.content && (
                      <span className={m.media_url ? "block px-4 py-2.5" : ""}>
                        {m.is_encrypted ? (
                          m.id in decrypted ? (
                            decrypted[m.id] !== null ? (
                              <>
                                <svg
                                  width="11" height="11" viewBox="0 0 24 24" fill="none"
                                  stroke="currentColor" strokeWidth="2.2"
                                  className="inline-block mr-1 mb-0.5 opacity-60"
                                  aria-label="End-to-end encrypted"
                                >
                                  <rect x="4" y="11" width="16" height="9" rx="2" />
                                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                                </svg>
                                {decrypted[m.id]}
                              </>
                            ) : (
                              <span className="italic opacity-70">Can't decrypt on this device</span>
                            )
                          ) : (
                            <span className="italic opacity-60">Decrypting…</span>
                          )
                        ) : (
                          m.content
                        )}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate mt-1 px-1">
                    {formatMessageTime(m.sent_at)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {info.is_active ? (
        <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-ash bg-dusk px-4 py-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Attach photo or video"
            className="h-10 w-10 rounded-full border border-ash flex items-center justify-center text-slate hover:text-birch hover:border-slate disabled:opacity-40 shrink-0"
          >
            {uploading ? (
              <span className="text-xs font-mono">···</span>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
              </svg>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAttach(file);
              e.target.value = "";
            }}
          />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write something real"
            className="flex-1 rounded-full bg-dusk-deep border border-ash px-4 py-2.5 text-birch placeholder:text-slate/60 focus:border-ember focus:outline-none text-sm"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send"
            className="h-10 w-10 rounded-full bg-ember flex items-center justify-center text-birch disabled:opacity-40 shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2v6z" /></svg>
          </button>
          <button
            type="button"
            onClick={() => setShowEndModal(true)}
            className="text-xs text-slate hover:text-red-500 font-mono shrink-0 px-1"
          >
            end
          </button>
        </form>
      ) : (
        <div className="border-t border-ash bg-dusk-deep px-4 py-4 text-center">
          <p className="text-slate text-sm font-mono">This conversation has ended</p>
        </div>
      )}

      {!wsConnected && info?.is_active && (
        <p className="text-center text-xs text-slate pb-2 bg-dusk">Reconnecting...</p>
      )}

      {uploadError && (
        <p className="text-center text-xs text-red-500 pb-2 bg-dusk">{uploadError}</p>
      )}

      {showEndModal && (
        <EndConversationModal onClose={() => setShowEndModal(false)} onConfirm={handleEndConversation} />
      )}
      {showSafetyMenu && (
        <SafetyMenu
          userId={info.other_user_id}
          userName={info.other_first_name}
          onCancel={() => setShowSafetyMenu(false)}
          onDone={() => { setShowSafetyMenu(false); router.push("/matches"); }}
        />
      )}

      {showSharedMedia && (
        <SharedMediaModal
          otherName={info.other_first_name}
          items={mediaItems}
          onClose={() => setShowSharedMedia(false)}
          onSelect={(i) => { setShowSharedMedia(false); setLightboxIndex(i); }}
        />
      )}
      {lightboxIndex !== null && (
        <MediaLightbox
          items={mediaItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      <VideoCallOverlay
        callState={call.callState}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        isMuted={call.isMuted}
        isCameraOff={call.isCameraOff}
        callDuration={call.callDuration}
        otherName={info.other_first_name}
        otherPhoto={info.other_photo_url}
        onAccept={call.acceptCall}
        onDecline={call.declineCall}
        onEnd={call.endCall}
        onToggleMute={call.toggleMute}
        onToggleCamera={call.toggleCamera}
      />
    </main>
  );
}