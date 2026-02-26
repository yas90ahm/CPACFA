-- Migrate issue_items into tenant_close_issues (Step 4 Part H).
-- Old tables preserved for rollback safety.
-- TODO: Drop issue_items after confirming migration is correct and stable.

-- Map issue_items into tenant_close_issues (with entity_id from close_sessions)
INSERT INTO tenant_close_issues (
  issue_id, tenant_id, period_id, entity_id, issue_type, severity, category, status,
  title, description, affected_accounts, affected_amount, source_check, source_details,
  assigned_to, created_at, updated_at
)
SELECT
  i.id,
  i.tenant_id,
  i.close_session_id,
  COALESCE(cs.entity_id, 'unknown'),
  'manual_flag',
  CASE i.severity
    WHEN 'low' THEN 'info'
    WHEN 'med' THEN 'warning'
    WHEN 'high' THEN 'blocking'
    WHEN 'critical' THEN 'critical'
    ELSE 'warning'
  END,
  CASE i.category
    WHEN 'intake' THEN 'ingestion'
    WHEN 'classification' THEN 'ingestion'
    WHEN 'reconciliation' THEN 'reconciliation'
    WHEN 'posting' THEN 'adjustment'
    WHEN 'policy' THEN 'review'
    WHEN 'presentation' THEN 'statement'
    WHEN 'export_blocker' THEN 'statement'
    ELSE 'general'
  END,
  CASE i.status
    WHEN 'open' THEN 'detected'
    WHEN 'in_progress' THEN 'in_progress'
    WHEN 'needs_info' THEN 'in_progress'
    WHEN 'needs_approval' THEN 'assigned'
    WHEN 'resolved' THEN 'resolved'
    WHEN 'wont_fix' THEN 'waived'
    ELSE 'detected'
  END,
  i.title,
  COALESCE(i.description, ''),
  '{}',
  NULL,
  'migrated_from_issue_items',
  COALESCE(i.source_ref, '{}'),
  i.assigned_to,
  i.created_at,
  i.updated_at
FROM issue_items i
LEFT JOIN close_sessions cs ON cs.id = i.close_session_id AND cs.tenant_id = i.tenant_id
WHERE NOT EXISTS (SELECT 1 FROM tenant_close_issues t WHERE t.issue_id = i.id);

-- tenant_hitl_staging: no period_id in schema; cannot migrate into tenant_close_issues
-- (period_id NOT NULL). Staging items remain in tenant_hitl_staging for historical reference.
-- TODO: Drop tenant_hitl_staging and issue_items after confirming migration is correct and stable.
