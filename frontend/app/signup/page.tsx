"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { Input } from "@/components/Input";
import Button from "@/components/Button";
import EmberParticles from "@/components/EmberParticles";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password needs to be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await signup(email, password);
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-dusk px-6">
      <EmberParticles count={16} />
      <div className="relative z-10 w-full max-w-sm">
        <h1 className="font-display italic text-4xl text-birch text-center mb-1">Kindling</h1>
        <p className="text-slate text-center text-sm mb-10">Start something real.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="email"
            type="email"
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            id="password"
            type="password"
            label="Password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          <Button type="submit" loading={loading} className="w-full mt-2">
            Create account
          </Button>
        </form>

        <p className="text-center text-sm text-slate mt-8">
          Already have an account?{" "}
          <Link href="/login" className="text-ember hover:text-spark transition-colors">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
