/**
 * Bank transaction repository — CRUD for tenant_bank_transactions.
 * Used by the transaction matching engine and bank statement upload flow.
 */

import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

export interface BankTransaction {
  id: string;
  tenantId: string;
  periodId: string;
  accountCode: string;
  transactionDate: string;
  postDate: string | null;
  description: string;
  reference: string | null;
  checkNumber: string | null;
  amount: string;
  runningBalance: string | null;
  transactionType: string;
  counterparty: string | null;
  source: string;
  sourceFileName: string | null;
  externalId: string | null;
  matchStatus: 'unmatched' | 'matched' | 'excluded';
  matchedGlEntryId: string | null;
  matchGroupId: string | null;
  matchConfidence: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface InsertBankTransactionInput {
  tenantId: string;
  periodId: string;
  accountCode: string;
  transactionDate: string;
  postDate?: string | null;
  description: string;
  reference?: string | null;
  checkNumber?: string | null;
  amount: string;
  runningBalance?: string | null;
  transactionType: string;
  counterparty?: string | null;
  source: string;
  sourceFileName?: string | null;
  externalId?: string | null;
  createdBy?: string | null;
}

interface Row {
  id: string;
  tenant_id: string;
  period_id: string;
  account_code: string;
  transaction_date: string | Date;
  post_date: string | Date | null;
  description: string;
  reference: string | null;
  check_number: string | null;
  amount: string;
  running_balance: string | null;
  transaction_type: string;
  counterparty: string | null;
  source: string;
  source_file_name: string | null;
  external_id: string | null;
  match_status: string;
  matched_gl_entry_id: string | null;
  match_group_id: string | null;
  match_confidence: string | null;
  created_at: string | Date;
  created_by: string | null;
}

function dateToStr(d: string | Date | null): string | null {
  if (d == null) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function rowToTxn(r: Row): BankTransaction {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    periodId: r.period_id,
    accountCode: r.account_code,
    transactionDate: dateToStr(r.transaction_date) ?? '',
    postDate: dateToStr(r.post_date),
    description: r.description,
    reference: r.reference,
    checkNumber: r.check_number,
    amount: String(r.amount),
    runningBalance: r.running_balance != null ? String(r.running_balance) : null,
    transactionType: r.transaction_type,
    counterparty: r.counterparty,
    source: r.source,
    sourceFileName: r.source_file_name,
    externalId: r.external_id,
    matchStatus: r.match_status as BankTransaction['matchStatus'],
    matchedGlEntryId: r.matched_gl_entry_id,
    matchGroupId: r.match_group_id,
    matchConfidence: r.match_confidence != null ? String(r.match_confidence) : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : (r.created_at as Date).toISOString(),
    createdBy: r.created_by,
  };
}

export async function insertBankTransaction(
  pool: Queryable,
  input: InsertBankTransactionInput
): Promise<BankTransaction> {
  const id = randomUUID();
  const r = await pool.query<Row>(
    `INSERT INTO tenant_bank_transactions (
       id, tenant_id, period_id, account_code, transaction_date, post_date,
       description, reference, check_number, amount, running_balance,
       transaction_type, counterparty, source, source_file_name, external_id, created_by
     ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10::numeric, $11::numeric, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (tenant_id, external_id) DO NOTHING
     RETURNING *`,
    [
      id, input.tenantId, input.periodId, input.accountCode,
      input.transactionDate, input.postDate ?? null,
      input.description, input.reference ?? null, input.checkNumber ?? null,
      input.amount, input.runningBalance ?? null,
      input.transactionType, input.counterparty ?? null,
      input.source, input.sourceFileName ?? null, input.externalId ?? null,
      input.createdBy ?? null,
    ]
  );
  if (r.rows.length === 0) {
    // Duplicate — return existing
    const existing = await pool.query<Row>(
      `SELECT * FROM tenant_bank_transactions WHERE tenant_id = $1 AND external_id = $2`,
      [input.tenantId, input.externalId]
    );
    if (existing.rows[0]) return rowToTxn(existing.rows[0]);
    throw new Error('Insert returned no rows and no duplicate found');
  }
  return rowToTxn(r.rows[0]);
}

export async function insertBankTransactionsBatch(
  pool: Queryable,
  inputs: InsertBankTransactionInput[]
): Promise<{ inserted: number; duplicates: number }> {
  let inserted = 0;
  let duplicates = 0;
  for (const input of inputs) {
    const id = randomUUID();
    const r = await pool.query(
      `INSERT INTO tenant_bank_transactions (
         id, tenant_id, period_id, account_code, transaction_date, post_date,
         description, reference, check_number, amount, running_balance,
         transaction_type, counterparty, source, source_file_name, external_id, created_by
       ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10::numeric, $11::numeric, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (tenant_id, external_id) DO NOTHING`,
      [
        id, input.tenantId, input.periodId, input.accountCode,
        input.transactionDate, input.postDate ?? null,
        input.description, input.reference ?? null, input.checkNumber ?? null,
        input.amount, input.runningBalance ?? null,
        input.transactionType, input.counterparty ?? null,
        input.source, input.sourceFileName ?? null, input.externalId ?? null,
        input.createdBy ?? null,
      ]
    );
    if ((r as { rowCount?: number }).rowCount === 1) inserted++;
    else duplicates++;
  }
  return { inserted, duplicates };
}

export async function listBankTransactions(
  pool: Queryable,
  tenantId: string,
  periodId: string,
  accountCode?: string,
  matchStatus?: BankTransaction['matchStatus']
): Promise<BankTransaction[]> {
  let sql = 'SELECT * FROM tenant_bank_transactions WHERE tenant_id = $1 AND period_id = $2';
  const params: unknown[] = [tenantId, periodId];
  if (accountCode) {
    params.push(accountCode);
    sql += ` AND account_code = $${params.length}`;
  }
  if (matchStatus) {
    params.push(matchStatus);
    sql += ` AND match_status = $${params.length}`;
  }
  sql += ' ORDER BY transaction_date, created_at';
  const r = await pool.query<Row>(sql, params);
  return r.rows.map(rowToTxn);
}

export async function updateMatchStatus(
  pool: Queryable,
  tenantId: string,
  transactionId: string,
  matchStatus: BankTransaction['matchStatus'],
  matchGroupId?: string | null
): Promise<BankTransaction | null> {
  const r = await pool.query<Row>(
    `UPDATE tenant_bank_transactions
     SET match_status = $3, match_group_id = $4
     WHERE id = $2 AND tenant_id = $1
     RETURNING *`,
    [tenantId, transactionId, matchStatus, matchGroupId ?? null]
  );
  return r.rows[0] ? rowToTxn(r.rows[0]) : null;
}

export async function countByMatchStatus(
  pool: Queryable,
  tenantId: string,
  periodId: string,
  accountCode?: string
): Promise<{ unmatched: number; matched: number; excluded: number; total: number }> {
  let sql = `SELECT match_status, COUNT(*)::int as cnt
             FROM tenant_bank_transactions WHERE tenant_id = $1 AND period_id = $2`;
  const params: unknown[] = [tenantId, periodId];
  if (accountCode) {
    params.push(accountCode);
    sql += ` AND account_code = $${params.length}`;
  }
  sql += ' GROUP BY match_status';
  const r = await pool.query<{ match_status: string; cnt: number }>(sql, params);
  const counts = { unmatched: 0, matched: 0, excluded: 0, total: 0 };
  for (const row of r.rows) {
    (counts as Record<string, number>)[row.match_status] = row.cnt;
    counts.total += row.cnt;
  }
  return counts;
}
