/**
 * Budget repository — DB operations for tenant_period_budgets (tenant-scoped).
 */

import type { Pool } from 'pg';
import type { BudgetEntry } from '../../types/budget.js';

interface BudgetRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  period_label: string;
  account_code: string;
  account_name: string | null;
  budget_amount: string;
  created_at: string;
  updated_at: string;
  uploaded_by: string | null;
}

function rowToEntry(row: BudgetRow): BudgetEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    periodLabel: row.period_label,
    accountCode: row.account_code,
    accountName: row.account_name ?? undefined,
    budgetAmount: row.budget_amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    uploadedBy: row.uploaded_by ?? undefined,
  };
}

/**
 * Upsert budget entries for a period. Uses ON CONFLICT to update existing rows.
 */
export async function upsertBudgetEntries(
  pool: Pool,
  tenantId: string,
  entityId: string,
  periodLabel: string,
  entries: Array<{ id: string; accountCode: string; accountName?: string; budgetAmount: number }>,
  uploadedBy?: string
): Promise<BudgetEntry[]> {
  if (entries.length === 0) return [];

  const results: BudgetEntry[] = [];
  for (const entry of entries) {
    const r = await pool.query<BudgetRow>(
      `INSERT INTO tenant_period_budgets (id, tenant_id, entity_id, period_label, account_code, account_name, budget_amount, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, entity_id, period_label, account_code)
       DO UPDATE SET account_name = COALESCE(EXCLUDED.account_name, tenant_period_budgets.account_name),
         budget_amount = EXCLUDED.budget_amount,
         uploaded_by = EXCLUDED.uploaded_by,
         updated_at = NOW()
       RETURNING *`,
      [entry.id, tenantId, entityId, periodLabel, entry.accountCode, entry.accountName ?? null, entry.budgetAmount, uploadedBy ?? null]
    );
    if (r.rows[0]) results.push(rowToEntry(r.rows[0]));
  }
  return results;
}

/**
 * Get all budget entries for a specific period.
 */
export async function getBudgetForPeriod(
  pool: Pool,
  tenantId: string,
  entityId: string,
  periodLabel: string
): Promise<BudgetEntry[]> {
  const r = await pool.query<BudgetRow>(
    `SELECT * FROM tenant_period_budgets
     WHERE tenant_id = $1 AND entity_id = $2 AND period_label = $3
     ORDER BY account_code`,
    [tenantId, entityId, periodLabel]
  );
  return r.rows.map(rowToEntry);
}

/**
 * Delete all budget entries for a specific period.
 */
export async function deleteBudgetForPeriod(
  pool: Pool,
  tenantId: string,
  entityId: string,
  periodLabel: string
): Promise<number> {
  const r = await pool.query(
    `DELETE FROM tenant_period_budgets
     WHERE tenant_id = $1 AND entity_id = $2 AND period_label = $3`,
    [tenantId, entityId, periodLabel]
  );
  return r.rowCount ?? 0;
}
