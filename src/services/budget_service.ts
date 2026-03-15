/**
 * Budget service: CSV parsing, upload, retrieval, and budget-to-actual variance.
 * All money arithmetic uses Decimal.js via src/utils/decimal.ts.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { BudgetEntry, BudgetVarianceItem } from '../types/budget.js';
import * as budgetRepo from '../db/repositories/budget_repository.js';
import { getAdjustedTrialBalance } from './adjusted_trial_balance_service.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import * as dec from '../utils/decimal.js';

interface ParsedBudgetLine {
  accountCode: string;
  accountName?: string;
  budgetAmount: number;
}

/**
 * Parse CSV content with columns: account_code, account_name (optional), budget_amount.
 * First line is treated as header. Returns parsed entries.
 */
export function parseBudgetCsv(csvContent: string): ParsedBudgetLine[] {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));

  const codeIdx = headers.findIndex((h) => h === 'account_code' || h === 'accountcode' || h === 'account code');
  const nameIdx = headers.findIndex((h) => h === 'account_name' || h === 'accountname' || h === 'account name');
  const amountIdx = headers.findIndex((h) => h === 'budget_amount' || h === 'budgetamount' || h === 'budget amount' || h === 'amount' || h === 'budget');

  if (codeIdx < 0) throw new Error('CSV must have an account_code column');
  if (amountIdx < 0) throw new Error('CSV must have a budget_amount column');

  const results: ParsedBudgetLine[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCsvLine(line);
    const accountCode = (cols[codeIdx] ?? '').trim();
    if (!accountCode) continue;

    const rawAmount = (cols[amountIdx] ?? '').trim().replace(/[,$]/g, '');
    const budgetAmount = dec.round2(rawAmount || '0');

    const accountName = nameIdx >= 0 ? (cols[nameIdx] ?? '').trim() || undefined : undefined;

    results.push({ accountCode, accountName, budgetAmount });
  }
  return results;
}

/**
 * Simple CSV line parser that handles quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Upload budget from CSV content. Parses CSV and upserts entries.
 */
export async function uploadBudget(
  pool: Pool,
  tenantId: string,
  entityId: string,
  periodLabel: string,
  csvContent: string,
  uploadedBy?: string
): Promise<BudgetEntry[]> {
  const parsed = parseBudgetCsv(csvContent);
  if (parsed.length === 0) throw new Error('No valid budget entries found in CSV');

  const entries = parsed.map((p) => ({
    id: randomUUID(),
    accountCode: p.accountCode,
    accountName: p.accountName,
    budgetAmount: p.budgetAmount,
  }));

  return budgetRepo.upsertBudgetEntries(pool, tenantId, entityId, periodLabel, entries, uploadedBy);
}

/**
 * Get budget entries for a period.
 */
export async function getBudgetForPeriod(
  pool: Pool,
  tenantId: string,
  entityId: string,
  periodLabel: string
): Promise<BudgetEntry[]> {
  return budgetRepo.getBudgetForPeriod(pool, tenantId, entityId, periodLabel);
}

/**
 * Compute budget-to-actual variance: join budget entries with adjusted trial balance.
 * Variance = actual - budget. Percent = variance / |budget| * 100.
 */
export async function getBudgetVariance(
  pool: Pool,
  tenantId: string,
  entityId: string,
  sessionId: string,
  periodLabel: string
): Promise<BudgetVarianceItem[]> {
  const budgetEntries = await budgetRepo.getBudgetForPeriod(pool, tenantId, entityId, periodLabel);
  if (budgetEntries.length === 0) return [];

  const adjustedTB = await getAdjustedTrialBalance(tenantId, periodLabel, pool, sessionId);

  // Build a map of account_code -> net balance (debit - credit) from adjusted TB
  const actualMap = new Map<string, { net: number; name?: string }>();
  for (const entry of adjustedTB) {
    const code = (entry.accountCode ?? entry.accountName ?? '').trim();
    if (!code) continue;
    const net = dec.minus(entry.debit, entry.credit);
    const existing = actualMap.get(code);
    if (existing) {
      existing.net = dec.plus(existing.net, net);
    } else {
      actualMap.set(code, { net, name: entry.accountName });
    }
  }

  const results: BudgetVarianceItem[] = [];
  for (const budget of budgetEntries) {
    const actual = actualMap.get(budget.accountCode);
    const actualAmount = actual?.net ?? 0;
    const budgetAmount = Number(budget.budgetAmount);
    const varianceAmount = dec.minus(actualAmount, budgetAmount);
    const variancePercent = budgetAmount === 0
      ? null
      : dec.round4(dec.from(varianceAmount).dividedBy(Math.abs(budgetAmount)).times(100).toNumber());

    results.push({
      accountCode: budget.accountCode,
      accountName: budget.accountName ?? actual?.name,
      budgetAmount,
      actualAmount,
      varianceAmount,
      variancePercent,
    });
  }

  return results;
}
