"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { useSession } from "@/components/SessionProvider";
import { getMfaStatus, enrollMfa, verifyMfaEnrollment, disableMfa } from "@/lib/api";

/**
 * Admin Security (spec §1): TOTP two-factor via a QR-code setup flow,
 * compatible with any standard authenticator app. Enforced at login —
 * once enabled, every sign-in needs the 6-digit code.
 */
export default function AdminSecurityPage() {
  const router = useRouter();
  const { token } = useSession();

  const [loading, setLoading] = useState(true);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [enroll, setEnroll] = useState<{
    secret: string;
    qrCodeDataUrl: string;
    uri: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const s = await getMfaStatus(token);
      setMfaEnabled(s.mfaEnabled);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    void load();
  }, [router, token, load]);

  const startEnroll = async () => {
    if (!token) return;
    setMessage(null);
    try {
      const data = await enrollMfa(token);
      setEnroll(data);
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Failed to start enrollment",
      });
    }
  };

  const confirmEnroll = async () => {
    if (!token || code.length !== 6) return;
    setVerifying(true);
    setMessage(null);
    try {
      await verifyMfaEnrollment(code, token);
      setMfaEnabled(true);
      setEnroll(null);
      setCode("");
      setMessage({
        ok: true,
        text: "Two-factor authentication is now enabled. Sign-ins will require a code.",
      });
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Invalid code",
      });
    } finally {
      setVerifying(false);
    }
  };

  const turnOff = async () => {
    if (!token) return;
    if (!window.confirm("Disable two-factor authentication for this admin account?")) return;
    setDisabling(true);
    setMessage(null);
    try {
      await disableMfa(token);
      setMfaEnabled(false);
      setMessage({ ok: true, text: "Two-factor authentication disabled." });
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Failed to disable",
      });
    } finally {
      setDisabling(false);
    }
  };

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Security</h1>

      {message && (
        <div
          className={`rounded-xl px-4 py-3 mb-6 text-sm ${
            message.ok
              ? "bg-green-900/40 text-green-400"
              : "bg-red-900/40 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-white">Two-factor authentication</h2>
            <p className="text-sm text-gray-400 mt-1">
              TOTP — works with Google Authenticator, Authy or any standard
              authenticator app. Once enabled, every admin sign-in requires the
              code from your phone.
            </p>
          </div>
          <span
            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
              mfaEnabled
                ? "bg-green-900/50 text-green-400"
                : "bg-yellow-900/50 text-yellow-400"
            }`}
          >
            {mfaEnabled ? "Enabled" : "Not enabled"}
          </span>
        </div>

        {loading ? (
          <div className="h-10 bg-gray-800 rounded-lg animate-pulse" />
        ) : mfaEnabled && !enroll ? (
          <button
            onClick={() => void turnOff()}
            disabled={disabling}
            className="px-4 py-2 bg-red-900/40 hover:bg-red-900/60 text-red-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {disabling ? "Disabling…" : "Disable two-factor"}
          </button>
        ) : !mfaEnabled && !enroll ? (
          <button
            onClick={() => void startEnroll()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Set up two-factor
          </button>
        ) : null}

        {enroll && (
          <div className="mt-6 border-t border-gray-800 pt-6">
            <h3 className="font-semibold text-white mb-2">Scan with your authenticator app</h3>
            <p className="text-sm text-gray-400 mb-4">
              Open your authenticator app, add an account by scanning the QR code
              below (or entering the secret manually), then enter the 6-digit code.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element -- QR data URL can't use next/image */}
            <img
              src={enroll.qrCodeDataUrl}
              alt="TOTP QR code"
              className="w-56 h-56 bg-white rounded-xl p-2 mx-auto"
            />
            <p className="text-center text-xs text-gray-500 mt-3 break-all font-mono">
              {enroll.secret}
            </p>
            <div className="flex gap-3 mt-5">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                maxLength={6}
                inputMode="numeric"
                placeholder="000000"
                className="w-40 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white tracking-widest text-center placeholder-gray-500 focus:ring-2 focus:ring-purple-500 outline-none"
              />
              <button
                onClick={() => void confirmEnroll()}
                disabled={verifying || code.length !== 6}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {verifying ? "Verifying…" : "Verify & enable"}
              </button>
              <button
                onClick={() => setEnroll(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
