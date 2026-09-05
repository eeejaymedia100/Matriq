-- Achievements v2: activity journal, mastery passes, vault content hash
CREATE TABLE "activity_journal" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "activity_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_journal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "activity_journal_user_id_event_key_key" ON "activity_journal"("user_id", "event_key");
CREATE INDEX "activity_journal_user_id_activity_date_idx" ON "activity_journal"("user_id", "activity_date");

CREATE TABLE "mastery_checkpoint_passes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "focus_session_id" UUID NOT NULL,
    "map_id" UUID NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "passed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mastery_checkpoint_passes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mastery_checkpoint_passes_user_id_focus_session_id_map_id_key" ON "mastery_checkpoint_passes"("user_id", "focus_session_id", "map_id");
CREATE INDEX "mastery_checkpoint_passes_user_id_idx" ON "mastery_checkpoint_passes"("user_id");

ALTER TABLE "vault_items" ADD COLUMN "content_hash" TEXT;
CREATE INDEX "vault_items_content_hash_idx" ON "vault_items"("content_hash");

ALTER TABLE "activity_journal" ADD CONSTRAINT "activity_journal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mastery_checkpoint_passes" ADD CONSTRAINT "mastery_checkpoint_passes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
