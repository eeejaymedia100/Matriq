-- Matriq — Vault (spec §7) + scheduled account deletion (spec §10)
-- Run date: 2026-08-15

-- 0. Audit logs now record student self-service actions (deletion requests)
ALTER TYPE "AuditActorType" ADD VALUE 'student';

-- 1. Vault enums
CREATE TYPE "VaultItemType" AS ENUM ('past_question', 'material');
CREATE TYPE "VaultVisibility" AS ENUM ('public', 'private');

-- 2. Scheduled deletion column on users (spec §10)
ALTER TABLE "users" ADD COLUMN "deletion_scheduled_at" TIMESTAMP(3);

-- 3. Payments become anonymisable on hard delete (keep financial records,
--    drop the link to the deleted student)
ALTER TABLE "payments" ALTER COLUMN "user_id" DROP NOT NULL;

-- 4. Vault table
CREATE TABLE "vault_items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "association_id" UUID NOT NULL,
    "course_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "VaultItemType" NOT NULL DEFAULT 'material',
    "visibility" "VaultVisibility" NOT NULL DEFAULT 'public',
    "storage_ref" TEXT NOT NULL,
    "companion_ref" TEXT,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "companion_size_bytes" INTEGER,
    "companion_mime_type" TEXT,
    "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "reviewed_by_admin" UUID,
    "reviewed_at" TIMESTAMP(3),
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vault_items_pkey" PRIMARY KEY ("id")
);

-- 5. Vault indexes
CREATE INDEX "vault_items_association_id_course_code_idx" ON "vault_items"("association_id", "course_code");
CREATE INDEX "vault_items_course_code_idx" ON "vault_items"("course_code");
CREATE INDEX "vault_items_moderation_status_visibility_idx" ON "vault_items"("moderation_status", "visibility");
CREATE INDEX "vault_items_user_id_idx" ON "vault_items"("user_id");

-- 6. Foreign keys
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_association_id_fkey" FOREIGN KEY ("association_id") REFERENCES "associations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
