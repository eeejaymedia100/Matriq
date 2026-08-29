-- AlterTable: add discovery metadata to vault_items (level + session)
ALTER TABLE "vault_items" ADD COLUMN "level" TEXT;
ALTER TABLE "vault_items" ADD COLUMN "session" TEXT;

-- Composite index for course-code-first browsing within a school, with level filter
CREATE INDEX "vault_items_association_id_course_code_level_idx" ON "vault_items"("association_id", "course_code", "level");
