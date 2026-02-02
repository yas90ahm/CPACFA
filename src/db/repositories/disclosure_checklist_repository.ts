/**
 * Disclosure checklist per tenant — DB repository.
 */

import type { Pool } from 'pg';
import type { DisclosureItem, DisclosureItemStatus } from '../../types/disclosure_checklist.js';

function nextId(): string {
  return `disc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type DisclosureRow = {
  id: string;
  tenant_id: string;
  period_label: string;
  standard: string;
  topic: string;
  description: string;
  status: string;
  evidence_id: string | null;
  evidence_type: string | null;
  assignee: string | null;
  due_date: string | null;
  framework: string | null;
};

function rowToItem(row: DisclosureRow): DisclosureItem {
  return {
    id: row.id,
    standard: row.standard,
    topic: row.topic,
    description: row.description,
    status: row.status as DisclosureItemStatus,
    evidenceId: row.evidence_id ?? undefined,
    evidenceType: (row.evidence_type as DisclosureItem['evidenceType']) ?? undefined,
    periodLabel: row.period_label,
    assignee: row.assignee ?? undefined,
    dueDate: row.due_date ?? undefined,
    framework: row.framework as DisclosureItem['framework'] ?? undefined,
  };
}

const COLS =
  'id, tenant_id, period_label, standard, topic, description, status, evidence_id, evidence_type, assignee, due_date, framework';

export interface ListDisclosureOptions {
  /** Filter by GAAP framework (US_GAAP, IFRS, ASPE, FRS102). */
  framework?: string;
  /** Filter by citation (e.g. ASC 205). */
  citation?: string;
}

export async function list(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  options?: string | ListDisclosureOptions
): Promise<DisclosureItem[]> {
  const framework = typeof options === 'object' && options?.framework ? options.framework : undefined;
  const citation = typeof options === 'object' && options?.citation ? options.citation : (typeof options === 'string' ? options : undefined);
  let sql = `SELECT ${COLS} FROM disclosure_checklist WHERE tenant_id = $1 AND period_label = $2`;
  const params: unknown[] = [tenantId, periodLabel];
  if (framework) {
    params.push(framework);
    sql += ` AND framework = $${params.length}`;
  }
  if (citation) {
    params.push(citation);
    sql += ` AND standard = $${params.length}`;
  }
  sql += ' ORDER BY framework NULLS LAST, standard, topic';
  const r = await pool.query<DisclosureRow>(sql, params);
  return r.rows.map(rowToItem);
}

export async function get(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<DisclosureItem | null> {
  const r = await pool.query<DisclosureRow>(`SELECT ${COLS} FROM disclosure_checklist WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  const row = r.rows[0];
  if (!row) return null;
  return rowToItem(row);
}

export async function create(
  pool: Pool,
  tenantId: string,
  item: Omit<DisclosureItem, 'id'>
): Promise<DisclosureItem> {
  const id = nextId();
  await pool.query(
    `INSERT INTO disclosure_checklist (id, tenant_id, period_label, standard, topic, description, status, evidence_id, evidence_type, assignee, due_date, framework)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      tenantId,
      item.periodLabel,
      item.standard,
      item.topic,
      item.description ?? '',
      item.status ?? 'not_started',
      item.evidenceId ?? null,
      item.evidenceType ?? null,
      item.assignee ?? null,
      item.dueDate ?? null,
      item.framework ?? null,
    ]
  );
  return { ...item, id };
}

export async function update(
  pool: Pool,
  tenantId: string,
  id: string,
  patch: {
    status?: DisclosureItemStatus;
    evidenceId?: string;
    evidenceType?: DisclosureItem['evidenceType'];
    assignee?: string;
    dueDate?: string;
  }
): Promise<DisclosureItem | null> {
  const existing = await get(pool, tenantId, id);
  if (!existing) return null;
  const status = patch.status ?? existing.status;
  const evidenceId = patch.evidenceId !== undefined ? patch.evidenceId : existing.evidenceId;
  const evidenceType = patch.evidenceType !== undefined ? patch.evidenceType : existing.evidenceType;
  const assignee = patch.assignee !== undefined ? patch.assignee : existing.assignee;
  const dueDate = patch.dueDate !== undefined ? patch.dueDate : existing.dueDate;
  await pool.query(
    `UPDATE disclosure_checklist SET status = $1, evidence_id = $2, evidence_type = $3, assignee = $4, due_date = $5 WHERE id = $6 AND tenant_id = $7`,
    [status, evidenceId ?? null, evidenceType ?? null, assignee ?? null, dueDate ?? null, id, tenantId]
  );
  return get(pool, tenantId, id);
}
