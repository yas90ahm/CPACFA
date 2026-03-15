-- Renumbered from 069 to 169 to resolve duplicate prefix
-- GAP I4: Variance classification — type and full-year impact.

ALTER TABLE tenant_variance_analysis ADD COLUMN IF NOT EXISTS variance_type TEXT;
ALTER TABLE tenant_variance_analysis ADD COLUMN IF NOT EXISTS full_year_impact NUMERIC(20,2);
