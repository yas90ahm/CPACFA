/**
 * Clearing Account Service — tracks outstanding checks, deposits in transit,
 * and other items that create temporary differences between GL and bank balances.
 *
 * Items age automatically via GENERATED column (days_outstanding).
 * Stale items (>90 days) are flagged for investigation.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';

export type ClearingItemType = 'outstanding_check' | 'deposit_in_transit' | 'pending_transfer' | 'other';
export type ClearingItemStatus = 'outstanding' | 'cleared' | 'voided' | 'stale';

export interface ClearingItem {
  id: string;
  tenantId: string;
  periodId: string;
  reconId: string | null;
  accountCode: string;
  itemType: ClearingItemType;
  description: string;
  amount: string;
  originalDate: string;
  expectedClearingDate: string | null;
  status: ClearingItemStatus;
  clearedDate: string | null;
  clearedBy: string | null;
  daysOutstanding: number | null;
  bankTransactionId: string | null;
  createdAt: string;
  createdBy: string | null;
}

export async function createClearingItem(
  pool: Pool,
  tenantId: string,
  input: {
    periodId: string;
    reconId?: string;
    accountCode: string;
    itemType: ClearingItemType;
    description: string;
    amount: string;
    originalDate: string;
    expectedClearingDate?: string;
    createdBy?: string;
  }
): Promise<ClearingItem> {
  const id = randomUUID();
  const r = await pool.query<Record<string, unknown>>(
    `INSERT INTO tenant_clearing_items (id, tenant_id, period_id, recon_id, account_code,
       item_type, description, amount, original_date, expected_clearing_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $9::date, $10::date, $11)
     RETURNING *`,
    [id, tenantId, input.periodId, input.reconId ?? null, input.accountCode,
     input.itemType, input.description, input.amount, input.originalDate,
     input.expectedClearingDate ?? null, input.createdBy ?? null]
  );
  return mapRow(r.rows[0]);
}

export async function listClearingItems(
  pool: Pool,
  tenantId: string,
  periodId: string,
  opts?: { accountCode?: string; status?: ClearingItemStatus }
): Promise<ClearingItem[]> {
  let sql = 'SELECT * FROM tenant_clearing_items WHERE tenant_id = $1 AND period_id = $2';
  const params: unknown[] = [tenantId, periodId];
  if (opts?.accountCode) { params.push(opts.accountCode); sql += ` AND account_code = $${params.length}`; }
  if (opts?.status) { params.push(opts.status); sql += ` AND status = $${params.length}`; }
  sql += ' ORDER BY original_date';
  const r = await pool.query<Record<string, unknown>>(sql, params);
  return r.rows.map(mapRow);
}

export async function clearItem(
  pool: Pool,
  tenantId: string,
  itemId: string,
  clearedBy: string,
  clearedDate?: string,
  bankTransactionId?: string
): Promise<ClearingItem | null> {
  const r = await pool.query<Record<string, unknown>>(
    `UPDATE tenant_clearing_items SET status = 'cleared', cleared_date = $3::date,
       cleared_by = $4, bank_transaction_id = $5
     WHERE id = $2 AND tenant_id = $1 AND status = 'outstanding'
     RETURNING *`,
    [tenantId, itemId, clearedDate ?? new Date().toISOString().slice(0, 10), clearedBy, bankTransactionId ?? null]
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function voidItem(pool: Pool, tenantId: string, itemId: string): Promise<ClearingItem | null> {
  const r = await pool.query<Record<string, unknown>>(
    `UPDATE tenant_clearing_items SET status = 'voided' WHERE id = $2 AND tenant_id = $1 RETURNING *`,
    [tenantId, itemId]
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

/** Flag stale outstanding items (>90 days) */
export async function flagStaleItems(pool: Pool, tenantId: string, staleDays: number = 90): Promise<number> {
  const r = await pool.query(
    `UPDATE tenant_clearing_items SET status = 'stale'
     WHERE tenant_id = $1 AND status = 'outstanding'
       AND original_date < CURRENT_DATE - $2::int
     RETURNING id`,
    [tenantId, staleDays]
  );
  return r.rowCount ?? 0;
}

/** Get aging summary for outstanding clearing items */
export async function getAgingSummary(
  pool: Pool,
  tenantId: string,
  periodId: string,
  accountCode?: string
): Promise<{ bucket: string; count: number; totalAmount: number }[]> {
  let filter = '';
  const params: unknown[] = [tenantId, periodId];
  if (accountCode) { params.push(accountCode); filter = ` AND account_code = $${params.length}`; }

  const r = await pool.query<{ bucket: string; count: number; total_amount: string }>(
    `SELECT
       CASE
         WHEN CURRENT_DATE - original_date <= 30 THEN '0-30 days'
         WHEN CURRENT_DATE - original_date <= 60 THEN '31-60 days'
         WHEN CURRENT_DATE - original_date <= 90 THEN '61-90 days'
         ELSE '90+ days'
       END AS bucket,
       COUNT(*)::int AS count,
       SUM(ABS(amount))::text AS total_amount
     FROM tenant_clearing_items
     WHERE tenant_id = $1 AND period_id = $2 AND status = 'outstanding'${filter}
     GROUP BY bucket ORDER BY bucket`,
    params
  );

  return r.rows.map((row) => ({
    bucket: row.bucket,
    count: row.count,
    totalAmount: Number(row.total_amount) || 0,
  }));
}

function mapRow(row: Record<string, unknown>): ClearingItem {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    periodId: String(row.period_id),
    reconId: row.recon_id != null ? String(row.recon_id) : null,
    accountCode: String(row.account_code),
    itemType: String(row.item_type) as ClearingItemType,
    description: String(row.description),
    amount: String(row.amount),
    originalDate: String(row.original_date).slice(0, 10),
    expectedClearingDate: row.expected_clearing_date ? String(row.expected_clearing_date).slice(0, 10) : null,
    status: String(row.status) as ClearingItemStatus,
    clearedDate: row.cleared_date ? String(row.cleared_date).slice(0, 10) : null,
    clearedBy: row.cleared_by != null ? String(row.cleared_by) : null,
    daysOutstanding: row.days_outstanding != null ? Number(row.days_outstanding) : null,
    bankTransactionId: row.bank_transaction_id != null ? String(row.bank_transaction_id) : null,
    createdAt: String(row.created_at),
    createdBy: row.created_by != null ? String(row.created_by) : null,
  };
}
