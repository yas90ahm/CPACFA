-- Move ai_coa_suggestions and ai_cf_suggestions to ai schema for boundary enforcement.
-- Idempotent: checks if tables exist in public schema before moving.

DO $$
BEGIN
  -- Move ai_coa_suggestions to ai schema if it exists in public and not already in ai
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_coa_suggestions'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'ai' AND table_name = 'ai_coa_suggestions'
  ) THEN
    ALTER TABLE public.ai_coa_suggestions SET SCHEMA ai;
  END IF;
END $$;

DO $$
BEGIN
  -- Move ai_cf_suggestions to ai schema if it exists in public and not already in ai
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_cf_suggestions'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'ai' AND table_name = 'ai_cf_suggestions'
  ) THEN
    ALTER TABLE public.ai_cf_suggestions SET SCHEMA ai;
  END IF;
END $$;

-- Grant permissions to ai_writer role (idempotent — GRANT is safe to re-run)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_writer') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'ai' AND table_name = 'ai_coa_suggestions') THEN
      GRANT SELECT, INSERT, UPDATE ON ai.ai_coa_suggestions TO ai_writer;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'ai' AND table_name = 'ai_cf_suggestions') THEN
      GRANT SELECT, INSERT, UPDATE ON ai.ai_cf_suggestions TO ai_writer;
    END IF;
  END IF;
END $$;

-- Grant read + update access to core_writer (for acceptance flow)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'core_writer') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'ai' AND table_name = 'ai_coa_suggestions') THEN
      GRANT SELECT, UPDATE ON ai.ai_coa_suggestions TO core_writer;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'ai' AND table_name = 'ai_cf_suggestions') THEN
      GRANT SELECT, UPDATE ON ai.ai_cf_suggestions TO core_writer;
    END IF;
  END IF;
END $$;
