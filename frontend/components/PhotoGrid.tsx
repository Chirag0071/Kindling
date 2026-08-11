"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { photos as photosApi, getApiUrl, ApiError } from "@/lib/api";
import type { Photo } from "@/lib/types";
import MediaLightbox from "@/components/MediaLightbox";

interface Props {
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
  maxPhotos?: number;
}

export default function PhotoGrid({ photos, onChange, maxPhotos = 6 }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const photo = await photosApi.upload(file);
      onChange([...photos, photo]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload that photo.");
    } finally {
      setUploading(false);
    }
  };

  const handleSetPrimary = async (photoId: string) => {
    const updated = await photosApi.setPrimary(photoId);
    onChange(photos.map((p) => ({ ...p, is_primary: p.id === updated.id })));
  };

  const handleDelete = async (photoId: string) => {
    await photosApi.remove(photoId);
    const remaining = photos.filter((p) => p.id !== photoId);
    onChange(remaining);
  };

  const slots = Array.from({ length: maxPhotos }, (_, i) => photos[i] || null);
  const lightboxItems = photos.map((p) => ({ url: p.url, isVideo: false }));

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5">
        {slots.map((photo, i) =>
          photo ? (
            <div key={photo.id} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-dusk-deep group">
              <button
                type="button"
                onClick={() => setLightboxIndex(photos.findIndex((p) => p.id === photo.id))}
                className="absolute inset-0 z-0"
                aria-label="View photo full size"
              >
                <Image src={getApiUrl(photo.url)} alt="" fill className="object-cover" />
              </button>
              {photo.is_primary && (
                <span className="absolute top-1.5 left-1.5 rounded-full bg-ember/90 px-2 py-0.5 text-[10px] font-mono text-birch pointer-events-none">
                  MAIN
                </span>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-dusk-deep/0 opacity-0 group-hover:opacity-100 group-hover:bg-dusk-deep/60 transition-all pointer-events-none">
                {!photo.is_primary && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleSetPrimary(photo.id); }}
                    className="pointer-events-auto text-[11px] font-sans text-birch bg-dusk/80 rounded-full px-2.5 py-1 hover:bg-ember/80"
                  >
                    Set as main
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(photo.id); }}
                  className="pointer-events-auto text-[11px] font-sans text-red-500 bg-dusk/80 rounded-full px-2.5 py-1 hover:bg-red-100"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              key={i}
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="aspect-[3/4] rounded-xl border border-dashed border-ash flex items-center justify-center
                text-slate hover:border-ember hover:text-ember transition-colors disabled:opacity-50"
            >
              <span className="text-2xl font-display">+</span>
            </button>
          )
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      <p className="mt-2 text-xs text-slate font-mono">
        {photos.length}/{maxPhotos} photos · tap a square to view full size, hover to manage
      </p>

      {lightboxIndex !== null && (
        <MediaLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}