"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, PanInfo, useAnimation } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { matching, ApiError } from "@/lib/api";
import ProfileCard from "@/components/ProfileCard";
import MatchModal from "@/components/MatchModal";
import NavBar from "@/components/NavBar";
import Button from "@/components/Button";
import type { DiscoverProfile } from "@/lib/types";

export default function DiscoverPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [deck, setDeck] = useState<DiscoverProfile[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [match, setMatch] = useState<{ matchId: string; theirPhoto: string | null; theirName: string } | null>(null);
  const controls = useAnimation();

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

  const act = async (action: "like" | "pass") => {
    if (!current) return;
    const target = current;
    setDeck((d) => d.slice(1));
    try {
      if (action === "like") {
        const result = await matching.like(target.user_id);
        if (result.matched && result.match_id) {
          setMatch({
            matchId: result.match_id,
            theirPhoto: target.photos[0] || null,
            theirName: target.first_name,
          });
        }
      } else {
        await matching.pass(target.user_id);
      }
    } catch {
      // swallow — the card is already gone from the deck, no need to block the UI on a swipe-action failure
    }
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 120) {
      controls.start({ x: 500, opacity: 0, rotate: 15, transition: { duration: 0.3 } }).then(() => {
        controls.set({ x: 0, opacity: 1, rotate: 0 });
        act("like");
      });
    } else if (info.offset.x < -120) {
      controls.start({ x: -500, opacity: 0, rotate: -15, transition: { duration: 0.3 } }).then(() => {
        controls.set({ x: 0, opacity: 1, rotate: 0 });
        act("pass");
      });
    } else {
      controls.start({ x: 0, rotate: 0, transition: { type: "spring", stiffness: 400, damping: 30 } });
    }
  };

  if (loading || !profile?.is_complete) return null;

  return (
    <main className="min-h-screen bg-dusk px-5 pt-8 pb-28">
      <div className="mx-auto max-w-md">
        <h1 className="font-display italic text-2xl text-birch mb-6">Kindling</h1>

        <div className="relative h-[560px]">
          {fetching ? (
            <div className="flex h-full items-center justify-center text-slate font-mono text-sm">
              finding sparks nearby···
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center px-4">
              <p className="text-slate text-sm">{error}</p>
              <Button variant="secondary" onClick={loadDeck}>Try again</Button>
            </div>
          ) : !current ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center px-4">
              <p className="font-display italic text-xl text-birch">No one new nearby right now</p>
              <p className="text-slate text-sm">Check back soon — new people join all the time.</p>
              <Button variant="secondary" onClick={loadDeck} className="mt-4">Refresh</Button>
            </div>
          ) : (
            <>
              {deck[1] && (
                <div className="absolute inset-0 scale-[0.96] opacity-60">
                  <ProfileCard profile={deck[1]} />
                </div>
              )}
              <motion.div
                key={current.user_id}
                className="absolute inset-0 cursor-grab active:cursor-grabbing"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                animate={controls}
                onDragEnd={handleDragEnd}
              >
                <ProfileCard profile={current} />
              </motion.div>
            </>
          )}
        </div>

        {current && !fetching && !error && (
          <div className="mt-6 flex items-center justify-center gap-5">
            <button
              onClick={() => act("pass")}
              aria-label="Pass"
              className="h-14 w-14 rounded-full border border-ash flex items-center justify-center text-slate hover:border-red-400 hover:text-red-300 transition-colors"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <button
              onClick={() => act("like")}
              aria-label="Like"
              className="h-16 w-16 rounded-full bg-ember flex items-center justify-center text-birch hover:bg-ember-dim transition-colors shadow-[0_0_24px_rgba(225,122,71,0.35)]"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5c-4-3-8-6.5-8-10.5a4.5 4.5 0 018-2.5 4.5 4.5 0 018 2.5c0 4-4 7.5-8 10.5z" /></svg>
            </button>
          </div>
        )}
      </div>

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
