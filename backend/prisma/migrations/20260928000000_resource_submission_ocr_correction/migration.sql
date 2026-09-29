-- Keyboard-style OCR auto-correction stores its per-submission audit trail
-- (what changed, from → to, evidence, OOV ratio) as JSON. Kept separate from
-- ai_audit_report because this stage is deterministic and must survive even
-- when the AI auditor is unavailable. Null = no OCR text was processed.
ALTER TABLE "resource_submissions"
  ADD COLUMN "ocr_correction" JSONB;
