import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { api, saveTokens, clearTokens, getTokens, API_BASE } from "../api/client";
import type { AuthResponse, User, VerificationRequest } from "../types/api";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface LoginResult {
  mfaRequired: boolean;
  challengeToken?: string;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<LoginResult>;
  completeMfaLogin: (challengeToken: string, code: string) => Promise<void>;
  registerStaylite: (data: StayliteData) => Promise<string>;
  registerFresher: (data: FresherData) => Promise<string>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  uploadVerification: (associationId: string, fileUri: string, fileName: string) => Promise<{ id: string; status: string }>;
  getVerificationStatus: () => Promise<VerificationRequest[]>;
}

export interface StayliteData {
  email: string;
  password: string;
  fullName: string;
  matricNumber: string;
  faculty: string;
  department: string;
  level: string;
  privacyPolicyVersion: string;
  termsVersion: string;
}

export interface FresherData {
  email: string;
  password: string;
  fullName: string;
  jambNumber: string;
  faculty: string;
  department: string;
  privacyPolicyVersion: string;
  termsVersion: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Try to restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const tokens = await getTokens();
        if (tokens?.accessToken) {
          const user = await api.get<User>("/me");
          setState({
            user,
            isLoading: false,
            isAuthenticated: true,
          });
        } else {
          setState((s) => ({ ...s, isLoading: false }));
        }
      } catch {
        await clearTokens();
        setState((s) => ({ ...s, isLoading: false }));
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<LoginResult & Partial<AuthResponse>>(
      "/auth/login",
      { email, password },
    );

    // MFA-enabled account → step 2 required before any tokens are issued.
    if (data.mfaRequired) {
      return { mfaRequired: true, challengeToken: data.challengeToken };
    }

    await saveTokens({
      accessToken: data.accessToken as string,
      refreshToken: data.refreshToken as string,
    });

    // Also fetch full profile
    const profile = await api.get<User>("/me");
    setState({
      user: profile,
      isLoading: false,
      isAuthenticated: true,
    });
    return { mfaRequired: false };
  }, []);

  /** Second step of MFA login: verify the TOTP code and receive tokens. */
  const completeMfaLogin = useCallback(
    async (challengeToken: string, code: string) => {
      const data = await api.post<AuthResponse>("/auth/mfa/challenge", {
        challengeToken,
        code,
      });
      await saveTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });

      const profile = await api.get<User>("/me");
      setState({
        user: profile,
        isLoading: false,
        isAuthenticated: true,
      });
    },
    [],
  );

  const registerStaylite = useCallback(
    async (formData: StayliteData): Promise<string> => {
      const data = await api.post<{ message: string }>(
        "/auth/register/staylite",
        formData,
      );
      return data.message;
    },
    [],
  );

  const registerFresher = useCallback(
    async (formData: FresherData): Promise<string> => {
      const data = await api.post<{ message: string }>(
        "/auth/register/fresher",
        formData,
      );
      return data.message;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout", { refreshToken: "" });
    } catch {
      // Ignore — the token clear is what matters
    }
    await clearTokens();
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await api.get<User>("/me");
      setState((s) => ({
        ...s,
        user: profile,
      }));
    } catch {
      // Silently fail
    }
  }, []);

  // ── Verification ──────────────────────────────────────────────

  const uploadVerification = useCallback(
    async (
      associationId: string,
      fileUri: string,
      fileName: string,
    ): Promise<{ id: string; status: string }> => {
      // Build FormData for multipart upload
      const formData = new FormData();
      formData.append("document", {
        uri: fileUri,
        name: fileName || "verification.jpg",
        type: "image/jpeg",
      } as unknown as Blob);
      formData.append("associationId", associationId);

      const tokens = await getTokens();
      const res = await fetch(`${API_BASE}/me/verification/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens?.accessToken ?? ""}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({
          error: { message: "Upload failed" },
        }))) as { error: { message: string } };
        throw new Error(err.error.message);
      }

      return res.json() as Promise<{ id: string; status: string }>;
    },
    [],
  );

  const getVerificationStatus = useCallback(async (): Promise<
    VerificationRequest[]
  > => {
    const data = await api.get<{ requests: VerificationRequest[] }>(
      "/me/verification",
    );
    return data.requests;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        completeMfaLogin,
        registerStaylite,
        registerFresher,
        logout,
        refreshUser,
        uploadVerification,
        getVerificationStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
