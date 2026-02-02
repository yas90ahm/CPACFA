-- Add framework (AccountingStandard) to disclosure_checklist for multi-GAAP filtering and seeding.
ALTER TABLE disclosure_checklist ADD COLUMN IF NOT EXISTS framework TEXT;
CREATE INDEX IF NOT EXISTS idx_disclosure_checklist_framework ON disclosure_checklist(tenant_id, period_label, framework);
