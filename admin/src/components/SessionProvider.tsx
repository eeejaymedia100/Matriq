"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { AdminIdentity } from "@/types/api";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface LoginResult {
  mfaRequired: boolean;
  challengeToken?: string;
}

interface SessionContextValue {
  status: SessionStatus;
  admin: AdminIdentity | null;
  token: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeLogin: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const applySession = useCallback((data: {
    admin?: AdminIdentity | null;
    token?: string | null;
  }) => {
    setAdmin(data.admin ?? null);
    setToken(data.token ?? null);
  }, []);

  const clearSession = useCallback(() => {
    setStatus("unauthenticated");
    setAdmin(null);
    setToken(null);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        applySession({ admin: data.admin, token: data.token });
        setStatus("authenticated");
      } else {
        clearSession();
      }
    } catch {
      clearSession();
    }
  }, [applySession, clearSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.admin) {
          applySession({ admin: data.admin, token: data.token });
          setStatus("authenticated");
        } else {
          clearSession();
        }
      } catch {
        if (!cancelled) clearSession();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Login failed");
    }
    if (data.mfaRequired) {
      return { mfaRequired: true, challengeToken: data.challengeToken };
    }
    await refreshSession();
    return { mfaRequired: false };
  }, [refreshSession]);

  const completeLogin = useCallback(
    async (challengeToken: string, code: string) => {
      const res = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Invalid code");
      }
      await refreshSession();
    },
    [refreshSession],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore — clear local state regardless.
    }
    clearSession();
    router.push("/login");
  }, [router, clearSession]);

  const value = useMemo(
    () => ({
      status,
      admin,
      token,
      login,
      completeLogin,
      logout,
      refreshSession,
    }),
    [status, admin, token, login, completeLogin, logout, refreshSession],
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}