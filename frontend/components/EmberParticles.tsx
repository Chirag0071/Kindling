"use client";

import { useEffect, useState } from "react";

interface Props {
  count?: number;
  className?: string;
}

interface Particle {
  id: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
}

/**
 * Slow-drifting warm particles, like sparks rising from a low fire.
 * Deliberately restrained: low opacity, slow, and only used on the
 * auth screen and the match ("spark") moment - not everywhere.
 * Respects prefers-reduced-motion via the global stylesheet.
 *
 * NOTE: particles are generated client-side only, after mount, via
 * useEffect - not with useMemo during render. Math.random() during
 * render runs once at SSR time and again at hydration time, producing
 * two different sets of numbers and triggering a hydration mismatch
 * (this was a real bug: React correctly refused to reconcile the
 * server-rendered positions against the client-recomputed ones). The
 * server now renders an empty container; particles fade in client-side
 * after mount, which is invisible to the user given how subtle this
 * effect already is.
 */
export default function EmberParticles({ count = 14, className = "" }: Props) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    setParticles(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 2 + Math.random() * 3,
        delay: Math.random() * 7,
        duration: 5 + Math.random() * 4,
        color: i % 3 === 0 ? "#F4C463" : "#E17A47",
      }))
    );
  }, [count]);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute bottom-0 rounded-full animate-drift"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
}
