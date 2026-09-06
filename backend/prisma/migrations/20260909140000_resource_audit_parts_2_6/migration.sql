-- Resource Audit Engine Parts 2-6: validation/quality/duplicate fields,
-- AI provider attribution + risk, reviewer notes, reward ledger.

ALTER TABLE "resource_submissions"
  ADD COLUMN "ai_audit_report"          JSONB,
  ADD COLUMN "ai_provider"              TEXT,
  ADD COLUMN "ai_model"                 TEXT,
  ADD COLUMN "validation_results"       JSONB,
  ADD COLUMN "quality_metrics"          JSONB,
  ADD COLUMN "text_fingerprint"         TEXT,
  ADD COLUMN "duplicate_of_id"          UUID,
  ADD COLUMN "duplicate_similarity"     INTEGER,
  ADD COLUMN "reviewer_notes"           TEXT,
  ADD COLUMN "risk_level"               "ResourceRiskLevel";

CREATE TYPE "ResourceRiskLevel" AS ENUM ('green', 'yellow', 'red');
CREATE TYPE "ResourceRewardState" AS ENUM ('pending', 'eligible', 'processing', 'paid', 'rejected', 'disputed');

CREATE INDEX "resource_submissions_text_fingerprint_idx" ON "resource_submissions"("text_fingerprint");
CREATE INDEX "resource_submissions_risk_level_idx" ON "resource_submissions"("risk_level");

CREATE TABLE "resource_contributions" (
    "id"            UUID        NOT NULL,
    "student_id"    UUID        NOT NULL,
    "submission_id" UUID        NOT NULL,
    "campaign_id"   TEXT        NOT NULL,
    "points"        INTEGER     NOT NULL,
    "course_code"   TEXT        NOT NULL,
    "material_type" TEXT        NOT NULL,
    "reason"        TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_contributions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "resource_rewards" (
    "id"              UUID                  NOT NULL,
    "student_id"      UUID                  NOT NULL,
    "contribution_id" UUID                  NOT NULL,
    "campaign_id"     TEXT                  NOT NULL,
    "tier_id"         TEXT                  NOT NULL,
    "state"           "ResourceRewardState" NOT NULL DEFAULT 'pending',
    "points_at_earn"  INTEGER               NOT NULL,
    "payout_ref"      TEXT,
    "payout_method"   TEXT,
    "paid_at"         TIMESTAMP(3),
    "paid_by_admin"   UUID,
    "note"            TEXT,
    "created_at"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3)          NOT NULL,

    CONSTRAINT "resource_rewards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resource_contributions_submission_id_key" ON "resource_contributions"("submission_id");
CREATE UNIQUE INDEX "resource_rewards_student_id_campaign_id_tier_id_key" ON "resource_rewards"("student_id", "campaign_id", "tier_id");
CREATE INDEX "resource_contributions_campaign_id_student_id_idx" ON "resource_contributions"("campaign_id", "student_id");
CREATE INDEX "resource_contributions_student_id_created_at_idx" ON "resource_contributions"("student_id", "created_at");
CREATE INDEX "resource_rewards_campaign_id_state_idx" ON "resource_rewards"("campaign_id", "state");
CREATE INDEX "resource_rewards_student_id_idx" ON "resource_rewards"("student_id");

ALTER TABLE "resource_contributions"
  ADD CONSTRAINT "resource_contributions_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_contributions"
  ADD CONSTRAINT "resource_contributions_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "resource_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_rewards"
  ADD CONSTRAINT "resource_rewards_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_rewards"
  ADD CONSTRAINT "resource_rewards_contribution_id_fkey"
  FOREIGN KEY ("contribution_id") REFERENCES "resource_contributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
