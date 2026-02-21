-- AJE template application: skip reason when skipped.

ALTER TABLE tenant_aje_template_applications
  ADD COLUMN IF NOT EXISTS skip_reason TEXT;
