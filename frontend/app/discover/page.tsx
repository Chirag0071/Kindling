"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { matching, safety, getApiUrl, ApiError } from "@/lib/api";
import MatchModal from "@/components/MatchModal";
import NavBar from "@/components/NavBar";
import Button from "@/components/Button";
import type { DiscoverProfile } from "@/lib/types";

type ContentBlock =
  | { kind: "prompt"; key: string; prompt: string; answer: string }
  | { kind: "photo"; key: string; url: string }
  | { kind: "stats"; key: string };

function buildContentStream(p: DiscoverProfile): ContentBlock[] {
  const prompts = p.prompts.map((pr, i) => ({
    kind: "prompt" as const, key: `prompt-${i}`, prompt: pr.prompt, answer: pr.answer,
  }));
  const photos = p.photos.map((url, i) => ({ kind: "photo" as const, key: `photo-${i}`, url }));

  const blocks: ContentBlock[] = [];
  if (prompts[0]) blocks.push(prompts[0]);
  if (photos[0]) blocks.push(photos[0]);
  blocks.push({ kind: "stats", key: "stats" });

  // Interleave whatever's left, alternating photo/prompt so it never runs
  // several of the same type in a row.
  let pi = 1, phi = 1;
  while (pi < prompts.length || phi < photos.length) {
    if (phi < photos.length) blocks.push(photos[phi++]);
    if (pi < prompts.length) blocks.push(prompts[pi++]);
  }
  return blocks;
}

function LikeButton({ onLike }: { onLike: (comment: string) => void }) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (open) {
    return (
      <div
        className="absolute inset-x-3 bottom-3 bg-dusk-deep/95 backdrop-blur-sm rounded-2xl p-2.5 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment (optional)"
          maxLength={140}
          className="flex-1 bg-transparent text-sm text-birch placeholder:text-slate focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") onLike(comment.trim());
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <button
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-slate hover:text-birch"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <button
          onClick={() => onLike(comment.trim())}
          aria-label="Send like"
          className="h-8 w-8 shrink-0 rounded-full bg-ember flex items-center justify-center text-birch hover:bg-ember-dim transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5c-4-3-8-6.5-8-10.5a4.5 4.5 0 018-2.5 4.5 4.5 0 018 2.5c0 4-4 7.5-8 10.5z" /></svg>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      aria-label="Like this"
      className="absolute bottom-3 right-3 h-11 w-11 rounded-full bg-dusk-deep/80 backdrop-blur-sm flex items-center justify-center
        text-ember hover:bg-ember hover:text-birch transition-colors shadow-[0_4px_16px_rgba(0,0,0,0.15)]"
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5c-4-3-8-6.5-8-10.5a4.5 4.5 0 018-2.5 4.5 4.5 0 018 2.5c0 4-4 7.5-8 10.5z" /></svg>
    </button>
  );
}

export default function DiscoverPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [deck, setDeck] = useState<DiscoverProfile[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [match, setMatch] = useState<{ matchId: string; theirPhoto: string | null; theirName: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (!profile || !profile.is_complete) { router.replace("/onboarding"); return; }
  }, [loading, user, profile, router]);

  const loadDeck = useCallback(async () => {
    setFetching(true);
    setError("");
    try {
      const results = await matching.discover(20);
      setDeck(results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load new people right now.");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (user && profile?.is_complete) loadDeck();
  }, [user, profile, loadDeck]);

  const current = deck[0];

  const advance = () => {
    setMenuOpen(false);
    setDeck((d) => d.slice(1));
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const handleLike = async (comment: string) => {
    if (!current) return;
    const target = current;
    advance();
    try {
      const result = await matching.like(target.user_id, comment || undefined);
      if (result.matched && result.match_id) {
        setMatch({
          matchId: result.match_id,
          theirPhoto: target.photos[0] || null,
          theirName: target.first_name,
        });
      }
    } catch {
      // profile's already been advanced past - nothing useful to block the UI on here
    }
  };

  const handlePass = async () => {
    if (!current) return;
    const target = current;
    advance();
    try {
      await matching.pass(target.user_id);
    } catch {
      // same as above
    }
  };

  const handleReport = async () => {
    if (!current) return;
    const reason = window.prompt("What's going on? A short reason helps us review this.");
    if (reason === null) return;
    try {
      await safety.report(current.user_id, reason.trim() || "unspecified", undefined, true);
    } catch {
      // best-effort - either way the person is about to be advanced past
    }
    handlePass();
  };

  if (loading || !profile?.is_complete) return null;

  const blocks = current ? buildContentStream(current) : [];

  return (
    <main className="min-h-screen bg-dusk pb-24">
      <div className="sticky top-0 z-20 bg-dusk/90 backdrop-blur-sm border-b border-ash px-5 py-4 flex items-center justify-between">
        <h1 className="font-display italic text-xl text-birch">
          {current ? current.first_name : "Kindling"}
        </h1>
        {current && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More options"
              className="h-8 w-8 rounded-full flex items-center justify-center text-slate hover:text-birch hover:bg-ash/60"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 w-40 bg-dusk-deep border border-ash rounded-xl overflow-hidden shadow-lg">
                <button
                  onClick={handleReport}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50"
                >
                  Report
                </button>
                <button
                  onClick={handlePass}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate hover:bg-ash/60"
                >
                  Skip
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="mx-auto max-w-md px-4 pt-4">
        {fetching ? (
          <div className="flex h-[60vh] items-center justify-center text-slate font-mono text-sm">
            finding sparks nearby···
          </div>
        ) : error ? (
          <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center px-4">
            <p className="text-slate text-sm">{error}</p>
            <Button variant="secondary" onClick={loadDeck}>Try again</Button>
          </div>
        ) : !current ? (
          <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center px-4">
            <p className="font-display italic text-xl text-birch">No one new nearby right now</p>
            <p className="text-slate text-sm">Check back soon — new people join all the time.</p>
            <Button variant="secondary" onClick={loadDeck} className="mt-4">Refresh</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {blocks.map((block) => {
              if (block.kind === "prompt") {
                return (
                  <div key={block.key} className="relative bg-dusk-deep border border-ash rounded-2xl p-5 pb-16">
                    <p className="font-mono text-xs text-slate mb-2">{block.prompt}</p>
                    <p className="font-display text-xl text-birch italic">{block.answer}</p>
                    <LikeButton onLike={handleLike} />
                  </div>
                );
              }
              if (block.kind === "photo") {
                return (
                  <div key={block.key} className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-dusk-deep">
                    <Image src={getApiUrl(block.url)} alt="" fill className="object-cover" />
                    <LikeButton onLike={handleLike} />
                  </div>
                );
              }
              return (
                <div key={block.key} className="bg-dusk-deep border border-ash rounded-2xl p-5 flex items-center gap-6">
                  <div className="text-center">
                    <p className="font-display text-2xl text-birch">{current.age}</p>
                    <p className="text-[10px] font-mono text-slate uppercase tracking-wide">Age</p>
                  </div>
                  {current.bio && (
                    <p className="text-sm text-birch/90 flex-1 line-clamp-3">{current.bio}</p>
                  )}
                </div>
              );
            })}

            <div className="h-4" />
          </div>
        )}
      </div>

      {current && !fetching && !error && (
        <button
          onClick={handlePass}
          aria-label="Pass on this profile"
          className="fixed left-5 bottom-24 z-20 h-14 w-14 rounded-full bg-dusk-deep border border-ash flex items-center justify-center
            text-slate hover:border-red-400 hover:text-red-500 transition-colors shadow-[0_4px_16px_rgba(0,0,0,0.15)]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}

      {match && (
        <MatchModal
          myPhoto={null}
          theirPhoto={match.theirPhoto}
          theirName={match.theirName}
          onSayHello={() => router.push(`/chat/${match.matchId}`)}
          onKeepBrowsing={() => setMatch(null)}
        />
      )}

      <NavBar />
    </main>
  );
}