-- Resource Hunt: Telegram campaign participants are first-class records,
-- never Matriq accounts. Submissions/contributions reference either a
-- student UUID or a participant UUID — Telegram ids are never cast into
-- UUID columns.

CREATE TABLE "telegram_participants" (
    "id"             UUID        NOT NULL,
    "telegram_id"    TEXT        NOT NULL,
    "username"       TEXT,
    "first_name"     TEXT,
    "verified_at"    TIMESTAMP(3),
    "university"     TEXT,
    "points"         INTEGER     NOT NULL DEFAULT 0,
    "approved_count" INTEGER     NOT NULL DEFAULT 0,
    "linked_user_id" UUID,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_participants_telegram_id_key" ON "telegram_participants"("telegram_id");
CREATE UNIQUE INDEX "telegram_participants_linked_user_id_key" ON "telegram_participants"("linked_user_id");
CREATE INDEX "telegram_participants_points_idx" ON "telegram_participants"("points");

-- Submissions can now belong to a campaign participant instead of an account.
ALTER TABLE "resource_submissions" ALTER COLUMN "student_id" DROP NOT NULL;
ALTER TABLE "resource_submissions" ADD COLUMN "participant_id" UUID;
ALTER TABLE "resource_submissions" ADD COLUMN "reviewer_source" TEXT;
-- Chat reviews record "telegram:<id>" as the reviewer — no longer a UUID.
ALTER TABLE "resource_submissions" ALTER COLUMN "reviewer_id" TYPE TEXT;
ALTER TABLE "resource_submissions" DROP CONSTRAINT "resource_submissions_student_id_fkey";
ALTER TABLE "resource_submissions" ADD CONSTRAINT "resource_submissions_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_submissions" ADD CONSTRAINT "resource_submissions_participant_id_fkey"
  FOREIGN KEY ("participant_id") REFERENCES "telegram_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "resource_submissions_participant_id_idx" ON "resource_submissions"("participant_id");

-- Contributions mirror the same ownership split (participant branch).
ALTER TABLE "resource_contributions" ALTER COLUMN "student_id" DROP NOT NULL;
ALTER TABLE "resource_contributions" ADD COLUMN "participant_id" UUID;
ALTER TABLE "resource_contributions" DROP CONSTRAINT "resource_contributions_student_id_fkey";
ALTER TABLE "resource_contributions" ADD CONSTRAINT "resource_contributions_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_contributions" ADD CONSTRAINT "resource_contributions_participant_id_fkey"
  FOREIGN KEY ("participant_id") REFERENCES "telegram_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "resource_contributions_participant_id_idx" ON "resource_contributions"("participant_id");
CREATE INDEX "resource_contributions_campaign_participant_idx" ON "resource_contributions"("campaign_id", "participant_id");
