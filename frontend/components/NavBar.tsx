"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { matching } from "@/lib/api";

const tabs = [
  { href: "/discover", label: "Discover", icon: DiscoverIcon },
  { href: "/matches", label: "Matches", icon: MatchesIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
];

export default function NavBar() {
  const pathname = usePathname();
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkUnread = () => {
      matching.matches()
        .then((matches) => { if (!cancelled) setHasUnread(matches.some((m) => m.has_unread)); })
        .catch(() => {});
    };

    checkUnread();
    // Simple polling rather than a push mechanism - matches the note in the
    // README about closure events not pushing over the socket yet either.
    // Fine at this scale; worth replacing with a real-time signal later.
    const interval = setInterval(checkUnread, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [pathname]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-ash bg-dusk-deep/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-around px-4 py-2.5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-colors
                ${active ? "text-ember" : "text-slate hover:text-birch"}`}
            >
              <Icon active={!!active} />
              {href === "/matches" && hasUnread && (
                <span className="absolute top-0 right-2 h-2 w-2 rounded-full bg-ember" />
              )}
              <span className="text-xs font-sans">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function DiscoverIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-3.5 1.5L10 14l3.5-1.5L15 9z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MatchesIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <path d="M12 20.5c-4-3-8-6.5-8-10.5a4.5 4.5 0 018-2.5 4.5 4.5 0 018 2.5c0 4-4 7.5-8 10.5z" />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.5-4 4-6 7-6s5.5 2 7 6" />
    </svg>
  );
}
