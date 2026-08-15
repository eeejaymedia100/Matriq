import { ApiError } from "../api/client";

/**
 * Friendly, structured error shown to the user. Every message answers three
 * questions the user actually cares about:
 *  - WHAT happened (plain English, no jargon, no raw HTTP codes)
 *  - WHY it happened (without leaking sensitive/internal details)
 *  - WHAT to do next (an immediate, actionable step)
 */
export interface FriendlyError {
  /** Short headline, e.g. "No internet connection" */
  title: string;
  /** Plain-English explanation of what happened */
  message: string;
  /** What the user should do right now */
  action: string;
}

const isApiError = (err: unknown): err is ApiError => err instanceof ApiError;

const isNetworkError = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("network request failed") ||
    m.includes("failed to fetch") ||
    m.includes("fetch failed") ||
    m.includes("networkerror") ||
    m.includes("econnrefused") ||
    m.includes("enetunreach") ||
    m.includes("is not connected") ||
    m.includes("could not connect") ||
    m.includes("not reachable") ||
    m.includes("unable to resolve host")
  );
};

const isTimeout = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("aborted") ||
    m.includes("abort")
  );
};

function minutesUntil(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 60000));
}

/**
 * Convert any thrown value into a FriendlyError. Never throws.
 */
export function formatApiError(err: unknown): FriendlyError {
  // ── No internet / backend unreachable ──────────────────────────
  if (isNetworkError(err)) {
    return {
      title: "No internet connection",
      message: "We couldn't reach Matriq's servers.",
      action: "Check your Wi-Fi or mobile data, then try again.",
    };
  }

  if (isTimeout(err)) {
    return {
      title: "The request took too long",
      message: "Matriq didn't respond in time.",
      action:
        "Check your internet connection and try again. If it keeps happening, please try again in a few minutes.",
    };
  }

  // ── Structured API errors (NestJS envelope) ────────────────────
  if (isApiError(err)) {
    const { status, code, retryAfterMs } = err;
    const backendMessage = err.message.trim();

    // Account exists with the same email but hasn't been verified yet
    if (code === "EMAIL_NOT_VERIFIED") {
      return {
        title: "Verify your email first",
        message:
          "Your email hasn't been verified yet, so you can't sign in.",
        action:
          "Check your inbox (and spam) for the 6-digit code we sent you, then enter it to continue.",
      };
    }

    // Verification emails: 5 per hour — tell them exactly when
    if (code === "VERIFICATION_EMAIL_LIMIT") {
      const minutes = retryAfterMs ? minutesUntil(retryAfterMs) : null;
      return {
        title: "Too many verification emails",
        message:
          minutes !== null
            ? `You can request a new code in about ${minutes} minute${minutes === 1 ? "" : "s"}.`
            : "You've reached the limit of 5 verification emails per hour.",
        action:
          "Wait for the countdown, then request a new code. Check your spam folder in the meantime — the earlier emails may be there.",
      };
    }

    // Any other rate limit
    if (status === 429) {
      const minutes = retryAfterMs ? minutesUntil(retryAfterMs) : null;
      return {
        title: "Too many attempts",
        message:
          minutes !== null
            ? `Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} before trying again.`
            : "You've tried too many times in a short period.",
        action: "Wait a bit, then try again.",
      };
    }

    // Wrong credentials — the sign-in form only. The backend sets
    // INVALID_CREDENTIALS for a wrong password, and returns a generic
    // "Invalid email or password" when the account doesn't exist (deliberately
    // identical, so the app can't be used to enumerate registered emails).
    if (
      code === "INVALID_CREDENTIALS" ||
      backendMessage.toLowerCase().includes("invalid email or password")
    ) {
      return {
        title: "Incorrect email or password",
        message: "We couldn't sign you in with those details.",
        action: "Double-check your email and password, then try again.",
      };
    }

    // MFA / TOTP failures — distinct from both credentials and session expiry.
    if (backendMessage.toLowerCase().includes("authentication code")) {
      return {
        title: "That code didn't work",
        message: "The 6-digit code didn't match.",
        action: "Check your authenticator app and try the code again.",
      };
    }
    if (backendMessage.toLowerCase().includes("challenge")) {
      return {
        title: "That step has expired",
        message: "The two-factor step timed out.",
        action: "Sign in again to get a fresh code.",
      };
    }

    // Any other 401 (an expired/invalid session token) means the session
    // lapsed. This was previously leaking "Incorrect email or password" into
    // unrelated screens (Vault, Tools, …) — the exact bug this fixes.
    if (status === 401) {
      return {
        title: "Your session has expired",
        message: "For your security, you've been signed out.",
        action: "Sign in again to continue.",
      };
    }

    // Conflict (e.g. account already exists)
    if (status === 409) {
      return {
        title: "An account already exists",
        message:
          backendMessage ||
          "There's already an account using that email address.",
        action: "Sign in instead, or register with a different email.",
      };
    }

    // Validation / bad request
    if (status === 400 || status === 422 || code === "VALIDATION_FAILED") {
      return {
        title: "Please check your details",
        message:
          backendMessage || "Some of the information you entered isn't valid.",
        action: "Fix the highlighted fields and try again.",
      };
    }

    // Forbidden / not found
    if (status === 403) {
      return {
        title: "You can't do that",
        message:
          backendMessage ||
          "You don't have permission to perform this action.",
        action: "If you think this is a mistake, contact the admin.",
      };
    }
    if (status === 404) {
      return {
        title: "Not found",
        message: backendMessage || "What you're looking for doesn't exist.",
        action: "Go back and try again, or contact the admin.",
      };
    }

    // Server-side failures — never blame the user
    if (status !== undefined && status >= 500) {
      return {
        title: "Something went wrong on our side",
        message:
          "Matriq hit an unexpected error. Your information is safe.",
        action:
          "Please try again in a few minutes. If it keeps happening, contact the admin.",
      };
    }

    // Anything else with a real backend message
    if (backendMessage && !backendMessage.startsWith("HTTP ")) {
      return {
        title: "Something went wrong",
        message: backendMessage,
        action: "Please try again. If it keeps happening, contact the admin.",
      };
    }
  }

  // ── Unknown / unexpected ───────────────────────────────────────
  return {
    title: "Something went wrong",
    message: "We hit an unexpected problem.",
    action: "Please try again. If it keeps happening, contact the admin.",
  };
}
