-- Magic Plus entitlements + Cloud Focus Mode (DeepSeek) tables.
-- The backend remains the AUTHORITY for premium access; a client flag is never
-- trusted as proof of paid cloud usage.

-- CreateTable: MagicPlusEntitlement
CREATE TABLE "magic_plus_entitlements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'magic_plus',
  "status" TEXT NOT NULL DEFAULT 'active',
  "source" TEXT NOT NULL DEFAULT 'free_allowance',
  "free_generation_limit" INTEGER NOT NULL DEFAULT 10,
  "free_generations_used" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "magic_plus_entitlements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "magic_plus_entitlements_user_id_key" ON "magic_plus_entitlements"("user_id");

-- CreateTable: FocusModeSession
CREATE TABLE "focus_mode_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "topic" TEXT NOT NULL,
  "topic_hash" TEXT NOT NULL,
  "concept_map" JSONB NOT NULL,
  "prompt_version" INTEGER NOT NULL DEFAULT 1,
  "provider" TEXT NOT NULL DEFAULT 'deepseek',
  "model" TEXT NOT NULL,
  "from_cache" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "focus_mode_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "focus_mode_sessions_user_id_idx" ON "focus_mode_sessions"("user_id");
CREATE INDEX "focus_mode_sessions_topic_hash_idx" ON "focus_mode_sessions"("topic_hash");

-- CreateTable: FocusModeUsage
CREATE TABLE "focus_mode_usage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "session_id" UUID,
  "operation" TEXT NOT NULL DEFAULT 'generate',
  "provider" TEXT NOT NULL DEFAULT 'deepseek',
  "model" TEXT NOT NULL,
  "prompt_version" INTEGER NOT NULL DEFAULT 1,
  "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
  "completion_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "latency_ms" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost_micros" INTEGER NOT NULL DEFAULT 0,
  "cached" BOOLEAN NOT NULL DEFAULT false,
  "error" BOOLEAN NOT NULL DEFAULT false,
  "error_kind" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "focus_mode_usage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "focus_mode_usage_user_id_created_at_idx" ON "focus_mode_usage"("user_id", "created_at");
CREATE INDEX "focus_mode_usage_created_at_idx" ON "focus_mode_usage"("created_at");

-- AddForeignKey: magic_plus_entitlements.user_id -> users.id (CASCADE)
ALTER TABLE "magic_plus_entitlements"
  ADD CONSTRAINT "magic_plus_entitlements_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: focus_mode_sessions.user_id -> users.id (CASCADE)
ALTER TABLE "focus_mode_sessions"
  ADD CONSTRAINT "focus_mode_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: focus_mode_usage.user_id -> users.id (CASCADE)
ALTER TABLE "focus_mode_usage"
  ADD CONSTRAINT "focus_mode_usage_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: focus_mode_usage.session_id -> focus_mode_sessions.id
ALTER TABLE "focus_mode_usage"
  ADD CONSTRAINT "focus_mode_usage_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "focus_mode_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;