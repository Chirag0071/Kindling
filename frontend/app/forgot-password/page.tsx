"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { auth, ApiError } from "@/lib/api";
import { Input } from "@/components/Input";
import Button from "@/components/Button";
import EmberParticles from "@/components/EmberParticles";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await auth.forgotPassword(email);
      // Always show the same success state regardless of whether the email
      // was actually registered - the backend intentionally doesn't reveal
      // that either, so mirroring a different behavior here would leak it
      // right back through the UI.
      setSent(true);
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
        <p className="text-slate text-center text-sm mb-10">Reset your password</p>

        {sent ? (
          <div className="text-center space-y-4">
            <p className="text-birch text-sm">
              If an account exists for <span className="text-ember">{email}</span>, a reset
              link is on its way. Check your inbox (and spam folder) - it expires in an hour.
            </p>
            <Link href="/login" className="inline-block text-sm text-ember hover:text-spark transition-colors">
              Back to log in
            </Link>
          </div>
        ) : (
          <>
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
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" loading={loading} className="w-full mt-2">
                Send reset link
              </Button>
            </form>
            <p className="text-center text-sm text-slate mt-8">
              <Link href="/login" className="text-ember hover:text-spark transition-colors">
                Back to log in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}