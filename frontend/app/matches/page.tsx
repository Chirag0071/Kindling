"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { matching, ApiError } from "@/lib/api";
import NavBar from "@/components/NavBar";
import StoryBar from "@/components/StoryBar";
import Avatar from "@/components/Avatar";
import type { MatchWithProfile } from "@/lib/types";

export default function MatchesPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<MatchWithProfile[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (!profile || !profile.is_complete) { router.replace("/onboarding"); return; }
  }, [loading, user, profile, router]);

  useEffect(() => {
    if (!user || !profile?.is_complete) return;
    matching.matches()
      .then(setMatches)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load matches."))
      .finally(() => setFetching(false));
  }, [user, profile]);

  if (loading || !profile?.is_complete) return null;

  return (
    <main className="min-h-screen bg-dusk px-5 pt-8 pb-28">
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-2xl text-birch mb-6">Matches &amp; chats</h1>
        <StoryBar />

        {fetching ? (
          <p className="text-slate font-mono text-sm">loading···</p>
        ) : error ? (
          <p className="text-red-500 text-sm">{error}</p>
        ) : matches.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-display italic text-xl text-birch mb-2">No matches yet</p>
            <p className="text-slate text-sm">Keep discovering — your first spark is out there.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => router.push(`/chat/${m.id}`)}
                  className="w-full flex items-center gap-3.5 rounded-2xl border border-ash bg-dusk-deep px-3.5 py-3 hover:border-ember transition-colors text-left"
                >
                  <div className="relative h-14 w-14 shrink-0">
                    <Avatar
                      url={m.other_photo_url}
                      name={m.other_first_name}
                      className="h-14 w-14 rounded-full"
                      textClassName="text-lg"
                    />
                    {m.has_unread && (
                      <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-ember border-2 border-dusk-deep" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`font-sans truncate ${m.has_unread ? "font-semibold text-birch" : "font-medium text-birch"}`}>
                        {m.other_first_name}
                      </p>
                      <span className="text-[11px] text-slate font-mono shrink-0">
                        {new Date(m.last_message_at || m.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <p className={`text-sm truncate ${m.has_unread ? "text-birch" : "text-slate"}`}>
                      {m.last_message_preview || "Say hello — that's how it starts."}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <NavBar />
    </main>
  );
}