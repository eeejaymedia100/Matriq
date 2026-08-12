import { ThrottlerGetTrackerFunction } from "@nestjs/throttler";

/**
 * Rate-limit keyed by IP **and** email from the request body.
 *
 * Why: campus Wi-Fi puts 1,000 students behind a handful of NAT IPs. A plain
 * per-IP limit (the throttler default) would let one student burn the bucket
 * for everyone else; a plain per-email limit would let an attacker rotate
 * emails from a single IP forever. Keying by both means each student gets
 * their own bucket per account, while a single source still can't hammer the
 * endpoint across many accounts.
 */
export const ipAndEmailTracker: ThrottlerGetTrackerFunction = (req) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.toLowerCase().trim()
      : "";
  const ip =
    typeof req.ip === "string"
      ? req.ip
      : typeof req.socket?.remoteAddress === "string"
        ? req.socket.remoteAddress
        : "unknown";
  // Include the route path in the key: login, register (×2) and admin login
  // all use this tracker, and without the route they'd share ONE bucket per
  // ip|email — a user who retries registration a few times (validation errors)
  // then logs in within the same minute could be blocked from login. Each
  // route gets its own 5/min bucket per (ip, email).
  const route = typeof req.path === "string" ? req.path : "unknown";
  return `${route}|${ip}|${email}`;
};
