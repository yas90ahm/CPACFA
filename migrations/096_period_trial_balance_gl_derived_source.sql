-- Add 'gl_derived' to period_trial_balance.source to support GL-only flow.
-- When GL is uploaded and TB derived, persist to period_trial_balance with source='gl_derived'.

-- Handle both public and core schema (migration 093 may have moved the table)
DO $$
BEGIN
  -- Try core schema first (post-093)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'period_trial_balance') THEN
    ALTER TABLE core.period_trial_balance DROP CONSTRAINT IF EXISTS period_trial_balance_source_check;
    ALTER TABLE core.period_trial_balance ADD CONSTRAINT period_trial_balance_source_check
      CHECK (source IN ('uploaded', 'synced', 'gl_derived'));
  END IF;
  -- Also handle public schema (pre-093 or shared-DB tenants)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'period_trial_balance') THEN
    ALTER TABLE public.period_trial_balance DROP CONSTRAINT IF EXISTS period_trial_balance_source_check;
    ALTER TABLE public.period_trial_balance ADD CONSTRAINT period_trial_balance_source_check
      CHECK (source IN ('uploaded', 'synced', 'gl_derived'));
  END IF;
END $$;
