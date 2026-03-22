-- Gap 5: Evidence retention — prevent deletion of evidence from certified/locked sessions
-- and enforce 7-year retention period on evidence records.

-- 1. Retention column on evidence_records
ALTER TABLE evidence_records
  ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ
  DEFAULT (NOW() + INTERVAL '7 years');

-- 2. Trigger: block DELETE on evidence_links when linked object belongs to certified/locked session
CREATE OR REPLACE FUNCTION prevent_evidence_link_deletion_when_locked()
RETURNS TRIGGER AS $$
DECLARE v_status TEXT;
BEGIN
  IF OLD.object_type = 'journal_entry' THEN
    SELECT cs.status INTO v_status
    FROM journal_entries je
    JOIN close_sessions cs ON cs.id = je.close_session_id AND cs.tenant_id = je.tenant_id
    WHERE je.id = OLD.object_id AND je.tenant_id = OLD.tenant_id;
  ELSIF OLD.object_type = 'reconciliation' THEN
    SELECT cs.status INTO v_status
    FROM tenant_period_reconciliations r
    JOIN close_sessions cs ON cs.id = r.period_id AND cs.tenant_id = r.tenant_id
    WHERE r.recon_id = OLD.object_id AND r.tenant_id = OLD.tenant_id;
  END IF;

  IF v_status IN ('certified', 'locked', 'subsequent_events_review') THEN
    RAISE EXCEPTION 'Cannot delete evidence from a certified/locked close session (status: %)', v_status;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_evidence_link_delete ON evidence_links;
CREATE TRIGGER prevent_evidence_link_delete
  BEFORE DELETE ON evidence_links
  FOR EACH ROW EXECUTE FUNCTION prevent_evidence_link_deletion_when_locked();

-- 3. Trigger: block DELETE on evidence_records during retention period
CREATE OR REPLACE FUNCTION prevent_evidence_record_deletion_during_retention()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.retention_expires_at IS NOT NULL AND OLD.retention_expires_at > NOW() THEN
    RAISE EXCEPTION 'Cannot delete evidence record during retention period (expires: %)', OLD.retention_expires_at;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_evidence_record_delete_retention ON evidence_records;
CREATE TRIGGER prevent_evidence_record_delete_retention
  BEFORE DELETE ON evidence_records
  FOR EACH ROW EXECUTE FUNCTION prevent_evidence_record_deletion_during_retention();
