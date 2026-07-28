"use client";

import { useState } from "react";
import Image from "next/image";
import { getApiUrl } from "@/lib/api";

interface Props {
  url: string | null | undefined;
  name: string;
  className?: string;
  textClassName?: string;
}

/**
 * Renders a profile photo, falling back to the person's initial whenever
 * there's no photo, or the photo fails to load (e.g. the file no longer
 * exists on the storage backend). Without the onError handler here, a
 * missing file just renders as a blank/broken image with no fallback.
 */
export default function Avatar({ url, name, className = "", textClassName = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!url && !failed;

  return (
    <div className={`relative overflow-hidden bg-ash ${className}`}>
      {showPhoto ? (
        <Image
          src={getApiUrl(url as string)}
          alt={name}
          fill
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className={`flex h-full w-full items-center justify-center font-display text-slate ${textClassName}`}>
          {name ? name[0] : "?"}
        </div>
      )}
    </div>
  );
}
