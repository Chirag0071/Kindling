"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getApiUrl } from "@/lib/api";
import type { Story } from "@/lib/types";

interface Props {
  firstName: string;
  stories: Story[];
  onClose: () => void;
}

const DURATION_MS = 5000;

export default function StoryViewer({ firstName, stories, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    const tick = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / DURATION_MS) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(tick);
        if (index < stories.length - 1) setIndex((i) => i + 1);
        else onClose();
      }
    }, 50);
    return () => clearInterval(tick);
  }, [index, stories.length, onClose]);

  const current = stories[index];
  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 bg-dusk-deep flex flex-col">
      <div className="flex gap-1.5 px-3 pt-3">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 rounded-full bg-birch/25 overflow-hidden">
            <div
              className="h-full bg-birch"
              style={{ width: `${i < index ? 100 : i === index ? progress : 0}%` }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 px-4 py-3">
        <span className="font-display italic text-lg text-birch">{firstName}</span>
        <button onClick={onClose} className="ml-auto text-birch/80 hover:text-birch p-1" aria-label="Close">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div className="relative flex-1">
        <Image src={getApiUrl(current.media_url)} alt="" fill className="object-contain" />

        <button
          aria-label="Previous"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="absolute left-0 top-0 h-full w-1/3"
        />
        <button
          aria-label="Next"
          onClick={() => (index < stories.length - 1 ? setIndex((i) => i + 1) : onClose())}
          className="absolute right-0 top-0 h-full w-1/3"
        />

        {current.caption && (
          <p className="absolute bottom-6 left-0 right-0 text-center text-birch text-sm px-6">
            {current.caption}
          </p>
        )}
      </div>
    </div>
  );
}
