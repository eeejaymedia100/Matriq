"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";

export default function LoginPage() {
  const router = useRouter();
  const { login, completeLogin } = useSession() as unknown as {
    login: (email: string, password: string) => Promise<{ mfaRequired: boolean; challengeToken?: string }>;
    completeLogin: (token: string, code: string) => Promise<void>;
  };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result.mfaRequired && result.challengeToken) {
        setChallengeToken(result.challengeToken);
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!challengeToken) return;
    setError("");
    setLoading(true);

    try {
      await completeLogin(challengeToken, code);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-void p-4">
      <div className="w-full max-w-md">
        <div className="bg-surface rounded-2xl border border-line p-8">
          <div className="text-center mb-8">
            {/* Brand mark — the official uploaded logo */}
            <img
              src="/matriq-mark.png"
              alt="Matriq"
              className="w-14 h-14 mx-auto mb-4"
            />
            <h1 className="text-2xl font-serif font-semibold text-text mb-1">
              Matriq
            </h1>
            <p className="text-muted text-sm">
              {challengeToken ? "Two-factor authentication" : "Platform Console"}
            </p>
          </div>

          {challengeToken ? (
            <form onSubmit={handleCodeSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="code"
                  className="block text-sm font-medium text-textSecondary mb-1"
                >
                  Authentication code
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                  required
                  autoFocus
                  className="w-full px-4 py-2.5 bg-surfaceAlt border border-line rounded-lg text-sm text-center text-lg tracking-[0.5em] font-mono text-text placeholder:text-muted focus:border-lime outline-none transition-colors"
                  placeholder="••••••"
                />
                <p className="text-xs text-muted mt-2">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>

              {error && (
                <div className="bg-errorBg border border-error/30 text-error text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-2.5 bg-lime hover:brightness-110 disabled:opacity-40 text-ink font-semibold rounded-lg transition"
              >
                {loading ? "Verifying..." : "Verify & Sign In"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setChallengeToken(null);
                  setCode("");
                }}
                className="w-full text-sm text-muted hover:text-text transition"
              >
                ← Back
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-textSecondary mb-1"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-surfaceAlt border border-line rounded-lg text-sm text-text placeholder:text-muted focus:border-lime outline-none transition-colors"
                  placeholder="admin@matriq.com.ng"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-textSecondary mb-1"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-surfaceAlt border border-line rounded-lg text-sm text-text placeholder:text-muted focus:border-lime outline-none transition-colors"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="bg-errorBg border border-error/30 text-error text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-lime hover:brightness-110 disabled:opacity-40 text-ink font-semibold rounded-lg transition"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
