-- Audit engagements: group periods for an audit (e.g. FY24 audit).
-- audit_engagements: one row per engagement (tenant-scoped).
-- audit_engagement_periods: engagement_id, period_label, sort_order.

CREATE TABLE IF NOT EXISTS audit_engagements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_engagements_tenant ON audit_engagements (tenant_id);

CREATE TABLE IF NOT EXISTS audit_engagement_periods (
  engagement_id TEXT NOT NULL REFERENCES audit_engagements (id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (engagement_id, period_label)
);

CREATE INDEX IF NOT EXISTS idx_audit_engagement_periods_engagement ON audit_engagement_periods (engagement_id);
