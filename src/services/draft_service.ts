/**
 * Draft service — Save for Later: uncommitted JSON adjustments from the CPA Bridge (and manual journal lines).
 * Persisted in tenant_draft_adjustments. Used to resume a balancing session without losing AI suggestions or manual entries.
 *
 * Export Gate and statement build use only committed/balanced data (period_trial_balance + approved HITL).
 * Drafts are never included in export or in buildFinancialStatements.
 */

import type { Pool } from 'pg';

/** Single uncommitted adjustment: CPA Bridge recommendation or journal line. */
export type DraftAdjustmentItem =
  | { kind: 'cpa_bridge'; standard: string; params: Record<string, unknown> }
  | { kind: 'journal'; accountName: string; debit?: number; credit?: number; memo?: string };

/** Payload stored in tenant_draft_adjustments.payload (JSONB). */
export interface DraftPayload {
  /** List of uncommitted adjustments (CPA Bridge + manual journal lines). */
  adjustments: DraftAdjustmentItem[];
  /** Optional summary for display (e.g. "Q1 2025 balancing session"). */
  summary?: string;
}

export interface DraftRow {
  id: string;
  tenantId: string;
  periodLabel: string | null;
  sessionId: string | null;
  label: string | null;
  payload: DraftPayload;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface SaveDraftParams {
  tenantId: string;
  periodLabel?: string | null;
  sessionId?: string | null;
  label?: string | null;
  payload: DraftPayload;
  createdBy?: string | null;
}

export interface ListDraftsParams {
  tenantId: string;
  periodLabel?: string | null;
  sessionId?: string | null;
  limit?: number;
}

function nextId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToDraft(r: {
  id: string;
  tenant_id: string;
  period_label: string | null;
  session_id: string | null;
  label: string | null;
  payload: unknown;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}): DraftRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    periodLabel: r.period_label ?? null,
    sessionId: r.session_id ?? null,
    label: r.label ?? null,
    payload: (r.payload as DraftPayload) ?? { adjustments: [] },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by ?? null,
  };
}

/**
 * Save a draft (uncommitted adjustments) for later. Creates a new row in tenant_draft_adjustments.
 */
export async function saveDraft(pool: Pool, params: SaveDraftParams): Promise<DraftRow> {
  const id = nextId();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO tenant_draft_adjustments (id, tenant_id, period_label, session_id, label, payload, created_at, updated_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)`,
    [
      id,
      params.tenantId,
      params.periodLabel ?? null,
      params.sessionId ?? null,
      params.label ?? null,
      JSON.stringify(params.payload),
      now,
      params.createdBy ?? null,
    ]
  );
  const got = await getDraft(pool, params.tenantId, id);
  if (!got) throw new Error('saveDraft: insert failed');
  return got;
}

/**
 * Get a single draft by id. Tenant-scoped.
 */
export async function getDraft(pool: Pool, tenantId: string, draftId: string): Promise<DraftRow | undefined> {
  const r = await pool.query(
    `SELECT id, tenant_id, period_label, session_id, label, payload, created_at, updated_at, created_by
     FROM tenant_draft_adjustments WHERE id = $1 AND tenant_id = $2`,
    [draftId, tenantId]
  );
  const row = r.rows[0];
  if (!row) return undefined;
  return rowToDraft(row as Parameters<typeof rowToDraft>[0]);
}

/**
 * List drafts for a tenant, optionally filtered by period_label or session_id.
 */
export async function listDrafts(pool: Pool, params: ListDraftsParams): Promise<DraftRow[]> {
  let query = `SELECT id, tenant_id, period_label, session_id, label, payload, created_at, updated_at, created_by
               FROM tenant_draft_adjustments WHERE tenant_id = $1`;
  const args: unknown[] = [params.tenantId];
  if (params.periodLabel != null && params.periodLabel !== '') {
    args.push(params.periodLabel);
    query += ` AND period_label = $${args.length}`;
  }
  if (params.sessionId != null && params.sessionId !== '') {
    args.push(params.sessionId);
    query += ` AND session_id = $${args.length}`;
  }
  query += ' ORDER BY updated_at DESC';
  const limit = params.limit ?? 50;
  args.push(limit);
  query += ` LIMIT $${args.length}`;
  const r = await pool.query(query, args);
  return r.rows.map((row) => rowToDraft(row as Parameters<typeof rowToDraft>[0]));
}

/**
 * Update an existing draft's payload and/or label. Tenant-scoped.
 */
export async function updateDraft(
  pool: Pool,
  tenantId: string,
  draftId: string,
  update: { payload?: DraftPayload; label?: string | null }
): Promise<DraftRow | undefined> {
  const now = new Date().toISOString();
  if (update.payload != null && update.label !== undefined) {
    await pool.query(
      `UPDATE tenant_draft_adjustments SET payload = $1, label = $2, updated_at = $3 WHERE id = $4 AND tenant_id = $5`,
      [JSON.stringify(update.payload), update.label ?? null, now, draftId, tenantId]
    );
  } else if (update.payload != null) {
    await pool.query(
      `UPDATE tenant_draft_adjustments SET payload = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4`,
      [JSON.stringify(update.payload), now, draftId, tenantId]
    );
  } else if (update.label !== undefined) {
    await pool.query(
      `UPDATE tenant_draft_adjustments SET label = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4`,
      [update.label ?? null, now, draftId, tenantId]
    );
  }
  return getDraft(pool, tenantId, draftId);
}

/**
 * Delete a draft. Tenant-scoped. Returns true if a row was deleted.
 */
export async function deleteDraft(pool: Pool, tenantId: string, draftId: string): Promise<boolean> {
  const r = await pool.query(`DELETE FROM tenant_draft_adjustments WHERE id = $1 AND tenant_id = $2`, [
    draftId,
    tenantId,
  ]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Get drafts for hydrating a workspace (resume session). Returns all draft rows for the given tenant and optional session/period,
 * with their payloads combined into a single list of adjustments for the Supervisor to show as "uncommitted draft adjustments".
 * Export and buildFinancialStatements never use this; only committed/balanced data is exported.
 */
export async function getDraftsForHydration(
  pool: Pool,
  tenantId: string,
  options?: { sessionId?: string | null; periodLabel?: string | null; limit?: number }
): Promise<DraftAdjustmentItem[]> {
  const rows = await listDrafts(pool, {
    tenantId,
    sessionId: options?.sessionId ?? undefined,
    periodLabel: options?.periodLabel ?? undefined,
    limit: options?.limit ?? 20,
  });
  const adjustments: DraftAdjustmentItem[] = [];
  for (const row of rows) {
    if (row.payload?.adjustments && Array.isArray(row.payload.adjustments)) {
      for (const a of row.payload.adjustments) {
        if (a && typeof a === 'object' && 'kind' in a) adjustments.push(a as DraftAdjustmentItem);
      }
    }
  }
  return adjustments;
}
