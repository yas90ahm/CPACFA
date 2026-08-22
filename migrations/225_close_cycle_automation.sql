-- Entity-scoped recurring close kickoff configuration for the Canadian ASPE MVP.
-- Existing calendar settings remain backward compatible; automation is opt-in.

ALTER TABLE core.tenant_close_calendar_config
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS connection_id TEXT,
  ADD COLUMN IF NOT EXISTS profile_id TEXT NOT NULL DEFAULT 'ca-aspe-private-enterprise',
  ADD COLUMN IF NOT EXISTS close_frequency TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS auto_start_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS next_period_label TEXT,
  ADD COLUMN IF NOT EXISTS start_offset_days INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS start_time_local TIME NOT NULL DEFAULT TIME '06:00',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  ADD COLUMN IF NOT EXISTS last_dispatched_period TEXT,
  ADD COLUMN IF NOT EXISTS last_dispatched_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'core.tenant_close_calendar_config'::regclass
      AND conname = 'chk_close_calendar_frequency'
  ) THEN
    ALTER TABLE core.tenant_close_calendar_config
      ADD CONSTRAINT chk_close_calendar_frequency
      CHECK (close_frequency IN ('monthly', 'quarterly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'core.tenant_close_calendar_config'::regclass
      AND conname = 'chk_close_calendar_start_offset'
  ) THEN
    ALTER TABLE core.tenant_close_calendar_config
      ADD CONSTRAINT chk_close_calendar_start_offset
      CHECK (start_offset_days BETWEEN 0 AND 31);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'core.tenant_close_calendar_config'::regclass
      AND conname = 'chk_close_calendar_next_period'
  ) THEN
    ALTER TABLE core.tenant_close_calendar_config
      ADD CONSTRAINT chk_close_calendar_next_period
      CHECK (next_period_label IS NULL OR next_period_label ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'core.tenant_close_calendar_config'::regclass
      AND conname = 'chk_close_calendar_auto_start_complete'
  ) THEN
    ALTER TABLE core.tenant_close_calendar_config
      ADD CONSTRAINT chk_close_calendar_auto_start_complete
      CHECK (
        auto_start_enabled = FALSE
        OR (
          entity_id IS NOT NULL AND length(trim(entity_id)) > 0
          AND connection_id IS NOT NULL AND length(trim(connection_id)) > 0
          AND next_period_label IS NOT NULL
        )
      );
  END IF;
END $$;
