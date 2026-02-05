-- Journal Entry system: lifecycle (draft → proposed → approved/posted/exported/rejected), lines, attachments.
-- Statement builder uses approved/posted JEs only; segregation: approved_by cannot equal created_by (configurable override).

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  close_session_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  memo TEXT,
  source TEXT NOT NULL,
  created_by TEXT,
  approved_by TEXT,
  posted_at TIMESTAMPTZ,
  reversal_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_je_status CHECK (status IN ('draft', 'proposed', 'approved', 'posted', 'exported', 'rejected')),
  CONSTRAINT chk_je_source CHECK (source IN ('manual', 'suggestion', 'recon', 'accrual'))
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_close_session ON journal_entries(close_session_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant ON journal_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_at ON journal_entries(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  je_id TEXT NOT NULL,
  line_index INTEGER NOT NULL,
  account_ref TEXT NOT NULL,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  PRIMARY KEY (je_id, line_index),
  CONSTRAINT fk_je_lines_je FOREIGN KEY (je_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  CONSTRAINT chk_je_line_debit_credit CHECK (debit >= 0 AND credit >= 0)
);

CREATE INDEX IF NOT EXISTS idx_je_lines_je ON journal_entry_lines(je_id);

CREATE TABLE IF NOT EXISTS je_attachments (
  id TEXT PRIMARY KEY,
  je_id TEXT NOT NULL,
  file_ref TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_je_attachments_je FOREIGN KEY (je_id) REFERENCES journal_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_je_attachments_je ON je_attachments(je_id);
