-- Variance analysis: AI-generated draft explanation (advisory; human edits and submits).

ALTER TABLE tenant_variance_analysis
  ADD COLUMN IF NOT EXISTS ai_draft_explanation TEXT;
