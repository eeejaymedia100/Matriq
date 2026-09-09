-- Duplicate detection must survive metadata edits: a participant who
-- re-uploads the same document under a new course code / department /
-- university is still a duplicate. The SHA-256 file_hash dies the moment a
-- file is re-saved (new timestamps in container headers), so we add a
-- content fingerprint over the file's deterministic byte chunks (PDF
-- object bodies, RIFF/PNG chunk data, JPEG scan streams) — stable across
-- re-encodes, immune to anything declared in the wizard.
ALTER TABLE "resource_submissions"
  ADD COLUMN "content_fingerprint" TEXT;

CREATE INDEX "resource_submissions_content_fingerprint_idx"
  ON "resource_submissions"("content_fingerprint");
