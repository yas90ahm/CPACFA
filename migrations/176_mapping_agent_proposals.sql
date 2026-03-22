-- Migration 176: Mapping agent proposals and learning loop tables.
-- Supports Layer 3 (agentic balance validation) and Layer 5 (learning loop).

-- Agent-generated mapping correction proposals
CREATE TABLE IF NOT EXISTS mapping_correction_proposals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  close_session_id TEXT NOT NULL,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,

  -- Current (suspect) mapping
  current_fs_line_id TEXT NOT NULL,
  current_fs_line_name TEXT,

  -- Proposed correction
  proposed_fs_line_id TEXT NOT NULL,
  proposed_fs_line_name TEXT,

  -- Why the current mapping is wrong
  mismatch_type TEXT NOT NULL CHECK (mismatch_type IN (
    'reversed_balance', 'wrong_statement', 'contra_mismatch',
    'magnitude_anomaly', 'name_contradiction', 'cross_validation_failure'
  )),
  mismatch_evidence TEXT NOT NULL,

  -- Agent reasoning
  reasoning TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  asc_reference TEXT,

  -- XBRL context used
  xbrl_element_id TEXT,
  xbrl_label TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_tenant_session ON mapping_correction_proposals(tenant_id, close_session_id);
CREATE INDEX IF NOT EXISTS idx_mcp_status ON mapping_correction_proposals(tenant_id, close_session_id, status);

-- Learning loop: corrections that override AI suggestions
-- Captures what the controller actually chose when they rejected AI
CREATE TABLE IF NOT EXISTS mapping_corrections_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,

  -- The account pattern (normalized lowercase, stripped of numbers/special chars)
  account_name_pattern TEXT NOT NULL,
  account_code_pattern TEXT,

  -- What AI suggested (rejected)
  rejected_fs_line_id TEXT NOT NULL,
  rejected_confidence NUMERIC(5,4),

  -- What the controller chose
  chosen_fs_line_id TEXT NOT NULL,
  chosen_fs_line_name TEXT,

  -- Context
  source TEXT NOT NULL CHECK (source IN ('manual_override', 'agent_proposal_rejected', 'suggestion_rejected')),
  close_session_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcl_pattern ON mapping_corrections_log(tenant_id, account_name_pattern);
CREATE INDEX IF NOT EXISTS idx_mcl_entity ON mapping_corrections_log(tenant_id, entity_id);

-- Cross-tenant learning: anonymized patterns (no tenant_id, no account codes)
-- Aggregated: "accounts containing 'depreciation' should map to contra-asset, not asset"
CREATE TABLE IF NOT EXISTS mapping_pattern_signals (
  id TEXT PRIMARY KEY,
  -- Normalized name pattern (e.g., 'depreciation', 'allowance', 'accrued')
  name_keyword TEXT NOT NULL,
  -- What it should map to (voted by corrections)
  correct_fs_line_id TEXT NOT NULL,
  correct_fs_line_name TEXT,
  -- How many corrections support this signal
  signal_strength INTEGER NOT NULL DEFAULT 1,
  -- Balance direction hint
  expected_balance_direction TEXT CHECK (expected_balance_direction IN ('debit', 'credit')),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(name_keyword, correct_fs_line_id)
);

CREATE INDEX IF NOT EXISTS idx_mps_keyword ON mapping_pattern_signals(name_keyword);
