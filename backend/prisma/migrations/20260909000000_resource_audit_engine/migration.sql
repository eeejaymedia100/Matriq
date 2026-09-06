-- CreateEnum
CREATE TYPE "ResourceAuditStatus" AS ENUM ('received', 'validating', 'duplicate_check', 'extracting', 'ocr_processing', 'auditing', 'pending_human_review', 'approved', 'rejected', 'needs_information', 'reward_pending', 'reward_eligible', 'reward_ineligible', 'processing_library', 'published', 'failed');

-- CreateEnum
CREATE TYPE "ResourceRewardStatus" AS ENUM ('none', 'pending', 'eligible', 'ineligible');

-- CreateEnum
CREATE TYPE "ResourceLibraryStatus" AS ENUM ('none', 'pending', 'processing', 'published', 'failed');

-- CreateEnum
CREATE TYPE "SubmissionSource" AS ENUM ('app', 'web', 'admin', 'telegram');

-- CreateEnum
CREATE TYPE "ResourceMaterialType" AS ENUM ('past_question', 'lecture_note', 'handout', 'slide_deck', 'textbook_summary', 'other');

-- CreateTable
CREATE TABLE "resource_submissions" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "source" "SubmissionSource" NOT NULL DEFAULT 'app',
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_hash" TEXT NOT NULL,
    "page_count" INTEGER,
    "storage_ref" TEXT NOT NULL,
    "institution_id" UUID,
    "university_name" TEXT,
    "faculty" TEXT,
    "department" TEXT,
    "course_code" TEXT NOT NULL,
    "level" TEXT,
    "material_type" "ResourceMaterialType" NOT NULL DEFAULT 'other',
    "academic_session" TEXT,
    "rights_declared" BOOLEAN NOT NULL,
    "rights_version" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "audit_status" "ResourceAuditStatus" NOT NULL DEFAULT 'received',
    "extracted_text" TEXT,
    "ai_recommendation" TEXT,
    "ai_confidence" INTEGER,
    "ai_summary" TEXT,
    "ai_audited_at" TIMESTAMP(3),
    "human_decision" TEXT,
    "decision_reason" TEXT,
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "reward_status" "ResourceRewardStatus" NOT NULL DEFAULT 'none',
    "reward_reason" TEXT,
    "library_status" "ResourceLibraryStatus" NOT NULL DEFAULT 'none',
    "published_vault_item_id" UUID,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "last_stage_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resource_submissions_student_id_file_hash_course_code_key" ON "resource_submissions"("student_id", "file_hash", "course_code");

-- CreateIndex
CREATE INDEX "resource_submissions_student_id_created_at_idx" ON "resource_submissions"("student_id" , "created_at");

-- CreateIndex
CREATE INDEX "resource_submissions_audit_status_idx" ON "resource_submissions"("audit_status");

-- CreateIndex
CREATE INDEX "resource_submissions_file_hash_idx" ON "resource_submissions"("file_hash");

-- CreateIndex
CREATE INDEX "resource_submissions_institution_id_course_code_idx" ON "resource_submissions"("institution_id" , "course_code");

-- AddForeignKey
ALTER TABLE "resource_submissions" ADD CONSTRAINT "resource_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_submissions" ADD CONSTRAINT "resource_submissions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
