"use client";

import { useEffect, useCallback } from "react";
import { getApiUrl } from "@/lib/api";

export interface LightboxItem {
  url: string;
  isVideo: boolean;
}

interface Props {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function MediaLightbox({ items, index, onClose, onNavigate }: Props) {
  const hasMultiple = items.length > 1;

  const goPrev = useCallback(() => {
    if (index > 0) onNavigate(index - 1);
  }, [index, onNavigate]);

  const goNext = useCallback(() => {
    if (index < items.length - 1) onNavigate(index + 1);
  }, [index, items.length, onNavigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext]);

  const item = items[index];
  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-dusk-deep/97 backdrop-blur-sm flex flex-col"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        {hasMultiple ? (
          <span className="font-mono text-xs text-slate">{index + 1} / {items.length}</span>
        ) : <span />}
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="Close"
          className="h-9 w-9 rounded-full flex items-center justify-center text-birch hover:bg-ash/60"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div
        className="relative flex-1 flex items-center justify-center px-2 pb-4 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {hasMultiple && index > 0 && (
          <button
            onClick={goPrev}
            aria-label="Previous"
            className="absolute left-1 sm:left-3 z-10 h-10 w-10 rounded-full bg-dusk-deep/70 flex items-center justify-center text-birch"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}

        {item.isVideo ? (
          <video
            src={getApiUrl(item.url)}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full rounded-lg"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getApiUrl(item.url)}
            alt=""
            className="max-h-full max-w-full object-contain rounded-lg"
          />
        )}

        {hasMultiple && index < items.length - 1 && (
          <button
            onClick={goNext}
            aria-label="Next"
            className="absolute right-1 sm:right-3 z-10 h-10 w-10 rounded-full bg-dusk-deep/70 flex items-center justify-center text-birch"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
