-- Auto-match rules: user-defined transaction matching rules.
CREATE TABLE IF NOT EXISTS tenant_auto_match_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_id TEXT,
  account_code TEXT,

  rule_name TEXT NOT NULL,
  -- Conditions
  description_pattern TEXT,          -- regex or substring match
  amount_min NUMERIC(20,2),
  amount_max NUMERIC(20,2),
  counterparty_pattern TEXT,
  transaction_type TEXT,
  -- Action
  target_gl_account TEXT,            -- map to this GL account
  auto_confirm BOOLEAN NOT NULL DEFAULT FALSE,

  priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_match_rules_tenant ON tenant_auto_match_rules(tenant_id);

-- Clearing items: tracks outstanding checks, deposits in transit, etc.
CREATE TABLE IF NOT EXISTS tenant_clearing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  period_id TEXT NOT NULL REFERENCES close_sessions(id),
  recon_id UUID,
  account_code TEXT NOT NULL,

  item_type TEXT NOT NULL CHECK (item_type IN ('outstanding_check', 'deposit_in_transit', 'pending_transfer', 'other')),
  description TEXT NOT NULL,
  amount NUMERIC(20,2) NOT NULL,
  original_date DATE NOT NULL,
  expected_clearing_date DATE,

  status TEXT NOT NULL DEFAULT 'outstanding' CHECK (status IN ('outstanding', 'cleared', 'voided', 'stale')),
  cleared_date DATE,
  cleared_by TEXT,
  days_outstanding INTEGER, -- computed at query time: CURRENT_DATE - original_date

  bank_transaction_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_clearing_items_tenant ON tenant_clearing_items(tenant_id, period_id);
CREATE INDEX IF NOT EXISTS idx_clearing_items_status ON tenant_clearing_items(tenant_id, status);

-- Close tasks: assignable work items for close process
CREATE TABLE IF NOT EXISTS tenant_close_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  close_session_id TEXT NOT NULL REFERENCES close_sessions(id),
  entity_id TEXT,

  task_type TEXT NOT NULL CHECK (task_type IN (
    'mapping', 'reconciliation', 'journal_entry', 'evidence_upload',
    'variance_explanation', 'statement_review', 'checklist_item', 'custom'
  )),
  title TEXT NOT NULL,
  description TEXT,
  related_object_type TEXT,   -- 'recon', 'je', 'variance', etc.
  related_object_id TEXT,

  assigned_to TEXT,
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ,
  due_date DATE,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'blocked')),
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),

  depends_on UUID[],          -- task IDs that must complete first
  gate_id TEXT,               -- which gate this task relates to

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_close_tasks_session ON tenant_close_tasks(tenant_id, close_session_id);
CREATE INDEX IF NOT EXISTS idx_close_tasks_assignee ON tenant_close_tasks(tenant_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_close_tasks_status ON tenant_close_tasks(tenant_id, status);

-- Notifications: in-app notification log
CREATE TABLE IF NOT EXISTS tenant_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  close_session_id UUID,

  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'gate_passed', 'gate_failed', 'auto_advanced', 'task_assigned',
    'task_due_soon', 'task_overdue', 'recon_completed', 'je_posted',
    'review_rejected', 'certified', 'custom'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'success', 'error')),

  read_at TIMESTAMPTZ,
  action_url TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON tenant_notifications(tenant_id, user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_session ON tenant_notifications(tenant_id, close_session_id);
