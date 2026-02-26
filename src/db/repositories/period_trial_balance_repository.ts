/**
 * Period trial balance — unadjusted TB per tenant+period (uploaded or synced).
 * Uses tenant pool.
 */

import type { Pool } from 'pg';
import type { TrialBalanceEntry } from '../../types/financial.js';

export type PeriodTrialBalanceSource = 'uploaded' | 'synced' | 'gl_derived';

export interface PeriodTrialBalanceMeta {
  source: PeriodTrialBalanceSource;
  uploadedBy?: string;
  uploadedAt?: string;
  syncedBy?: string;
  syncedAt?: string;
  fileName?: string;
  connectionId?: string;
}

export interface PeriodTrialBalanceRecord {
  tenantId: string;
  periodLabel: string;
  source: PeriodTrialBalanceSource;
  entries: TrialBalanceEntry[];
  uploadedAt?: string;
  uploadedBy?: string;
  syncedAt?: string;
  syncedBy?: string;
  fileName?: string;
  connectionId?: string;
  createdAt: string;
  updatedAt: string;
}

function rowToRecord(row: {
  tenant_id: string;
  period_label: string;
  source: string;
  entries: unknown;
  uploaded_at: string | null;
  uploaded_by: string | null;
  synced_at: string | null;
  synced_by: string | null;
  file_name: string | null;
  connection_id: string | null;
  created_at: string;
  updated_at: string;
}): PeriodTrialBalanceRecord {
  const entries = Array.isArray(row.entries) ? (row.entries as TrialBalanceEntry[]) : [];
  return {
    tenantId: row.tenant_id,
    periodLabel: row.period_label,
    source: row.source as PeriodTrialBalanceSource,
    entries,
    uploadedAt: row.uploaded_at ?? undefined,
    uploadedBy: row.uploaded_by ?? undefined,
    syncedAt: row.synced_at ?? undefined,
    syncedBy: row.synced_by ?? undefined,
    fileName: row.file_name ?? undefined,
    connectionId: row.connection_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertUnadjusted(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  entries: TrialBalanceEntry[],
  meta: PeriodTrialBalanceMeta
): Promise<PeriodTrialBalanceRecord> {
  const now = new Date().toISOString();
  const source = meta.source;
  const uploadedAt = source === 'uploaded' || source === 'gl_derived' ? now : null;
  const uploadedBy = source === 'uploaded' || source === 'gl_derived' ? meta.uploadedBy ?? null : null;
  const syncedAt = source === 'synced' ? now : null;
  const syncedBy = source === 'synced' ? meta.syncedBy ?? null : null;
  const fileName = meta.fileName ?? null;
  const connectionId = meta.connectionId ?? null;

  await pool.query(
    `INSERT INTO period_trial_balance (tenant_id, period_label, source, entries, uploaded_at, uploaded_by, synced_at, synced_by, file_name, connection_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     ON CONFLICT (tenant_id, period_label)
     DO UPDATE SET source = EXCLUDED.source, entries = EXCLUDED.entries,
       uploaded_at = COALESCE(EXCLUDED.uploaded_at, period_trial_balance.uploaded_at),
       uploaded_by = COALESCE(EXCLUDED.uploaded_by, period_trial_balance.uploaded_by),
       synced_at = COALESCE(EXCLUDED.synced_at, period_trial_balance.synced_at),
       synced_by = COALESCE(EXCLUDED.synced_by, period_trial_balance.synced_by),
       file_name = COALESCE(EXCLUDED.file_name, period_trial_balance.file_name),
       connection_id = COALESCE(EXCLUDED.connection_id, period_trial_balance.connection_id),
       updated_at = EXCLUDED.updated_at`,
    [
      tenantId,
      periodLabel,
      source,
      JSON.stringify(entries),
      uploadedAt,
      uploadedBy,
      syncedAt,
      syncedBy,
      fileName,
      connectionId,
      now,
    ]
  );

  const r = await pool.query<{
    tenant_id: string;
    period_label: string;
    source: string;
    entries: unknown;
    uploaded_at: string | null;
    uploaded_by: string | null;
    synced_at: string | null;
    synced_by: string | null;
    file_name: string | null;
    connection_id: string | null;
    created_at: string;
    updated_at: string;
  }>(
    'SELECT tenant_id, period_label, source, entries, uploaded_at, uploaded_by, synced_at, synced_by, file_name, connection_id, created_at, updated_at FROM period_trial_balance WHERE tenant_id = $1 AND period_label = $2',
    [tenantId, periodLabel]
  );
  const row = r.rows[0];
  if (!row) throw new Error('Failed to read back period_trial_balance after upsert');
  return rowToRecord(row);
}

export async function getUnadjusted(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<PeriodTrialBalanceRecord | null> {
  const r = await pool.query<{
    tenant_id: string;
    period_label: string;
    source: string;
    entries: unknown;
    uploaded_at: string | null;
    uploaded_by: string | null;
    synced_at: string | null;
    synced_by: string | null;
    file_name: string | null;
    connection_id: string | null;
    created_at: string;
    updated_at: string;
  }>(
    'SELECT tenant_id, period_label, source, entries, uploaded_at, uploaded_by, synced_at, synced_by, file_name, connection_id, created_at, updated_at FROM period_trial_balance WHERE tenant_id = $1 AND period_label = $2',
    [tenantId, periodLabel]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToRecord(row);
}

/** Lightweight meta-only for close progress (no entries). */
export async function getUnadjustedMeta(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<{ source: PeriodTrialBalanceSource; at?: string; by?: string; connectionId?: string } | null> {
  const r = await pool.query<{
    source: string;
    uploaded_at: string | null;
    uploaded_by: string | null;
    synced_at: string | null;
    synced_by: string | null;
    connection_id: string | null;
  }>(
    'SELECT source, uploaded_at, uploaded_by, synced_at, synced_by, connection_id FROM period_trial_balance WHERE tenant_id = $1 AND period_label = $2',
    [tenantId, periodLabel]
  );
  const row = r.rows[0];
  if (!row) return null;
  const source = row.source as PeriodTrialBalanceSource;
  const at =
    source === 'uploaded' || source === 'gl_derived'
      ? row.uploaded_at
      : row.synced_at;
  const by =
    source === 'uploaded' || source === 'gl_derived'
      ? row.uploaded_by
      : row.synced_by;
  return {
    source,
    at: at ?? undefined,
    by: by ?? undefined,
    connectionId: row.connection_id ?? undefined,
  };
}

/** List period labels that have unadjusted TB for a tenant (for close overview). */
export async function listPeriodLabelsForTenant(
  pool: Pool,
  tenantId: string
): Promise<string[]> {
  const r = await pool.query<{ period_label: string }>(
    'SELECT DISTINCT period_label FROM period_trial_balance WHERE tenant_id = $1 ORDER BY period_label',
    [tenantId]
  );
  return r.rows.map((row) => row.period_label);
}
