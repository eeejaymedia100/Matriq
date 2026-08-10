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
import type { ExecutiveProfile, User } from "@/types/api";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface LoginResult {
  mfaRequired: boolean;
  challengeToken?: string;
}

interface SessionContextValue {
  status: SessionStatus;
  user: User | null;
  executives: ExecutiveProfile[];
  token: string | null;
  associationId: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeLogin: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  selectAssociation: (id: string) => void;
  refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const ASSOCIATION_KEY = "matriq_associationId";

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [executives, setExecutives] = useState<ExecutiveProfile[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [associationId, setAssociationIdState] = useState<string | null>(null);

  const applySession = useCallback((data: {
    user?: User | null;
    token?: string | null;
    executives?: ExecutiveProfile[];
  }) => {
    const userData = data.user ?? null;
    setUser(userData);
    setToken(data.token ?? null);
    const execs = data.executives ?? [];
    setExecutives(execs);

    // Auto association detection: exactly one → select it.
    const stored = typeof window !== "undefined"
      ? localStorage.getItem(ASSOCIATION_KEY)
      : null;
    if (execs.length === 1) {
      setAssociationIdState(execs[0].associationId);
    } else if (
      stored &&
      execs.some((e) => e.associationId === stored)
    ) {
      setAssociationIdState(stored);
    } else {
      setAssociationIdState(null);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        applySession({
          user: data.user,
          token: data.token,
          executives: data.user?.executive ?? [],
        });
        setStatus("authenticated");
      } else {
        setStatus("unauthenticated");
        setUser(null);
        setToken(null);
        setExecutives([]);
        setAssociationIdState(null);
      }
    } catch {
      setStatus("unauthenticated");
    }
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.user) {
          applySession({
            user: data.user,
            token: data.token,
            executives: data.user?.executive ?? [],
          });
          setStatus("authenticated");
        } else {
          setStatus("unauthenticated");
          setUser(null);
          setToken(null);
          setExecutives([]);
          setAssociationIdState(null);
        }
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

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
    setStatus("unauthenticated");
    setUser(null);
    setToken(null);
    setExecutives([]);
    setAssociationIdState(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(ASSOCIATION_KEY);
    }
    router.push("/login");
  }, [router]);

  const selectAssociation = useCallback((id: string) => {
    setAssociationIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(ASSOCIATION_KEY, id);
    }
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      executives,
      token,
      associationId,
      login,
      completeLogin,
      logout,
      selectAssociation,
      refreshSession,
    }),
    [
      status,
      user,
      executives,
      token,
      associationId,
      login,
      completeLogin,
      logout,
      selectAssociation,
      refreshSession,
    ],
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
