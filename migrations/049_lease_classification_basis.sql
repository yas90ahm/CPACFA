-- Lease classification basis (ASC 842 / IFRS 16) for deposition-ready audit trail

ALTER TABLE leases ADD COLUMN IF NOT EXISTS classification_basis JSONB;
