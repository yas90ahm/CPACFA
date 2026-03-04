-- Migration 138: Template auto-apply settings and consecutive tracking
-- Allows auto-applying JE templates after N consecutive unchanged applications.

ALTER TABLE tenant_entity_settings
  ADD COLUMN IF NOT EXISTS auto_apply_after_n_periods INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS template_auto_apply_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE tenant_aje_templates
  ADD COLUMN IF NOT EXISTS consecutive_unchanged_applications INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_apply_eligible BOOLEAN DEFAULT FALSE;
