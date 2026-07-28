"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import EmberParticles from "@/components/EmberParticles";

export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!profile || !profile.is_complete) router.replace("/onboarding");
    else router.replace("/discover");
  }, [loading, user, profile, router]);

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-dusk overflow-hidden">
      <EmberParticles count={20} />
      <h1 className="font-display italic text-4xl text-birch tracking-tight z-10">Kindling</h1>
    </main>
  );
}
