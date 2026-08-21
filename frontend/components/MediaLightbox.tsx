"use client";

import { useEffect, useCallback, useRef, useState } from "react";
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

const MIN_SCALE = 1;
const MAX_SCALE = 4;

export default function MediaLightbox({ items, index, onClose, onNavigate }: Props) {
  const hasMultiple = items.length > 1;
  const item = items[index];

  // --- Zoom & pan state (images only) ---
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastTapRef = useRef(0);

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  // Reset zoom whenever the viewed item changes, so swiping to the next
  // photo never carries over a previous zoom/pan state.
  useEffect(() => {
    resetZoom();
  }, [index, resetZoom]);

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const zoomAt = (newScale: number, originX: number, originY: number) => {
    const wrap = imgWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const cx = originX - rect.left - rect.width / 2;
    const cy = originY - rect.top - rect.height / 2;
    const clamped = clampScale(newScale);
    const ratio = clamped / scale;
    setTranslate((prev) => ({
      x: cx - (cx - prev.x) * ratio,
      y: cy - (cy - prev.y) * ratio,
    }));
    setScale(clamped);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (item?.isVideo) return;
    e.preventDefault();
    zoomAt(scale - e.deltaY * 0.0025, e.clientX, e.clientY);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (item?.isVideo) return;
    if (scale > 1) {
      resetZoom();
    } else {
      zoomAt(2.5, e.clientX, e.clientY);
    }
  };

  const distanceBetween = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (item?.isVideo) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStart.current = { dist: distanceBetween(a, b), scale };
      panStart.current = null;
    } else if (pointers.current.size === 1) {
      if (scale > 1) {
        panStart.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
      }
      // Double-tap to zoom, for touch devices (handleDoubleClick covers mouse).
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        if (scale > 1) {
          resetZoom();
        } else {
          zoomAt(2.5, e.clientX, e.clientY);
        }
      }
      lastTapRef.current = now;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = distanceBetween(a, b);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const newScale = pinchStart.current.scale * (dist / pinchStart.current.dist);
      zoomAt(newScale, midX, midY);
    } else if (pointers.current.size === 1 && panStart.current && scale > 1) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setTranslate({ x: panStart.current.tx + dx, y: panStart.current.ty + dy });
    }
  };

  const clearPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) panStart.current = null;
  };

  const goPrev = useCallback(() => {
    if (index > 0) onNavigate(index - 1);
  }, [index, onNavigate]);

  const goNext = useCallback(() => {
    if (index < items.length - 1) onNavigate(index + 1);
  }, [index, items.length, onNavigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && scale === 1) goPrev();
      if (e.key === "ArrowRight" && scale === 1) goNext();
      if (e.key === "+" || e.key === "=") zoomAt(scale + 0.5, window.innerWidth / 2, window.innerHeight / 2);
      if (e.key === "-") zoomAt(scale - 0.5, window.innerWidth / 2, window.innerHeight / 2);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, goPrev, goNext, scale]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-dusk-deep/97 backdrop-blur-sm flex flex-col"
      onClick={scale === 1 ? onClose : undefined}
    >
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        {hasMultiple ? (
          <span className="font-mono text-xs text-slate">{index + 1} / {items.length}</span>
        ) : <span />}
        <div className="flex items-center gap-2">
          {!item.isVideo && scale > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); resetZoom(); }}
              className="font-mono text-[11px] text-slate hover:text-birch px-2 py-1 rounded-full hover:bg-ash/60"
            >
              Reset zoom
            </button>
          )}
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
      </div>

      <div
        className="relative flex-1 flex items-center justify-center px-2 pb-4 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {hasMultiple && index > 0 && scale === 1 && (
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
          <div
            ref={imgWrapRef}
            className="max-h-full max-w-full overflow-hidden touch-none select-none"
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={clearPointer}
            onPointerCancel={clearPointer}
            onPointerLeave={clearPointer}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getApiUrl(item.url)}
              alt=""
              draggable={false}
              className="max-h-[85vh] max-w-full object-contain rounded-lg"
              style={{
                transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                transition: pointers.current.size > 0 ? "none" : "transform 0.15s ease-out",
                cursor: scale > 1 ? "grab" : "zoom-in",
              }}
            />
          </div>
        )}

        {hasMultiple && index < items.length - 1 && scale === 1 && (
          <button
            onClick={goNext}
            aria-label="Next"
            className="absolute right-1 sm:right-3 z-10 h-10 w-10 rounded-full bg-dusk-deep/70 flex items-center justify-center text-birch"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
      </div>

      {!item.isVideo && scale === 1 && (
        <p className="text-center text-[11px] font-mono text-slate pb-3">
          Pinch, scroll, or double-tap to zoom
        </p>
      )}
    </div>
  );
}