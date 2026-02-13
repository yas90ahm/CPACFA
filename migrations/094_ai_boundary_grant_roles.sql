-- Grant migration runner (CURRENT_USER) membership in core_writer and ai_writer
-- so the app can SET ROLE for secure-by-default AI boundary.
-- Required for: core pool uses core_writer, ai pool uses ai_writer.

DO $$
BEGIN
  EXECUTE format('GRANT core_writer TO %I', current_user);
  EXECUTE format('GRANT ai_writer TO %I', current_user);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Grant roles to %: %', current_user, SQLERRM;
    RAISE;
END $$;
