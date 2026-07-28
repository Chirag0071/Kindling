"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, profile as profileApi, setToken, clearToken, ApiError } from "./api";
import type { User, Profile } from "./types";

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadSession = useCallback(async () => {
    if (typeof window === "undefined" || !localStorage.getItem("kindling_token")) {
      setLoading(false);
      return;
    }
    try {
      const me = await auth.me();
      setUser(me);
      try {
        const p = await profileApi.me();
        setProfile(p);
      } catch {
        setProfile(null); // no profile created yet — fine, onboarding will handle it
      }
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = async (email: string, password: string) => {
    const { access_token } = await auth.login(email, password);
    setToken(access_token);
    await loadSession();
  };

  const signup = async (email: string, password: string) => {
    const { access_token } = await auth.signup(email, password);
    setToken(access_token);
    await loadSession();
  };

  const logout = () => {
    clearToken();
    setUser(null);
    setProfile(null);
    router.push("/login");
  };

  const refreshProfile = async () => {
    try {
      const p = await profileApi.me();
      setProfile(p);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setProfile(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, signup, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
