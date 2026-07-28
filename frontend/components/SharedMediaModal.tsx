"use client";

import { getApiUrl } from "@/lib/api";
import type { LightboxItem } from "./MediaLightbox";

interface Props {
  otherName: string;
  items: LightboxItem[];
  onClose: () => void;
  onSelect: (index: number) => void;
}

export default function SharedMediaModal({ otherName, items, onClose, onSelect }: Props) {
  return (
    <div className="fixed inset-0 z-[65] bg-dusk-deep/80 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-md sm:rounded-card rounded-t-3xl bg-dusk border border-ash max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="font-display text-xl text-birch">Shared with {otherName}</h2>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-full flex items-center justify-center text-slate hover:text-birch">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-6">
          {items.length === 0 ? (
            <p className="text-slate text-sm font-mono py-8 text-center">No photos or videos shared yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {items.map((item, i) => (
                <button
                  key={i}
                  onClick={() => onSelect(i)}
                  className="relative aspect-square rounded-lg overflow-hidden bg-dusk-deep"
                >
                  {item.isVideo ? (
                    <>
                      <video src={getApiUrl(item.url)} className="h-full w-full object-cover" muted />
                      <span className="absolute bottom-1 right-1 text-birch">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      </span>
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={getApiUrl(item.url)} alt="" className="h-full w-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
