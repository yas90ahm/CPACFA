-- Revenue allocation rationale (ASC 606 / IFRS 15) for deposition-ready audit trail

ALTER TABLE revenue_contracts ADD COLUMN IF NOT EXISTS allocation_rationale TEXT;
