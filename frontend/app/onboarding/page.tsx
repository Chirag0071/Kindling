"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { profile as profileApi, photos as photosApi, ApiError } from "@/lib/api";
import { Input, TextArea } from "@/components/Input";
import Button from "@/components/Button";
import PhotoGrid from "@/components/PhotoGrid";
import type { Gender, Photo, PromptAnswer } from "@/lib/types";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "man", label: "Man" },
  { value: "woman", label: "Woman" },
  { value: "nonbinary", label: "Nonbinary" },
  { value: "other", label: "Other" },
];

const PROMPT_OPTIONS = [
  "My simple pleasures",
  "The way to win me over is",
  "Two truths and a lie",
  "I'm looking for",
  "A life goal of mine",
  "My most controversial opinion",
];

export default function OnboardingPage() {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<Gender>("woman");
  const [genderPref, setGenderPref] = useState<Gender[]>(["man"]);
  const [bio, setBio] = useState("");
  const [prompts, setPrompts] = useState<PromptAnswer[]>([
    { prompt: PROMPT_OPTIONS[0], answer: "" },
    { prompt: PROMPT_OPTIONS[1], answer: "" },
  ]);
  const [ageMin, setAgeMin] = useState(21);
  const [ageMax, setAgeMax] = useState(40);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name);
      setBirthdate(profile.birthdate.slice(0, 10));
      setGender(profile.gender);
      setGenderPref(profile.gender_preference);
      setBio(profile.bio);
      if (profile.prompts.length) setPrompts(profile.prompts);
      setAgeMin(profile.age_min);
      setAgeMax(profile.age_max);
      if (profile.latitude && profile.longitude) {
        setLocation({ lat: profile.latitude, lng: profile.longitude });
      }
    }
    photosApi.list().then(setPhotos).catch(() => {});
  }, [profile]);

  useEffect(() => {
    if (location || typeof window === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {} // silently ignore — location stays optional
    );
  }, [location]);

  const toggleGenderPref = (g: Gender) => {
    setGenderPref((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  const updatePrompt = (i: number, field: "prompt" | "answer", value: string) => {
    setPrompts((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!firstName.trim() || !birthdate || genderPref.length === 0) {
      setError("Fill in your name, birthdate, and who you're open to meeting.");
      return;
    }
    if (photos.length === 0) {
      setError("Add at least one photo so people can see who you are.");
      return;
    }

    setLoading(true);
    try {
      await profileApi.upsert({
        first_name: firstName.trim(),
        birthdate: new Date(birthdate).toISOString(),
        gender,
        gender_preference: genderPref,
        bio: bio.trim(),
        prompts: prompts.filter((p) => p.answer.trim()),
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        age_min: ageMin,
        age_max: ageMax,
      });
      await refreshProfile();
      router.push("/discover");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-dusk px-6 py-10 pb-24">
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-3xl text-birch mb-1">Tell us about you</h1>
        <p className="text-slate text-sm mb-8">This is what people see first — make it feel like you.</p>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="space-y-4">
            <h2 className="font-mono text-xs uppercase tracking-wider text-slate">Photos</h2>
            <PhotoGrid photos={photos} onChange={setPhotos} />
          </section>

          <section className="space-y-4">
            <h2 className="font-mono text-xs uppercase tracking-wider text-slate">Basics</h2>
            <Input
              id="firstName"
              label="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <Input
              id="birthdate"
              type="date"
              label="Birthdate"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              required
              max={new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().slice(0, 10)}
            />
            <div>
              <label className="block text-sm text-slate mb-1.5">You are</label>
              <div className="flex flex-wrap gap-2">
                {GENDERS.map((g) => (
                  <button
                    type="button"
                    key={g.value}
                    onClick={() => setGender(g.value)}
                    className={`rounded-full px-4 py-2 text-sm border transition-colors ${
                      gender === g.value
                        ? "bg-ember border-ember text-birch"
                        : "border-ash text-slate hover:border-slate"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate mb-1.5">Open to meeting</label>
              <div className="flex flex-wrap gap-2">
                {GENDERS.map((g) => (
                  <button
                    type="button"
                    key={g.value}
                    onClick={() => toggleGenderPref(g.value)}
                    className={`rounded-full px-4 py-2 text-sm border transition-colors ${
                      genderPref.includes(g.value)
                        ? "bg-ember border-ember text-birch"
                        : "border-ash text-slate hover:border-slate"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-mono text-xs uppercase tracking-wider text-slate">About you</h2>
            <TextArea
              id="bio"
              label="Bio"
              rows={3}
              maxLength={300}
              placeholder="What should people know about you?"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
            {prompts.map((p, i) => (
              <div key={i} className="space-y-1.5">
                <select
                  value={p.prompt}
                  onChange={(e) => updatePrompt(i, "prompt", e.target.value)}
                  className="w-full rounded-2xl bg-dusk-deep border border-ash px-4 py-2.5 text-birch text-sm focus:border-ember focus:outline-none"
                >
                  {PROMPT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <Input
                  placeholder="Your answer"
                  value={p.answer}
                  onChange={(e) => updatePrompt(i, "answer", e.target.value)}
                  maxLength={150}
                />
              </div>
            ))}
          </section>

          <section className="space-y-4">
            <h2 className="font-mono text-xs uppercase tracking-wider text-slate">Preferences</h2>
            <div className="flex gap-4">
              <Input
                type="number"
                label="Min age"
                value={ageMin}
                onChange={(e) => setAgeMin(Number(e.target.value))}
                min={18}
                max={99}
              />
              <Input
                type="number"
                label="Max age"
                value={ageMax}
                onChange={(e) => setAgeMax(Number(e.target.value))}
                min={18}
                max={99}
              />
            </div>
          </section>

          {error && <p className="text-sm text-red-300">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">
            Continue to Kindling
          </Button>
        </form>
      </div>
    </main>
  );
}
