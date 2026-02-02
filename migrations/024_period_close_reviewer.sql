-- Optional two-person close sign-off: reviewer (preparer/reviewer) on period_close.

ALTER TABLE period_close ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE period_close ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
