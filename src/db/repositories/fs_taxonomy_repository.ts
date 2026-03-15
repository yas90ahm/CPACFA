/**
 * FS Taxonomy Lines — DB repository (tenant-scoped pool).
 */

import type { Pool } from 'pg';
import type { FsTaxonomyLine } from '../../types/coa_mapping.js';

interface FsTaxonomyRow {
  id: string;
  code: string;
  name: string;
  statement: string;
  parent_id: string | null;
  normal_balance: string;
  is_subtotal: boolean;
  is_contra: boolean;
  is_hidden: boolean;
  display_order: number;
  xbrl_element: string | null;
  xbrl_label: string | null;
  created_at: string;
}

function rowToLine(row: FsTaxonomyRow): FsTaxonomyLine {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    statement: row.statement as FsTaxonomyLine['statement'],
    parentId: row.parent_id ?? undefined,
    normalBalance: row.normal_balance as FsTaxonomyLine['normalBalance'],
    isSubtotal: row.is_subtotal ?? false,
    isContra: row.is_contra ?? false,
    isHidden: row.is_hidden ?? false,
    displayOrder: row.display_order ?? 0,
    xbrlElement: row.xbrl_element ?? undefined,
    xbrlLabel: row.xbrl_label ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listFsTaxonomyLines(pool: Pool): Promise<FsTaxonomyLine[]> {
  const r = await pool.query<FsTaxonomyRow>(
    `SELECT id, code, name, statement, parent_id, normal_balance,
       COALESCE(is_subtotal, FALSE) AS is_subtotal,
       COALESCE(is_contra, FALSE) AS is_contra,
       COALESCE(is_hidden, FALSE) AS is_hidden,
       COALESCE(display_order, 0) AS display_order,
       xbrl_element, xbrl_label,
       created_at
     FROM fs_taxonomy_lines ORDER BY display_order, statement, code`
  );
  return r.rows.map(rowToLine);
}

export async function getFsTaxonomyLineById(pool: Pool, id: string): Promise<FsTaxonomyLine | null> {
  const r = await pool.query<FsTaxonomyRow>(
    `SELECT id, code, name, statement, parent_id, normal_balance,
       COALESCE(is_subtotal, FALSE) AS is_subtotal,
       COALESCE(is_contra, FALSE) AS is_contra,
       COALESCE(is_hidden, FALSE) AS is_hidden,
       COALESCE(display_order, 0) AS display_order,
       xbrl_element, xbrl_label,
       created_at
     FROM fs_taxonomy_lines WHERE id = $1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToLine(row);
}

export async function upsertFsTaxonomyLine(
  pool: Pool,
  input: { id: string; code: string; name: string; statement: string; parentId?: string | null; normalBalance?: string }
): Promise<FsTaxonomyLine> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET code = $2, name = $3, statement = $4, parent_id = $5, normal_balance = $6`,
    [
      input.id,
      input.code,
      input.name,
      input.statement,
      input.parentId ?? null,
      input.normalBalance ?? 'debit',
      now,
    ]
  );
  const got = await getFsTaxonomyLineById(pool, input.id);
  return got!;
}

export async function toggleFsTaxonomyLineHidden(
  pool: Pool,
  id: string,
  isHidden?: boolean
): Promise<FsTaxonomyLine | null> {
  // If isHidden is not provided, toggle the current value
  const query = isHidden !== undefined
    ? `UPDATE fs_taxonomy_lines SET is_hidden = $2 WHERE id = $1 RETURNING id`
    : `UPDATE fs_taxonomy_lines SET is_hidden = NOT COALESCE(is_hidden, FALSE) WHERE id = $1 RETURNING id`;
  const params = isHidden !== undefined ? [id, isHidden] : [id];
  const result = await pool.query(query, params);
  if (result.rowCount === 0) return null;
  return getFsTaxonomyLineById(pool, id);
}
