-- Add database_url to tenants for BYOD (existing DBs that ran 001 before this column existed).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS database_url TEXT;
