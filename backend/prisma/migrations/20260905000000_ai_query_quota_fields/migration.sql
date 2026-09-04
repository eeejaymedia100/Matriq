-- Matriq — Quickie free-tier quota accounting.
-- `cached` marks answers served from the Redis answer cache (zero model cost,
-- never counted against a free user's daily limit); `engine` records which
-- stack answered (ollama | deepseek | nvidia | gemini | placeholder).
ALTER TABLE "ai_query_logs" ADD COLUMN "cached" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_query_logs" ADD COLUMN "engine" TEXT;
