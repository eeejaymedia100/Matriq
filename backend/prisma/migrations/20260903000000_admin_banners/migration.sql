-- Matriq — admin-controlled Home banners.
-- Lightweight global announcement strip shown on Home (UI direction: admin-
-- controlled, scrollable, minimal — NOT an advertising carousel). Distinct
-- from the association-scoped "announcements" table: these are created and
-- managed by Matriq admins for every student.
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link_label" TEXT,
    "link_url" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "banners_published_starts_at_ends_at_idx" ON "banners"("published", "starts_at", "ends_at");