/**
 * Payroll accrual-ready pipeline: gross/net/taxes/benefits and period accrual.
 */

import type { CanonicalPayrollItem } from '../types/canonical_ap_ar_payroll.js';

export interface PayrollAccrualInput {
  items: CanonicalPayrollItem[];
  /** Period end (ISO date) for accrual cutoff */
  periodEndDate?: string;
  /** Currency */
  currency?: string;
}

export interface PayrollAccrualResult {
  /** Total gross pay in scope */
  totalGrossPay: number;
  /** Total net pay */
  totalNetPay: number;
  /** Total taxes (withholding, employer) */
  totalTaxes: number;
  /** Total benefits */
  totalBenefits: number;
  /** Total deductions (other) */
  totalDeductions: number;
  /** Count of employees/rows in scope */
  employeeCount: number;
  /** Accrual for period (same as totalGrossPay when all items in period; otherwise subset by pay period) */
  accrualGross: number;
  accrualTaxes: number;
  accrualBenefits: number;
  /** Period end used */
  periodEndDate: string;
  currency: string;
  items: CanonicalPayrollItem[];
  errors: string[];
}

function parseDate(s: string | undefined): number | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

/**
 * Build payroll accrual summary from canonical payroll items.
 * Includes all items; accrual amounts default to totals (filter by periodEndDate if needed).
 */
export function buildPayrollAccrual(input: PayrollAccrualInput): PayrollAccrualResult {
  const { items, periodEndDate: periodEnd, currency = 'USD' } = input;
  const periodEndDate = periodEnd ?? new Date().toISOString().slice(0, 10);
  const periodEndMs = new Date(periodEndDate).getTime();
  const errors: string[] = [];

  let totalGrossPay = 0;
  let totalNetPay = 0;
  let totalTaxes = 0;
  let totalBenefits = 0;
  let totalDeductions = 0;
  let accrualGross = 0;
  let accrualTaxes = 0;
  let accrualBenefits = 0;

  for (const item of items) {
    const gross = item.grossPay ?? 0;
    const net = item.netPay ?? 0;
    const taxes = item.taxes ?? 0;
    const benefits = item.benefits ?? 0;
    const deductions = item.deductions ?? 0;
    totalGrossPay += gross;
    totalNetPay += net;
    totalTaxes += taxes;
    totalBenefits += benefits;
    totalDeductions += deductions;
    const payDateMs = parseDate(item.payDate ?? item.payPeriodEnd);
    const inPeriod = payDateMs == null || payDateMs <= periodEndMs;
    if (inPeriod) {
      accrualGross += gross;
      accrualTaxes += taxes;
      accrualBenefits += benefits;
    }
  }

  return {
    totalGrossPay,
    totalNetPay,
    totalTaxes,
    totalBenefits,
    totalDeductions,
    employeeCount: items.length,
    accrualGross,
    accrualTaxes,
    accrualBenefits,
    periodEndDate,
    currency,
    items,
    errors,
  };
}
