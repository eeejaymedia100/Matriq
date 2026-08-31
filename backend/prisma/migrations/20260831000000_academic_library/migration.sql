-- Netflix-for-Students: cross-institution academic discovery layer.
-- Extends vault_items with library metadata + adds per-student activity tables.

-- 1. Rich discovery metadata on vault_items (nullable so existing rows are fine)
ALTER TABLE "vault_items" ADD COLUMN "institution_id" UUID;
ALTER TABLE "vault_items" ADD COLUMN "faculty" TEXT;
ALTER TABLE "vault_items" ADD COLUMN "department" TEXT;
ALTER TABLE "vault_items" ADD COLUMN "course_title" TEXT;
ALTER TABLE "vault_items" ADD COLUMN "description" TEXT;
ALTER TABLE "vault_items" ADD COLUMN "opens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "vault_items" ADD COLUMN "saves_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "vault_items" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

-- Foreign key: vault_items -> institutions (metadata link for discovery).
ALTER TABLE "vault_items"
  ADD CONSTRAINT "vault_items_institution_id_fkey"
  FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Display-rich discovery indexes (cross-institution browse rows).
CREATE INDEX "vault_items_moderation_status_visibility_hidden_opens_idx" ON "vault_items"("moderation_status", "visibility", "hidden", "opens");
CREATE INDEX "vault_items_visibility_moderation_status_created_at_idx" ON "vault_items"("visibility", "moderation_status", "created_at");
CREATE INDEX "vault_items_institution_id_moderation_status_visibility_idx" ON "vault_items"("institution_id", "moderation_status", "visibility");
CREATE INDEX "vault_items_faculty_department_idx" ON "vault_items"("faculty", "department");

-- 2. Per-student saved/bookmarked documents (reference only, no file copy)
CREATE TABLE "library_saves" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "vault_item_id" UUID NOT NULL,
  "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "library_saves_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "library_saves_user_id_vault_item_id_key" ON "library_saves"("user_id", "vault_item_id");
CREATE INDEX "library_saves_user_id_idx" ON "library_saves"("user_id");
CREATE INDEX "library_saves_vault_item_id_idx" ON "library_saves"("vault_item_id");
ALTER TABLE "library_saves" ADD CONSTRAINT "library_saves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "library_saves" ADD CONSTRAINT "library_saves_vault_item_id_fkey" FOREIGN KEY ("vault_item_id") REFERENCES "vault_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Per-student reading activity (resume position + daily-deduped opens)
CREATE TABLE "library_views" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "vault_item_id" UUID NOT NULL,
  "last_viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "position" TEXT,
  "progress" DOUBLE PRECISION DEFAULT 0,
  "opens" INTEGER NOT NULL DEFAULT 1,
  "last_open_day" TEXT,
  CONSTRAINT "library_views_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "library_views_user_id_vault_item_id_key" ON "library_views"("user_id", "vault_item_id");
CREATE INDEX "library_views_user_id_last_viewed_at_idx" ON "library_views"("user_id", "last_viewed_at");
CREATE INDEX "library_views_vault_item_id_idx" ON "library_views"("vault_item_id");
ALTER TABLE "library_views" ADD CONSTRAINT "library_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "library_views" ADD CONSTRAINT "library_views_vault_item_id_fkey" FOREIGN KEY ("vault_item_id") REFERENCES "vault_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Public-resource reports (feed moderation)
CREATE TYPE "ReportStatus" AS ENUM ('open', 'resolved', 'dismissed');
CREATE TYPE "ReportReason" AS ENUM ('inappropriate', 'irrelevant', 'duplicate', 'incorrectly_categorized');
CREATE TABLE "library_reports" (
  "id" UUID NOT NULL,
  "vault_item_id" UUID NOT NULL,
  "reporter_user_id" UUID NOT NULL,
  "reason" "ReportReason" NOT NULL,
  "details" TEXT,
  "status" "ReportStatus" NOT NULL DEFAULT 'open',
  "resolved_at" TIMESTAMP(3),
  "resolved_by_admin" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "library_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "library_reports_vault_item_id_status_idx" ON "library_reports"("vault_item_id", "status");
CREATE INDEX "library_reports_reporter_user_id_idx" ON "library_reports"("reporter_user_id");
ALTER TABLE "library_reports" ADD CONSTRAINT "library_reports_vault_item_id_fkey" FOREIGN KEY ("vault_item_id") REFERENCES "vault_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "library_reports" ADD CONSTRAINT "library_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;