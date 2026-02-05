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
    createdAt: row.created_at,
  };
}

export async function listFsTaxonomyLines(pool: Pool): Promise<FsTaxonomyLine[]> {
  const r = await pool.query<FsTaxonomyRow>(
    'SELECT id, code, name, statement, parent_id, normal_balance, created_at FROM fs_taxonomy_lines ORDER BY statement, code'
  );
  return r.rows.map(rowToLine);
}

export async function getFsTaxonomyLineById(pool: Pool, id: string): Promise<FsTaxonomyLine | null> {
  const r = await pool.query<FsTaxonomyRow>(
    'SELECT id, code, name, statement, parent_id, normal_balance, created_at FROM fs_taxonomy_lines WHERE id = $1',
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
