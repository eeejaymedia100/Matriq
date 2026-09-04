-- Matriq — student achievements (Achievement Board).
-- One row per (student, achievement) the moment it is earned, so the board
-- can show "earned on" dates from real data. Evaluation is deterministic
-- server-side; this table only records the fact + timestamp of earning.
CREATE TABLE "achievement_unlocks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "achievement_id" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "achievement_unlocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "achievement_unlocks_user_id_achievement_id_key" ON "achievement_unlocks"("user_id", "achievement_id");
CREATE INDEX "achievement_unlocks_user_id_idx" ON "achievement_unlocks"("user_id");

ALTER TABLE "achievement_unlocks"
    ADD CONSTRAINT "achievement_unlocks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;