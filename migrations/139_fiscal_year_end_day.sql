-- Add fiscal_year_end_day to entity settings for non-standard fiscal year ends
ALTER TABLE tenant_entity_settings
  ADD COLUMN IF NOT EXISTS fiscal_year_end_day INTEGER NOT NULL DEFAULT 31
    CHECK (fiscal_year_end_day >= 1 AND fiscal_year_end_day <= 31);
