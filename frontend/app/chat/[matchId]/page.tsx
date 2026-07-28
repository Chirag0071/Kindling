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
import type { ChatInfo, Message, CloseReason } from "@/lib/types";

const VIDEO_EXT = /\.(mp4|webm|mov|quicktime)$/i;

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

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login");
  }, [authLoading, user, router]);

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

    const ws = new WebSocket(getWsUrl(matchId));
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "chat") {
        setMessages((prev) => [...prev, {
          id: data.id, match_id: data.match_id, sender_id: data.sender_id,
          content: data.content, media_url: data.media_url, sent_at: data.sent_at, read_at: null,
        }]);
      } else if (data.type === "call-end" && data.message) {
        setMessages((prev) => [...prev, {
          id: data.message.id, match_id: data.message.match_id, sender_id: data.message.sender_id,
          content: data.message.content, media_url: null, sent_at: data.message.sent_at, read_at: null,
        }]);
        call.handleSignal(data);
      } else if (data.type?.startsWith("call-")) {
        call.handleSignal(data);
      }
    };

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, matchId, info?.is_active]);

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "chat", content: draft.trim() }));
    setDraft("");
  };

  const handleAttach = async (file: File) => {
    setUploadError("");
    setUploading(true);
    try {
      const uploaded = await chat.uploadMedia(matchId, file);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "chat", media_url: uploaded.url }));
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
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          const isVideo = m.media_url ? VIDEO_EXT.test(m.media_url) : false;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl overflow-hidden text-sm ${
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
                {m.content && <span className={m.media_url ? "block px-4 py-2.5" : ""}>{m.content}</span>}
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
            className="text-xs text-slate hover:text-red-300 font-mono shrink-0 px-1"
          >
            end
          </button>
        </form>
      ) : (
        <div className="border-t border-ash bg-dusk-deep px-4 py-4 text-center">
          <p className="text-slate text-sm font-mono">This conversation has ended</p>
        </div>
      )}

      {uploadError && (
        <p className="text-center text-xs text-red-300 pb-2 bg-dusk">{uploadError}</p>
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
