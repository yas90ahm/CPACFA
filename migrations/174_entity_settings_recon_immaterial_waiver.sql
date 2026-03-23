-- Add immaterial auto-waiver threshold to entity settings.
-- When abs(unexplained_variance) < this threshold, recon can be completed
-- without a variance explanation (auto-waived as immaterial).
-- Default 0 = no auto-waiver (current behavior preserved).

ALTER TABLE tenant_entity_settings
  ADD COLUMN IF NOT EXISTS recon_immaterial_waiver_threshold NUMERIC(20,2) NOT NULL DEFAULT 0.00;

-- Add auto-advance flag: when all gates pass, auto-advance to next state
ALTER TABLE tenant_entity_settings
  ADD COLUMN IF NOT EXISTS auto_advance_enabled BOOLEAN NOT NULL DEFAULT FALSE;
