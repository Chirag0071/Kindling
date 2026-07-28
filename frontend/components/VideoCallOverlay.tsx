"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getApiUrl } from "@/lib/api";
import type { CallState } from "@/lib/useWebRTCCall";

interface Props {
  callState: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  callDuration: number;
  otherName: string;
  otherPhoto: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative h-28 w-28 rounded-full overflow-hidden bg-ash">
      {photo && !failed ? (
        <Image src={getApiUrl(photo)} alt={name} fill className="object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="flex h-full items-center justify-center font-display text-3xl text-slate">{name[0]}</div>
      )}
    </div>
  );
}

function HangupIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ transform: "rotate(135deg)" }}>
      <path d="M12 20.5c-4-3-8-6.5-8-10.5a4.5 4.5 0 018-2.5 4.5 4.5 0 018 2.5c0 4-4 7.5-8 10.5z" />
    </svg>
  );
}

export default function VideoCallOverlay({
  callState, localStream, remoteStream, isMuted, isCameraOff, callDuration,
  otherName, otherPhoto, onAccept, onDecline, onEnd, onToggleMute, onToggleCamera,
}: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream, callState]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream, callState]);

  if (callState === "idle") return null;

  return (
    <div className="fixed inset-0 z-[60] bg-dusk-deep flex flex-col">
      {callState === "incoming" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <Avatar name={otherName} photo={otherPhoto} />
          <p className="font-display text-2xl text-birch">{otherName} is calling...</p>
          <div className="flex gap-8 mt-6">
            <button onClick={onDecline} aria-label="Decline" className="h-16 w-16 rounded-full bg-red-500 flex items-center justify-center text-white">
              <HangupIcon />
            </button>
            <button onClick={onAccept} aria-label="Accept" className="h-16 w-16 rounded-full bg-ember flex items-center justify-center text-birch">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.6 21 3 12.4 3 2c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1.1L6.6 10.8z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {callState === "outgoing" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <Avatar name={otherName} photo={otherPhoto} />
          <p className="font-display text-2xl text-birch">Calling {otherName}...</p>
          <button onClick={onEnd} aria-label="Cancel call" className="h-16 w-16 rounded-full bg-red-500 flex items-center justify-center text-white mt-6">
            <HangupIcon />
          </button>
        </div>
      )}

      {callState === "active" && (
        <>
          <div className="relative flex-1 bg-black overflow-hidden">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`h-full w-full object-cover ${remoteStream ? "" : "hidden"}`}
            />
            {!remoteStream && (
              <div className="absolute inset-0 h-full w-full flex items-center justify-center">
                <Avatar name={otherName} photo={otherPhoto} />
              </div>
            )}
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`absolute bottom-4 right-4 h-32 w-24 rounded-xl object-cover border-2 border-birch/40 ${isCameraOff ? "hidden" : ""}`}
            />
            <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-dusk-deep/70 px-3 py-1 text-xs font-mono text-birch">
              {otherName} · {formatDuration(callDuration)}
            </div>
          </div>
          <div className="flex items-center justify-center gap-5 py-6 bg-dusk-deep">
            <button
              onClick={onToggleMute}
              aria-label={isMuted ? "Unmute" : "Mute"}
              className={`h-14 w-14 rounded-full flex items-center justify-center ${isMuted ? "bg-ember text-birch" : "bg-ash text-birch"}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10v1a7 7 0 0014 0v-1M12 18v3" />
                {isMuted && <line x1="3" y1="3" x2="21" y2="21" />}
              </svg>
            </button>
            <button onClick={onEnd} aria-label="End call" className="h-16 w-16 rounded-full bg-red-500 flex items-center justify-center text-white">
              <HangupIcon />
            </button>
            <button
              onClick={onToggleCamera}
              aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
              className={`h-14 w-14 rounded-full flex items-center justify-center ${isCameraOff ? "bg-ember text-birch" : "bg-ash text-birch"}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" />
                {isCameraOff && <line x1="1" y1="1" x2="23" y2="23" />}
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
