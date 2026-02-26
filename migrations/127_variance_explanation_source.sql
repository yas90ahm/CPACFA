-- Track how variance explanations were created for AI audit trail.
-- manual: typed by human, ai_draft: accepted AI draft as-is, ai_edited: AI draft modified by human.

ALTER TABLE tenant_variance_analysis
ADD COLUMN IF NOT EXISTS explanation_source TEXT DEFAULT NULL;

ALTER TABLE tenant_variance_analysis
DROP CONSTRAINT IF EXISTS chk_explanation_source;

ALTER TABLE tenant_variance_analysis
ADD CONSTRAINT chk_explanation_source
CHECK (explanation_source IS NULL OR explanation_source IN ('manual', 'ai_draft', 'ai_edited'));
