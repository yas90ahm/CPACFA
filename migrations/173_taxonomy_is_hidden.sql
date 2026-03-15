-- Renumbered: new migration for taxonomy line visibility toggle
-- Adds is_hidden column to fs_taxonomy_lines for PATCH /api/coa-mapping/taxonomy/:id

ALTER TABLE fs_taxonomy_lines ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;
