"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { photos as photosApi, getApiUrl } from "@/lib/api";
import Button from "@/components/Button";
import NavBar from "@/components/NavBar";
import Avatar from "@/components/Avatar";
import type { Photo } from "@/lib/types";

export default function ProfilePage() {
  const { user, profile, loading, logout } = useAuth();
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (!profile || !profile.is_complete) { router.replace("/onboarding"); return; }
  }, [loading, user, profile, router]);

  useEffect(() => {
    if (user && profile?.is_complete) photosApi.list().then(setPhotos).catch(() => {});
  }, [user, profile]);

  if (loading || !profile?.is_complete) return null;

  const primary = photos.find((p) => p.is_primary) || photos[0];

  return (
    <main className="min-h-screen bg-dusk px-5 pt-8 pb-28">
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-4 mb-6">
          <Avatar
            url={primary?.url}
            name={profile.first_name}
            className="h-20 w-20 rounded-full shrink-0"
            textClassName="text-2xl"
          />
          <div>
            <h1 className="font-display text-2xl text-birch">{profile.first_name}</h1>
            <p className="text-slate text-sm">{user?.email}</p>
          </div>
        </div>

        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-6">
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-dusk-deep">
                <Image src={getApiUrl(p.url)} alt="" fill className="object-cover" />
              </div>
            ))}
          </div>
        )}

        {profile.bio && (
          <div className="mb-4">
            <p className="font-mono text-xs uppercase tracking-wider text-slate mb-1.5">Bio</p>
            <p className="text-birch text-sm">{profile.bio}</p>
          </div>
        )}

        {profile.prompts.map((p, i) => (
          <div key={i} className="rounded-xl bg-dusk-deep border border-ash px-3.5 py-2.5 mb-2.5">
            <p className="text-[11px] font-mono uppercase tracking-wide text-slate">{p.prompt}</p>
            <p className="text-sm text-birch mt-0.5">{p.answer}</p>
          </div>
        ))}

        <div className="mt-8 space-y-3">
          <Button variant="secondary" className="w-full" onClick={() => router.push("/onboarding")}>
            Edit profile
          </Button>
          <Button variant="ghost" className="w-full" onClick={logout}>
            Log out
          </Button>
        </div>
      </div>
      <NavBar />
    </main>
  );
}
