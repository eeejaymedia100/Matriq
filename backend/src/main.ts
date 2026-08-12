import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";
import cluster from "cluster";
import * as os from "os";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";

/**
 * Cluster mode: one Node process per CPU core (production default).
 *
 * The box this runs on has 2 vCPU and NestJS is single-threaded — without
 * clustering the second core sits idle. With cluster, each worker is a full
 * NestJS instance sharing the same port; Redis-backed rate limiting and the
 * Postgres pool (capped per worker via DATABASE_POOL_MAX) make this safe.
 *
 * - Default: N workers = os.availableParallelism() in production.
 * - WORKERS=4 overrides the count; WORKERS=1 forces a single process.
 * - Dev (`npm run start:dev`) stays single-process so watch mode behaves.
 */
function resolveWorkerCount(): number {
  const env = Number(process.env.WORKERS);
  if (Number.isFinite(env) && env >= 1) {
    return Math.floor(env);
  }
  if (process.env.NODE_ENV === "production") {
    return os.availableParallelism?.() ?? os.cpus().length;
  }
  return 1;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Let Nest handle SIGTERM/SIGINT per worker: close the HTTP server and run
  // module destroy hooks (Prisma disconnect, Redis teardown) so in-flight
  // requests drain instead of a hard kill mid-request.
  app.enableShutdownHooks();

  // Global validation — every DTO gets validated automatically
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global structured errors — every failure returns the same envelope
  // { statusCode, code, message, retryAfterMs? } so clients (mobile + web)
  // can render friendly, actionable messages instead of raw HTTP text.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Per security.md: CORS locked to actual origins, not '*'
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:8081"],
    credentials: true,
  });

  // Trust the reverse proxy (caddy) for rate limiting IP detection
  const httpAdapter = app.getHttpAdapter();
  if (httpAdapter instanceof ExpressAdapter) {
    httpAdapter.getInstance().set("trust proxy", 1);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Matriq backend worker ${process.pid} listening on :${port}`);
}

const workerCount = resolveWorkerCount();

if (workerCount > 1 && cluster.isPrimary) {
  console.log(`Matriq primary ${process.pid}: forking ${workerCount} workers`);

  for (let i = 0; i < workerCount; i += 1) {
    cluster.fork();
  }

  // Respawn crashed workers so a single bad request can't take the API down.
  // Gated on a shuttingDown flag: workers killed as part of a graceful
  // shutdown must NOT be respawned mid-teardown.
  let shuttingDown = false;
  cluster.on("exit", (worker, code, signal) => {
    if (shuttingDown) {
      return;
    }
    console.error(
      `Worker ${worker.process.pid} exited (${code ?? signal}). Respawning.`,
    );
    cluster.fork();
  });

  // Forward shutdown signals so workers can drain in-flight requests
  // (each worker's enableShutdownHooks() does the graceful close).
  const shutdown = (signal: string): void => {
    shuttingDown = true;
    console.log(`Primary received ${signal}; shutting down workers`);
    for (const id in cluster.workers) {
      cluster.workers[id]?.process.kill("SIGTERM");
    }
    // Workers get 5s to drain, then force-exit regardless.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
} else {
  bootstrap().catch((err) => {
    console.error("Failed to bootstrap:", err);
    process.exit(1);
  });
}
