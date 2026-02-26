-- Statement lines hierarchy: display order, indent, subtotals, sections for frontend rendering.

ALTER TABLE statement_lines
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS indent_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_subtotal BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_grand_total BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS section_name TEXT;

CREATE INDEX IF NOT EXISTS idx_statement_lines_display
  ON statement_lines(package_id, statement, display_order);
