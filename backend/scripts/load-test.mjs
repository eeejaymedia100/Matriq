#!/usr/bin/env node
/**
 * Matriq — API load test (autocannon).
 *
 * Usage (from backend/):
 *   node scripts/load-test.mjs                # default: health only, 20s, 50 conns
 *   BASE_URL=http://localhost DURATION=30 CONNECTIONS=100 node scripts/load-test.mjs
 *   SCENARIOS=health,associations,login node scripts/load-test.mjs
 *   AUTH_TOKEN=<jwt> SCENARIOS=associations node scripts/load-test.mjs
 *   LOGIN_EMAIL=test@matriq.com LOGIN_PASSWORD=secret SCENARIOS=login node scripts/load-test.mjs
 *
 * Env vars:
 *   BASE_URL        target base URL (default http://localhost)
 *   DURATION        seconds per scenario (default 20)
 *   CONNECTIONS     concurrent connections (default 50)
 *   RATE            max requests/sec (default 0 = unlimited)
 *   SCENARIOS       comma-separated subset of health,associations,login,ai
 *                   (default health)
 *   AUTH_TOKEN      JWT for authenticated scenarios (associations, ai)
 *   LOGIN_EMAIL / LOGIN_PASSWORD   credentials for the login scenario
 *
 * Notes:
 * - /v1/auth/login is configured to throttle 5/min per IP+email, but the
 *   ThrottlerGuard is not registered yet (see progress-log flag), so 429s
 *   won't appear until that's wired up.
 * - The ai scenario hits Ollama (CPU-bound, capped at OLLAMA_MAX_CONCURRENCY).
 *   Keep connections low (e.g. 5) or you will measure the 503 queue behavior.
 */
import autocannon from "autocannon";

const baseUrl = process.env.BASE_URL || "http://localhost";
const duration = Number(process.env.DURATION || 20);
const connections = Number(process.env.CONNECTIONS || 50);
const rate = Number(process.env.RATE || 0);
const authToken = process.env.AUTH_TOKEN;
const loginEmail = process.env.LOGIN_EMAIL;
const loginPassword = process.env.LOGIN_PASSWORD;

const scenarios = {
  health: {
    name: "GET /health",
    url: `${baseUrl}/health`,
    method: "GET",
  },
  associations: {
    name: "GET /v1/associations (JWT+DB)",
    url: `${baseUrl}/v1/associations`,
    method: "GET",
    headers: authToken ? { authorization: `Bearer ${authToken}` } : undefined,
  },
  login: {
    name: "POST /v1/auth/login (argon2; throttled 5/min → 429s expected)",
    url: `${baseUrl}/v1/auth/login`,
    method: "POST",
    body: loginEmail
      ? JSON.stringify({ email: loginEmail, password: loginPassword || "" })
      : undefined,
    headers: loginEmail ? { "content-type": "application/json" } : undefined,
  },
  ai: {
    name: "POST /v1/ai/query (Ollama; queue-capped)",
    url: `${baseUrl}/v1/ai/query`,
    method: "POST",
    body: JSON.stringify({ query: "What is the course outline?" }),
    headers: authToken
      ? {
          authorization: `Bearer ${authToken}`,
          "content-type": "application/json",
        }
      : { "content-type": "application/json" },
  },
};

const chosen =
  (process.env.SCENARIOS || "health")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => scenarios[s]);

if (chosen.length === 0) {
  console.error(
    `Unknown scenario. Valid: ${Object.keys(scenarios).join(", ")}`,
  );
  process.exit(1);
}

console.log(
  `Matriq load test → ${baseUrl} (${duration}s, ${connections} conns${
    rate ? `, ${rate} rps` : ""
  })`,
);

const results = [];

for (const key of chosen) {
  const scenario = scenarios[key];
  console.log(`\n=== ${scenario.name} ===`);
  const result = await autocannon({
    url: scenario.url,
    method: scenario.method,
    headers: scenario.headers,
    body: scenario.body,
    duration,
    connections,
    rate: rate || undefined,
    timeout: 30,
  });
  results.push({ name: scenario.name, result });
}

// Compact summary
// autocannon v8 histogram percentiles: p50, p75, p90, p97_5, p99, ... (no p95),
// so we interpolate p95 linearly between p90 and p97_5.
const p95 = (l) => l.p90 + ((l.p97_5 - l.p90) * (95 - 90)) / (97.5 - 90);

console.log("\n=== SUMMARY ===");
for (const { name, result } of results) {
  const { statusCodeStats, latency } = result;
  const codes = Object.entries(statusCodeStats)
    .map(([code, stat]) => `${code}:${stat.count}`)
    .join(" ");
  // Use actual elapsed wall time (autocannon warmup makes configured duration
  // slightly shorter than the real run window).
  const elapsedSec = (result.finish - result.start) / 1000 || duration;
  const reqsPerSec = (result.requests.total / elapsedSec).toFixed(1);
  const mibPerSec = result.throughput.total / elapsedSec / 1024 / 1024;
  console.log(
    `${name}\n  requests: ${result.requests.total} (${reqsPerSec} rps) | codes: ${codes} | avg: ${latency.average.toFixed(1)}ms | p95: ${p95(latency).toFixed(0)}ms | throughput: ${mibPerSec.toFixed(2)} MiB/s`,
  );
}
