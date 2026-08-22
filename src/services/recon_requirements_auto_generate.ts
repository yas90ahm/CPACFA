/**
 * Auto-generate reconciliation requirements from COA (Step 5).
 * Creates default requirements for balance sheet accounts above materiality.
 * Helper for controller review; not gospel — controller adjusts as needed.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import * as coaRepo from '../db/repositories/coa_repository.js';
import * as reqRepo from '../db/repositories/recon_requirements_repository.js';
import type { ReconRequirement } from '../types/period_reconciliation.js';
import { from } from '../utils/decimal.js';

const BALANCE_SHEET_TYPES = ['Asset', 'Liability', 'Equity'] as const;

function isBalanceSheet(accountType: string): boolean {
  return BALANCE_SHEET_TYPES.includes(accountType as (typeof BALANCE_SHEET_TYPES)[number]);
}

function inferExpectedSource(
  accountType: string,
  accountName: string,
  accountCode: string
): 'bank_statement' | 'subledger' | 'aging_report' | 'amortization_schedule' | 'loan_statement' | 'physical_count' | 'rollforward' | 'schedule' | 'other' {
  const name = (accountName ?? '').toLowerCase();
  const code = (accountCode ?? '').toLowerCase();
  const combined = `${name} ${code}`;

  if (
    combined.includes('cash') ||
    combined.includes('bank') ||
    combined.includes('checking') ||
    combined.includes('savings')
  ) {
    return 'bank_statement';
  }
  if (
    combined.includes('receivable') ||
    combined.includes('ar ') ||
    combined.includes('ar,')
  ) {
    return 'subledger';
  }
  if (
    combined.includes('payable') ||
    combined.includes('ap ') ||
    combined.includes('ap,')
  ) {
    return 'subledger';
  }
  if (
    combined.includes('inventory') ||
    combined.includes('stock')
  ) {
    return 'physical_count';
  }
  if (
    combined.includes('prepaid') ||
    combined.includes('amort') ||
    combined.includes('deferred')
  ) {
    return 'amortization_schedule';
  }
  if (
    combined.includes('fixed asset') ||
    combined.includes('ppe') ||
    combined.includes('equipment') ||
    combined.includes('depreciation')
  ) {
    return 'subledger';
  }
  if (
    combined.includes('loan') ||
    combined.includes('debt') ||
    combined.includes('mortgage') ||
    combined.includes('note payable')
  ) {
    return 'loan_statement';
  }
  if (accountType === 'Equity' || combined.includes('equity') || combined.includes('retained')) {
    return 'rollforward';
  }
  return 'schedule';
}

function inferTolerance(
  accountType: string,
  accountName: string,
  accountCode: string,
  materialityThreshold: number | string
): number {
  const name = (accountName ?? '').toLowerCase();
  const code = (accountCode ?? '').toLowerCase();
  const combined = `${name} ${code}`;

  if (
    combined.includes('cash') ||
    combined.includes('bank') ||
    combined.includes('checking') ||
    combined.includes('savings')
  ) {
    return 0;
  }
  if (
    combined.includes('receivable') ||
    combined.includes('payable') ||
    combined.includes('ar ') ||
    combined.includes('ap ')
  ) {
    const tolerance = from(materialityThreshold).times('0.01');
    if (!tolerance.isFinite() || tolerance.isNegative()) throw new Error('Invalid reconciliation materiality');
    return (tolerance.greaterThan(500) ? from(500) : tolerance).toDecimalPlaces(2).toNumber();
  }
  if (
    combined.includes('inventory') ||
    combined.includes('stock')
  ) {
    const tolerance = from(materialityThreshold).times('0.02');
    if (!tolerance.isFinite() || tolerance.isNegative()) throw new Error('Invalid reconciliation materiality');
    return (tolerance.greaterThan(1000) ? from(1000) : tolerance).toDecimalPlaces(2).toNumber();
  }
  if (
    combined.includes('fixed asset') ||
    combined.includes('ppe') ||
    combined.includes('loan') ||
    combined.includes('debt')
  ) {
    return 0;
  }
  const tolerance = from(materialityThreshold).times('0.01');
  if (!tolerance.isFinite() || tolerance.isNegative()) throw new Error('Invalid reconciliation materiality');
  return tolerance.toDecimalPlaces(2).toNumber();
}

/**
 * Auto-generate reconciliation requirements from the entity's COA.
 * Creates default requirements for all balance sheet accounts.
 * materialityThreshold: used for default tolerances; accounts above threshold get created.
 */
export async function autoGenerateReconRequirements(
  pool: Pool,
  tenantId: string,
  entityId: string,
  materialityThreshold: number | string
): Promise<ReconRequirement[]> {
  const accounts = await coaRepo.getAccountsByTenant(pool, tenantId);
  const balanceSheet = accounts.filter((a) => isBalanceSheet(a.account_type));

  const existing = await reqRepo.listRequirements(pool, tenantId, entityId);
  const existingCodes = new Set(existing.map((r) => r.accountCode));
  const created: ReconRequirement[] = [];

  for (const acc of balanceSheet) {
    if (existingCodes.has(acc.account_code)) continue;

    const expectedSource = inferExpectedSource(
      acc.account_type,
      acc.account_name,
      acc.account_code
    );
    const toleranceAmount = inferTolerance(
      acc.account_type,
      acc.account_name,
      acc.account_code,
      materialityThreshold
    );

    const id = randomUUID();
    const req = await reqRepo.insertRequirement(pool, id, {
      tenantId,
      entityId,
      accountCode: acc.account_code,
      accountName: acc.account_name,
      isRequired: true,
      toleranceAmount,
      toleranceType: 'absolute',
      tolerancePercentage: null,
      expectedSource,
      requiresReviewerApproval: false,
    });
    created.push(req);
    existingCodes.add(acc.account_code);
  }

  return created;
}
