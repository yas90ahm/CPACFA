/**
 * Chart of Accounts repository — tenant-level COA CRUD.
 * COA is stored at tenant level; GL entries reference via account_code.
 */

import type { Pool } from 'pg';
import type { CoaAccount, CoaUploadRow } from '../../types/coa.js';

const VALID_ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;

interface CoaRow {
  id: string;
  tenant_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  account_subtype: string | null;
  parent_account_code: string | null;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

function rowToAccount(row: CoaRow): CoaAccount {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    account_code: row.account_code,
    account_name: row.account_name,
    account_type: row.account_type as CoaAccount['account_type'],
    account_subtype: row.account_subtype ?? undefined,
    parent_account_code: row.parent_account_code ?? undefined,
    is_active: row.is_active,
    effective_from: row.effective_from,
    effective_to: row.effective_to ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by ?? undefined,
  };
}

function validateAccountType(t: string): t is (typeof VALID_ACCOUNT_TYPES)[number] {
  return VALID_ACCOUNT_TYPES.includes(t as (typeof VALID_ACCOUNT_TYPES)[number]);
}

/**
 * Bulk upsert accounts. Inserts new accounts; updates existing by (tenant_id, account_code).
 */
export async function upsertAccounts(
  pool: Pool,
  tenantId: string,
  accounts: CoaUploadRow[],
  options?: { createdBy?: string }
): Promise<CoaAccount[]> {
  if (accounts.length === 0) return [];

  const now = new Date().toISOString();
  const createdBy = options?.createdBy ?? null;

  for (const acc of accounts) {
    const accountType = String(acc.account_type ?? '').trim();
    if (!validateAccountType(accountType)) {
      throw new Error(
        `Invalid account_type "${acc.account_type}". Must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`
      );
    }
  }

  const results: CoaAccount[] = [];

  for (const acc of accounts) {
    const accountCode = String(acc.account_code ?? '').trim();
    const accountName = String(acc.account_name ?? '').trim();
    const accountType = String(acc.account_type ?? '').trim() as (typeof VALID_ACCOUNT_TYPES)[number];
    const accountSubtype = acc.account_subtype != null ? String(acc.account_subtype).trim() || null : null;
    const parentAccountCode = acc.parent_account_code != null ? String(acc.parent_account_code).trim() || null : null;

    if (!accountCode || !accountName) {
      throw new Error('account_code and account_name are required');
    }

    await pool.query(
      `INSERT INTO core.tenant_chart_of_accounts (
        tenant_id, account_code, account_name, account_type,
        account_subtype, parent_account_code, is_active, effective_from,
        created_at, updated_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, true, CURRENT_DATE, $7, $7, $8)
      ON CONFLICT (tenant_id, account_code)
      DO UPDATE SET
        account_name = EXCLUDED.account_name,
        account_type = EXCLUDED.account_type,
        account_subtype = EXCLUDED.account_subtype,
        parent_account_code = EXCLUDED.parent_account_code,
        updated_at = EXCLUDED.updated_at`,
      [tenantId, accountCode, accountName, accountType, accountSubtype, parentAccountCode, now, createdBy]
    );

    const r = await pool.query<CoaRow>(
      `SELECT id, tenant_id, account_code, account_name, account_type, account_subtype,
              parent_account_code, is_active, effective_from::text, effective_to::text,
              created_at, updated_at, created_by
       FROM core.tenant_chart_of_accounts
       WHERE tenant_id = $1 AND account_code = $2`,
      [tenantId, accountCode]
    );
    if (r.rows[0]) results.push(rowToAccount(r.rows[0]));
  }

  return results;
}

/**
 * Get all active accounts for tenant.
 */
export async function getAccountsByTenant(pool: Pool, tenantId: string): Promise<CoaAccount[]> {
  const r = await pool.query<CoaRow>(
    `SELECT id, tenant_id, account_code, account_name, account_type, account_subtype,
            parent_account_code, is_active, effective_from::text, effective_to::text,
            created_at, updated_at, created_by
     FROM core.tenant_chart_of_accounts
     WHERE tenant_id = $1 AND is_active = true
     ORDER BY account_code`,
    [tenantId]
  );
  return r.rows.map(rowToAccount);
}

/**
 * Get specific account by code.
 */
export async function getAccountByCode(
  pool: Pool,
  tenantId: string,
  accountCode: string
): Promise<CoaAccount | null> {
  const r = await pool.query<CoaRow>(
    `SELECT id, tenant_id, account_code, account_name, account_type, account_subtype,
            parent_account_code, is_active, effective_from::text, effective_to::text,
            created_at, updated_at, created_by
     FROM core.tenant_chart_of_accounts
     WHERE tenant_id = $1 AND account_code = $2`,
    [tenantId, accountCode]
  );
  return r.rows[0] ? rowToAccount(r.rows[0]) : null;
}

/**
 * Soft delete: set is_active = false, effective_to = CURRENT_DATE.
 */
export async function deactivateAccount(
  pool: Pool,
  tenantId: string,
  accountCode: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const r = await pool.query(
    `UPDATE core.tenant_chart_of_accounts
     SET is_active = false, effective_to = CURRENT_DATE, updated_at = $1
     WHERE tenant_id = $2 AND account_code = $3`,
    [now, tenantId, accountCode]
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Check if account exists (active or inactive).
 */
export async function validateAccountExists(
  pool: Pool,
  tenantId: string,
  accountCode: string
): Promise<boolean> {
  const r = await pool.query<{ n: number }>(
    `SELECT 1 AS n FROM core.tenant_chart_of_accounts WHERE tenant_id = $1 AND account_code = $2 LIMIT 1`,
    [tenantId, accountCode]
  );
  return r.rows.length > 0;
}
