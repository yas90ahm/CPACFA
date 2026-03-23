/**
 * Payroll Accrual service.
 * Computes periodic payroll accruals based on average daily rates.
 * All monetary arithmetic via Decimal.js — no native JS arithmetic on money.
 */

import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import type { Pool } from 'pg';
import { createDraftJE } from './journal_entry_service.js';
import { assertNoAiMutationContext } from '../lib/ai_boundary.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PayrollConfig {
  id: string;
  tenantId: string;
  entityId: string;
  averageDailyPayroll: string;
  lastPayrollDate: string | null;
  wagesExpenseAccount: string;
  accruedWagesAccount: string;
  payrollTaxExpenseAccount: string | null;
  accruedPayrollTaxAccount: string | null;
  benefitsExpenseAccount: string | null;
  accruedBenefitsAccount: string | null;
  averageDailyTax: string;
  averageDailyBenefits: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollAccrualEntry {
  id: string;
  entityId: string;
  closeSessionId: string;
  periodEnd: string;
  daysAccrued: number;
  wagesAmount: string;
  taxAmount: string;
  benefitsAmount: string;
  totalAmount: string;
  jeId: string | null;
  source: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function rowToConfig(r: Record<string, unknown>): PayrollConfig {
  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    entityId: r.entity_id as string,
    averageDailyPayroll: String(r.average_daily_payroll),
    lastPayrollDate: r.last_payroll_date ? String(r.last_payroll_date) : null,
    wagesExpenseAccount: r.wages_expense_account as string,
    accruedWagesAccount: r.accrued_wages_account as string,
    payrollTaxExpenseAccount: r.payroll_tax_expense_account ? String(r.payroll_tax_expense_account) : null,
    accruedPayrollTaxAccount: r.accrued_payroll_tax_account ? String(r.accrued_payroll_tax_account) : null,
    benefitsExpenseAccount: r.benefits_expense_account ? String(r.benefits_expense_account) : null,
    accruedBenefitsAccount: r.accrued_benefits_account ? String(r.accrued_benefits_account) : null,
    averageDailyTax: String(r.average_daily_tax),
    averageDailyBenefits: String(r.average_daily_benefits),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowToEntry(r: Record<string, unknown>): PayrollAccrualEntry {
  return {
    id: r.id as string,
    entityId: r.entity_id as string,
    closeSessionId: r.close_session_id as string,
    periodEnd: String(r.period_end),
    daysAccrued: Number(r.days_accrued),
    wagesAmount: String(r.wages_amount),
    taxAmount: String(r.tax_amount),
    benefitsAmount: String(r.benefits_amount),
    totalAmount: String(r.total_amount),
    jeId: r.je_id ? String(r.je_id) : null,
    source: r.source as string,
    createdAt: String(r.created_at),
  };
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

/* ------------------------------------------------------------------ */
/*  Config CRUD                                                        */
/* ------------------------------------------------------------------ */

export async function getPayrollConfig(pool: Pool, tenantId: string, entityId: string): Promise<PayrollConfig | null> {
  const { rows } = await pool.query(
    'SELECT * FROM tenant_payroll_config WHERE tenant_id = $1 AND entity_id = $2',
    [tenantId, entityId]
  );
  return rows.length > 0 ? rowToConfig(rows[0]) : null;
}

export async function updatePayrollConfig(
  pool: Pool, tenantId: string, entityId: string,
  input: Partial<{ averageDailyPayroll: string; lastPayrollDate: string; wagesExpenseAccount: string; accruedWagesAccount: string; payrollTaxExpenseAccount: string; accruedPayrollTaxAccount: string; benefitsExpenseAccount: string; accruedBenefitsAccount: string; averageDailyTax: string; averageDailyBenefits: string }>
): Promise<PayrollConfig> {
  assertNoAiMutationContext();
  const { rows: existing } = await pool.query(
    'SELECT id FROM tenant_payroll_config WHERE tenant_id = $1 AND entity_id = $2', [tenantId, entityId]
  );
  if (existing.length === 0) {
    const id = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO tenant_payroll_config (id, tenant_id, entity_id, average_daily_payroll, last_payroll_date, wages_expense_account, accrued_wages_account, payroll_tax_expense_account, accrued_payroll_tax_account, benefits_expense_account, accrued_benefits_account, average_daily_tax, average_daily_benefits)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [id, tenantId, entityId, input.averageDailyPayroll ?? '0', input.lastPayrollDate ?? null,
       input.wagesExpenseAccount ?? '', input.accruedWagesAccount ?? '',
       input.payrollTaxExpenseAccount ?? null, input.accruedPayrollTaxAccount ?? null,
       input.benefitsExpenseAccount ?? null, input.accruedBenefitsAccount ?? null,
       input.averageDailyTax ?? '0', input.averageDailyBenefits ?? '0']
    );
    return rowToConfig(rows[0]);
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  const map: Record<string, string> = {
    averageDailyPayroll: 'average_daily_payroll', lastPayrollDate: 'last_payroll_date',
    wagesExpenseAccount: 'wages_expense_account', accruedWagesAccount: 'accrued_wages_account',
    payrollTaxExpenseAccount: 'payroll_tax_expense_account', accruedPayrollTaxAccount: 'accrued_payroll_tax_account',
    benefitsExpenseAccount: 'benefits_expense_account', accruedBenefitsAccount: 'accrued_benefits_account',
    averageDailyTax: 'average_daily_tax', averageDailyBenefits: 'average_daily_benefits',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((input as Record<string, unknown>)[k] !== undefined) {
      sets.push(`${col} = $${idx++}`);
      vals.push((input as Record<string, unknown>)[k]);
    }
  }
  if (sets.length === 0) return rowToConfig(existing[0]);
  sets.push('updated_at = now()');
  vals.push(tenantId, entityId);
  const { rows } = await pool.query(
    `UPDATE tenant_payroll_config SET ${sets.join(', ')} WHERE tenant_id = $${idx++} AND entity_id = $${idx} RETURNING *`,
    vals
  );
  return rowToConfig(rows[0]);
}

/* ------------------------------------------------------------------ */
/*  Core computation                                                   */
/* ------------------------------------------------------------------ */

export function computePayrollAccrual(
  config: { averageDailyPayroll: string; averageDailyTax: string; averageDailyBenefits: string; lastPayrollDate: string | null },
  periodEnd: string
): { daysAccrued: number; wagesAmount: string; taxAmount: string; benefitsAmount: string; totalAmount: string } {
  if (!config.lastPayrollDate) return { daysAccrued: 0, wagesAmount: '0.00', taxAmount: '0.00', benefitsAmount: '0.00', totalAmount: '0.00' };
  const days = daysBetween(config.lastPayrollDate, periodEnd);
  if (days <= 0) return { daysAccrued: 0, wagesAmount: '0.00', taxAmount: '0.00', benefitsAmount: '0.00', totalAmount: '0.00' };

  const wages = new Decimal(days).mul(new Decimal(config.averageDailyPayroll)).toDecimalPlaces(2);
  const tax = new Decimal(days).mul(new Decimal(config.averageDailyTax)).toDecimalPlaces(2);
  const benefits = new Decimal(days).mul(new Decimal(config.averageDailyBenefits)).toDecimalPlaces(2);
  const total = wages.plus(tax).plus(benefits).toDecimalPlaces(2);

  return { daysAccrued: days, wagesAmount: wages.toFixed(2), taxAmount: tax.toFixed(2), benefitsAmount: benefits.toFixed(2), totalAmount: total.toFixed(2) };
}

/* ------------------------------------------------------------------ */
/*  Propose payroll accrual AJE                                        */
/* ------------------------------------------------------------------ */

export async function proposePayrollAccrualAJE(
  pool: Pool, tenantId: string, entityId: string, closeSessionId: string, periodEnd: string
): Promise<PayrollAccrualEntry | null> {
  assertNoAiMutationContext();
  const config = await getPayrollConfig(pool, tenantId, entityId);
  if (!config) throw new Error('Payroll config not found for entity');

  const result = computePayrollAccrual(config, periodEnd);
  if (result.daysAccrued <= 0 || new Decimal(result.totalAmount).lte(0)) return null;

  const lines: { accountRef: string; debit: number; credit: number; description: string; amountProvenance: { kind: 'engine_calculation'; ruleId: string; ruleVersion: string; inputs: Record<string, unknown> } }[] = [
    { accountRef: config.wagesExpenseAccount, debit: Number(result.wagesAmount), credit: 0, description: 'Wages expense accrual',
      amountProvenance: { kind: 'engine_calculation', ruleId: config.id, ruleVersion: '1', inputs: { days: result.daysAccrued, dailyRate: config.averageDailyPayroll } } },
    { accountRef: config.accruedWagesAccount, debit: 0, credit: Number(result.wagesAmount), description: 'Accrued wages',
      amountProvenance: { kind: 'engine_calculation', ruleId: config.id, ruleVersion: '1', inputs: { days: result.daysAccrued, dailyRate: config.averageDailyPayroll } } },
  ];

  if (config.payrollTaxExpenseAccount && config.accruedPayrollTaxAccount && new Decimal(result.taxAmount).gt(0)) {
    lines.push(
      { accountRef: config.payrollTaxExpenseAccount, debit: Number(result.taxAmount), credit: 0, description: 'Payroll tax expense accrual',
        amountProvenance: { kind: 'engine_calculation', ruleId: config.id, ruleVersion: '1', inputs: { days: result.daysAccrued, dailyRate: config.averageDailyTax } } },
      { accountRef: config.accruedPayrollTaxAccount, debit: 0, credit: Number(result.taxAmount), description: 'Accrued payroll taxes',
        amountProvenance: { kind: 'engine_calculation', ruleId: config.id, ruleVersion: '1', inputs: { days: result.daysAccrued, dailyRate: config.averageDailyTax } } },
    );
  }

  if (config.benefitsExpenseAccount && config.accruedBenefitsAccount && new Decimal(result.benefitsAmount).gt(0)) {
    lines.push(
      { accountRef: config.benefitsExpenseAccount, debit: Number(result.benefitsAmount), credit: 0, description: 'Benefits expense accrual',
        amountProvenance: { kind: 'engine_calculation', ruleId: config.id, ruleVersion: '1', inputs: { days: result.daysAccrued, dailyRate: config.averageDailyBenefits } } },
      { accountRef: config.accruedBenefitsAccount, debit: 0, credit: Number(result.benefitsAmount), description: 'Accrued benefits',
        amountProvenance: { kind: 'engine_calculation', ruleId: config.id, ruleVersion: '1', inputs: { days: result.daysAccrued, dailyRate: config.averageDailyBenefits } } },
    );
  }

  const memo = `Payroll accrual ${periodEnd} — ${result.daysAccrued} days from ${config.lastPayrollDate}`;
  const je = await createDraftJE(pool, { closeSessionId, tenantId, memo, source: 'accrual', createdBy: 'payroll_accrual_engine', lines });

  const entryId = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO tenant_payroll_accrual_entries (id, tenant_id, entity_id, close_session_id, period_end, days_accrued, wages_amount, tax_amount, benefits_amount, total_amount, je_id, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [entryId, tenantId, entityId, closeSessionId, periodEnd, result.daysAccrued, result.wagesAmount, result.taxAmount, result.benefitsAmount, result.totalAmount, je.id, 'computed']
  );
  return rowToEntry(rows[0]);
}

/* ------------------------------------------------------------------ */
/*  Import from payroll register CSV                                   */
/* ------------------------------------------------------------------ */

export async function importFromPayrollRegister(
  pool: Pool, tenantId: string, entityId: string, closeSessionId: string, csvBuffer: Buffer
): Promise<PayrollAccrualEntry> {
  assertNoAiMutationContext();
  const config = await getPayrollConfig(pool, tenantId, entityId);
  if (!config) throw new Error('Payroll config not found for entity');

  const text = csvBuffer.toString('utf-8');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV must have header row and at least one data row');

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const wagesIdx = headers.findIndex((h) => h.includes('gross') || h.includes('wages'));
  const taxIdx = headers.findIndex((h) => h.includes('tax'));
  const benefitsIdx = headers.findIndex((h) => h.includes('benefit'));
  const dateIdx = headers.findIndex((h) => h.includes('date') || h.includes('period'));

  if (wagesIdx < 0) throw new Error('CSV must contain a wages/gross column');

  let totalWages = new Decimal(0);
  let totalTax = new Decimal(0);
  let totalBenefits = new Decimal(0);
  let latestDate = '';

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    totalWages = totalWages.plus(new Decimal(cols[wagesIdx] || '0'));
    if (taxIdx >= 0) totalTax = totalTax.plus(new Decimal(cols[taxIdx] || '0'));
    if (benefitsIdx >= 0) totalBenefits = totalBenefits.plus(new Decimal(cols[benefitsIdx] || '0'));
    if (dateIdx >= 0 && cols[dateIdx] && cols[dateIdx] > latestDate) latestDate = cols[dateIdx];
  }

  totalWages = totalWages.toDecimalPlaces(2);
  totalTax = totalTax.toDecimalPlaces(2);
  totalBenefits = totalBenefits.toDecimalPlaces(2);
  const total = totalWages.plus(totalTax).plus(totalBenefits).toDecimalPlaces(2);
  const periodEnd = latestDate || new Date().toISOString().slice(0, 10);

  const jeLines: { accountRef: string; debit: number; credit: number; description: string }[] = [
    { accountRef: config.wagesExpenseAccount, debit: totalWages.toNumber(), credit: 0, description: 'Wages from payroll register' },
    { accountRef: config.accruedWagesAccount, debit: 0, credit: totalWages.toNumber(), description: 'Accrued wages from register' },
  ];
  if (config.payrollTaxExpenseAccount && config.accruedPayrollTaxAccount && totalTax.gt(0)) {
    jeLines.push(
      { accountRef: config.payrollTaxExpenseAccount, debit: totalTax.toNumber(), credit: 0, description: 'Payroll taxes from register' },
      { accountRef: config.accruedPayrollTaxAccount, debit: 0, credit: totalTax.toNumber(), description: 'Accrued payroll taxes from register' },
    );
  }
  if (config.benefitsExpenseAccount && config.accruedBenefitsAccount && totalBenefits.gt(0)) {
    jeLines.push(
      { accountRef: config.benefitsExpenseAccount, debit: totalBenefits.toNumber(), credit: 0, description: 'Benefits from register' },
      { accountRef: config.accruedBenefitsAccount, debit: 0, credit: totalBenefits.toNumber(), description: 'Accrued benefits from register' },
    );
  }

  const memo = `Payroll register import ${periodEnd} — wages ${totalWages.toFixed(2)}, tax ${totalTax.toFixed(2)}, benefits ${totalBenefits.toFixed(2)}`;
  const je = await createDraftJE(pool, { closeSessionId, tenantId, memo, source: 'accrual', createdBy: 'payroll_register_import', lines: jeLines });

  const entryId = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO tenant_payroll_accrual_entries (id, tenant_id, entity_id, close_session_id, period_end, days_accrued, wages_amount, tax_amount, benefits_amount, total_amount, je_id, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [entryId, tenantId, entityId, closeSessionId, periodEnd, 0, totalWages.toFixed(2), totalTax.toFixed(2), totalBenefits.toFixed(2), total.toFixed(2), je.id, 'register_import']
  );
  return rowToEntry(rows[0]);
}

export async function getPayrollAccrualEntries(pool: Pool, tenantId: string, closeSessionId: string): Promise<PayrollAccrualEntry[]> {
  const { rows } = await pool.query(
    'SELECT * FROM tenant_payroll_accrual_entries WHERE tenant_id = $1 AND close_session_id = $2 ORDER BY created_at',
    [tenantId, closeSessionId]
  );
  return rows.map(rowToEntry);
}
