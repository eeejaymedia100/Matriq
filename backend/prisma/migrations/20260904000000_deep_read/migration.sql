-- Matriq — Deep Read: premium handwriting OCR (Magic Plus).
-- An async job per batch of photographed pages; pages are transcribed by the
-- Pro-class vision model server-side (semaphore-limited), with per-page
-- result caching by content hash so retries never re-bill the vision API.
CREATE TABLE "deep_read_jobs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "completed_pages" INTEGER NOT NULL DEFAULT 0,
    "failed_pages" INTEGER NOT NULL DEFAULT 0,
    "best_engine" TEXT,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "deep_read_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deep_read_pages" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "image_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "engine" TEXT,
    "confidence" INTEGER,
    "content_hash" TEXT NOT NULL,
    "text" TEXT,
    "blocks" JSONB,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "deep_read_pages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deep_read_jobs_user_id_created_at_idx" ON "deep_read_jobs"("user_id", "created_at");
CREATE INDEX "deep_read_jobs_status_created_at_idx" ON "deep_read_jobs"("status", "created_at");
CREATE INDEX "deep_read_pages_job_id_page_number_idx" ON "deep_read_pages"("job_id", "page_number");
CREATE INDEX "deep_read_pages_content_hash_idx" ON "deep_read_pages"("content_hash");

ALTER TABLE "deep_read_jobs"
    ADD CONSTRAINT "deep_read_jobs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deep_read_pages"
    ADD CONSTRAINT "deep_read_pages_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "deep_read_jobs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
