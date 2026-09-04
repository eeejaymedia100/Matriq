-- Focus Mode clarification (the Questioner): intake question sets, student
-- answers, and the map session that consumed them.
CREATE TABLE "focus_clarifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "answers" JSONB,
    "session_map_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "focus_clarifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "focus_clarifications_user_id_idx" ON "focus_clarifications"("user_id");

ALTER TABLE "focus_clarifications"
  ADD CONSTRAINT "focus_clarifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
