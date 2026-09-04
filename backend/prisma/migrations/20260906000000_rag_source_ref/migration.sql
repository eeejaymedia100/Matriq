-- Matriq — RAG completion: idempotent per-source ingestion.
-- source_ref uniquely locates the origin of an ingested chunk
-- ("vault:<itemId>:chunk3", "deepread:<pageId>") so re-ingesting the same
-- source updates in place instead of duplicating rows. NULL stays legal for
-- manually submitted material (the original ingestion path).
ALTER TABLE "ai_documents" ADD COLUMN "source_ref" TEXT;
CREATE UNIQUE INDEX "ai_documents_source_ref_key" ON "ai_documents"("source_ref");
CREATE INDEX "ai_documents_source_type_moderation_status_idx" ON "ai_documents"("source_type", "moderation_status");
CREATE INDEX "ai_documents_submitted_by_user_id_idx" ON "ai_documents"("submitted_by_user_id");
