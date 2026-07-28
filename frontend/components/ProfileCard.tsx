"use client";

import { useState } from "react";
import Image from "next/image";
import { getApiUrl } from "@/lib/api";
import type { DiscoverProfile } from "@/lib/types";

export default function ProfileCard({ profile }: { profile: DiscoverProfile }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<Set<number>>(new Set());
  const hasPhotos = profile.photos.length > 0 && !failedPhotos.has(photoIndex);

  return (
    <div className="relative h-full w-full rounded-card overflow-hidden bg-dusk-deep select-none">
      {hasPhotos ? (
        <Image
          src={getApiUrl(profile.photos[photoIndex])}
          alt={profile.first_name}
          fill
          className="object-cover"
          draggable={false}
          onError={() => setFailedPhotos((prev) => new Set(prev).add(photoIndex))}
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-ash">
          <span className="font-display italic text-3xl text-slate">{profile.first_name}</span>
        </div>
      )}

      {profile.photos.length > 1 && (
        <div className="absolute top-3 left-3 right-3 flex gap-1.5">
          {profile.photos.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setPhotoIndex(i); }}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i === photoIndex ? "bg-birch" : "bg-birch/30"
              }`}
            />
          ))}
        </div>
      )}

      {profile.photos.length > 1 && (
        <>
          <button
            aria-label="Previous photo"
            onClick={(e) => { e.stopPropagation(); setPhotoIndex((i) => Math.max(0, i - 1)); }}
            className="absolute left-0 top-0 h-full w-1/3"
          />
          <button
            aria-label="Next photo"
            onClick={(e) => { e.stopPropagation(); setPhotoIndex((i) => Math.min(profile.photos.length - 1, i + 1)); }}
            className="absolute right-0 top-0 h-full w-1/3"
          />
        </>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-dusk-deep via-dusk-deep/80 to-transparent p-5 pt-16">
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-2xl text-birch">{profile.first_name}</h2>
          <span className="font-sans text-lg text-birch/90">{profile.age}</span>
        </div>
        {profile.bio && <p className="text-sm text-birch/90 mt-2 line-clamp-2">{profile.bio}</p>}
        {profile.prompts.slice(0, 1).map((p, i) => (
          <div key={i} className="mt-3 rounded-xl bg-dusk/60 border border-ash px-3.5 py-2.5">
            <p className="text-[11px] font-mono uppercase tracking-wide text-slate">{p.prompt}</p>
            <p className="text-sm text-birch mt-0.5">{p.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
