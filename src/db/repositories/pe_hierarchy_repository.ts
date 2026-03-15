/**
 * PE Reporting Hierarchy — DB repository (tenant-scoped).
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { PEHierarchyLine } from '../../types/pe_hierarchy.js';

interface PEHierarchyRow {
  id: string;
  tenant_id: string;
  pe_line_id: string;
  pe_line_name: string;
  parent_pe_line_id: string | null;
  display_order: number;
  statement: string;
  created_at: string;
}

function rowToLine(row: PEHierarchyRow): PEHierarchyLine {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    peLineId: row.pe_line_id,
    peLineName: row.pe_line_name,
    parentPeLineId: row.parent_pe_line_id ?? undefined,
    displayOrder: row.display_order,
    statement: row.statement,
    createdAt: row.created_at,
  };
}

const SELECT_COLS = `id, tenant_id, pe_line_id, pe_line_name, parent_pe_line_id, display_order, statement, created_at`;

/** List full PE hierarchy for a tenant, ordered by statement then display_order. */
export async function getHierarchy(
  pool: Pool,
  tenantId: string,
  opts?: { statement?: string }
): Promise<PEHierarchyLine[]> {
  let sql = `SELECT ${SELECT_COLS} FROM tenant_pe_hierarchy WHERE tenant_id = $1`;
  const params: unknown[] = [tenantId];
  if (opts?.statement) {
    sql += ` AND statement = $2`;
    params.push(opts.statement);
  }
  sql += ' ORDER BY statement, display_order, pe_line_name';
  const r = await pool.query<PEHierarchyRow>(sql, params);
  return r.rows.map(rowToLine);
}

/** Upsert a single PE hierarchy line (insert or update on tenant_id + pe_line_id). */
export async function upsertLine(
  pool: Pool,
  tenantId: string,
  input: {
    peLineId: string;
    peLineName: string;
    parentPeLineId?: string | null;
    displayOrder?: number;
    statement?: string;
  }
): Promise<PEHierarchyLine> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO tenant_pe_hierarchy (id, tenant_id, pe_line_id, pe_line_name, parent_pe_line_id, display_order, statement)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tenant_id, pe_line_id)
     DO UPDATE SET pe_line_name = EXCLUDED.pe_line_name,
       parent_pe_line_id = EXCLUDED.parent_pe_line_id,
       display_order = EXCLUDED.display_order,
       statement = EXCLUDED.statement`,
    [
      id,
      tenantId,
      input.peLineId,
      input.peLineName,
      input.parentPeLineId ?? null,
      input.displayOrder ?? 0,
      input.statement ?? 'PL',
    ]
  );
  const r = await pool.query<PEHierarchyRow>(
    `SELECT ${SELECT_COLS} FROM tenant_pe_hierarchy WHERE tenant_id = $1 AND pe_line_id = $2`,
    [tenantId, input.peLineId]
  );
  return rowToLine(r.rows[0]);
}

/** Delete a PE hierarchy line. Returns true if a row was deleted. */
export async function deleteLine(
  pool: Pool,
  tenantId: string,
  peLineId: string
): Promise<boolean> {
  const r = await pool.query(
    'DELETE FROM tenant_pe_hierarchy WHERE tenant_id = $1 AND pe_line_id = $2',
    [tenantId, peLineId]
  );
  return (r.rowCount ?? 0) > 0;
}
