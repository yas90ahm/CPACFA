-- Rollback for 093_ai_boundary_schemas.sql
-- Move tables back to public; drop roles and schemas.
-- Run manually if needed: psql $DATABASE_URL -f migrations/093_ai_boundary_schemas_down.sql

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'core')
  LOOP
    EXECUTE format('ALTER TABLE core.%I SET SCHEMA public', r.tablename);
  END LOOP;
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'ai')
  LOOP
    EXECUTE format('ALTER TABLE ai.%I SET SCHEMA public', r.tablename);
  END LOOP;
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'audit')
  LOOP
    EXECUTE format('ALTER TABLE audit.%I SET SCHEMA public', r.tablename);
  END LOOP;
END $$;

DROP ROLE IF EXISTS core_writer;
DROP ROLE IF EXISTS ai_writer;
DROP ROLE IF EXISTS auditor_reader;
DROP SCHEMA IF EXISTS core CASCADE;
DROP SCHEMA IF EXISTS ai CASCADE;
DROP SCHEMA IF EXISTS audit CASCADE;
