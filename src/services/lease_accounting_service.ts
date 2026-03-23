/**
 * ASC 842 Lease Accounting Service
 * Present value computation, payment schedule generation, period entry proposals,
 * lease modifications, and disclosure generation.
 * All monetary computation via Decimal.js. AI boundary enforced on all write paths.
 */

import type { Pool } from 'pg';
import Decimal from 'decimal.js';
import { assertNoAiMutationContext } from '../lib/ai_boundary.js';
import { createDraftJE } from './journal_entry_service.js';
import { round2 } from '../utils/decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// ============================================================================
// Types
// ============================================================================

export interface LeaseRow {
  id: string;
  tenantId: string;
  entityId: string;
  leaseName: string;
  leaseType: 'finance' | 'operating';
  commencementDate: string;
  termMonths: number;
  monthlyPayment: string;
  ibrAnnual: string;
  rouAssetInitial: string;
  leaseLiabilityInitial: string;
  assetAccount: string;
  liabilityAccount: string;
  expenseAccount: string;
  interestAccount: string;
  amortizationAccount: string;
  accumAmortizationAccount: string;
  status: 'active' | 'expired' | 'terminated' | 'modified';
  createdAt: string;
  updatedAt: string;
}

export interface PaymentScheduleRow {
  id: string;
  tenantId: string;
  leaseId: string;
  periodNumber: number;
  paymentDate: string;
  paymentAmount: string;
  interestAmount: string;
  principalAmount: string;
  beginningLiability: string;
  endingLiability: string;
  rouAmortization: string;
  straightLineExpense: string;
  createdAt: string;
}

export interface PeriodEntryRow {
  id: string;
  tenantId: string;
  leaseId: string;
  closeSessionId: string;
  scheduleId: string;
  journalEntryId: string | null;
  entryType: 'interest' | 'amortization' | 'operating_expense';
  amount: string;
  createdAt: string;
}

export interface LeaseModificationRow {
  id: string;
  tenantId: string;
  leaseId: string;
  modificationDate: string;
  newTermMonths: number | null;
  newMonthlyPayment: string | null;
  newIbrAnnual: string | null;
  remeasuredLiability: string;
  rouAdjustment: string;
  journalEntryId: string | null;
  createdAt: string;
}

export interface LeaseDisclosure {
  maturityAnalysis: { year: number; totalPayments: string }[];
  weightedAverageRemainingTerm: string;
  weightedAverageDiscountRate: string;
  financeLeaseExpense: { interest: string; amortization: string; total: string };
  operatingLeaseExpense: string;
  totalLeaseCount: number;
  financeLeaseCount: number;
  operatingLeaseCount: number;
}

// ============================================================================
// Present Value Computation (Decimal.js only — no Math.pow)
// ============================================================================

/**
 * Compute PV of lease payments using Decimal.js pow().
 * PV = sum of payment / (1 + monthlyRate)^periodNumber
 */
export function computePresentValue(
  payments: { amount: string; periodNumber: number }[],
  ibrAnnual: string,
  _termMonths: number
): string {
  const monthlyRate = new Decimal(ibrAnnual).div(12);
  let pv = new Decimal(0);

  for (const p of payments) {
    const amount = new Decimal(p.amount);
    const discountFactor = new Decimal(1).plus(monthlyRate).pow(p.periodNumber);
    pv = pv.plus(amount.div(discountFactor));
  }

  return pv.toDecimalPlaces(2).toFixed(2);
}

// ============================================================================
// Create Lease
// ============================================================================

export async function createLease(
  pool: Pool,
  tenantId: string,
  entityId: string,
  data: {
    leaseName: string;
    leaseType: 'finance' | 'operating';
    commencementDate: string;
    termMonths: number;
    monthlyPayment: string;
    ibrAnnual: string;
    assetAccount?: string;
    liabilityAccount?: string;
    expenseAccount?: string;
    interestAccount?: string;
    amortizationAccount?: string;
    accumAmortizationAccount?: string;
  }
): Promise<LeaseRow> {
  assertNoAiMutationContext();

  if (!data.leaseName || !data.leaseType || !data.commencementDate || !data.termMonths || !data.monthlyPayment || !data.ibrAnnual) {
    throw new Error('Required fields: leaseName, leaseType, commencementDate, termMonths, monthlyPayment, ibrAnnual');
  }

  // Build payment array for PV computation
  const payments: { amount: string; periodNumber: number }[] = [];
  for (let i = 1; i <= data.termMonths; i++) {
    payments.push({ amount: data.monthlyPayment, periodNumber: i });
  }

  const pvValue = computePresentValue(payments, data.ibrAnnual, data.termMonths);

  const res = await pool.query(
    `INSERT INTO tenant_leases
       (tenant_id, entity_id, lease_name, lease_type, commencement_date, term_months,
        monthly_payment, ibr_annual, rou_asset_initial, lease_liability_initial,
        asset_account, liability_account, expense_account, interest_account,
        amortization_account, accum_amortization_account)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      tenantId, entityId, data.leaseName, data.leaseType, data.commencementDate,
      data.termMonths, data.monthlyPayment, data.ibrAnnual, pvValue, pvValue,
      data.assetAccount ?? '1800', data.liabilityAccount ?? '2800',
      data.expenseAccount ?? '6200', data.interestAccount ?? '7100',
      data.amortizationAccount ?? '6210', data.accumAmortizationAccount ?? '1810',
    ]
  );

  return mapLeaseRow(res.rows[0]);
}

// ============================================================================
// Generate Payment Schedule
// ============================================================================

/**
 * Generate monthly payment schedule for a lease.
 * Finance: interest = beginning_liability * monthly_ibr; principal = payment - interest
 * Operating: straight_line = total_undiscounted / term_months
 */
export async function generatePaymentSchedule(
  pool: Pool,
  tenantId: string,
  leaseId: string
): Promise<PaymentScheduleRow[]> {
  assertNoAiMutationContext();

  const leaseRes = await pool.query(
    `SELECT * FROM tenant_leases WHERE id = $1 AND tenant_id = $2`,
    [leaseId, tenantId]
  );
  if (leaseRes.rows.length === 0) throw new Error('Lease not found');
  const lease = mapLeaseRow(leaseRes.rows[0]);

  // Delete existing schedule
  await pool.query(
    `DELETE FROM tenant_lease_payment_schedule WHERE lease_id = $1 AND tenant_id = $2`,
    [leaseId, tenantId]
  );

  const monthlyRate = new Decimal(lease.ibrAnnual).div(12);
  const payment = new Decimal(lease.monthlyPayment);
  const termMonths = lease.termMonths;
  const rouInitial = new Decimal(lease.rouAssetInitial);
  const totalUndiscounted = payment.mul(termMonths);

  let beginningLiability = new Decimal(lease.leaseLiabilityInitial);
  const commDate = new Date(lease.commencementDate);
  const results: PaymentScheduleRow[] = [];

  for (let period = 1; period <= termMonths; period++) {
    const paymentDate = new Date(commDate);
    paymentDate.setMonth(paymentDate.getMonth() + period);
    const paymentDateStr = paymentDate.toISOString().slice(0, 10);

    let interest: Decimal;
    let principal: Decimal;
    let rouAmortization: Decimal;
    let straightLineExpense: Decimal;

    if (lease.leaseType === 'finance') {
      interest = beginningLiability.mul(monthlyRate).toDecimalPlaces(2);
      principal = payment.minus(interest).toDecimalPlaces(2);
      rouAmortization = rouInitial.div(termMonths).toDecimalPlaces(2);
      straightLineExpense = new Decimal(0);
    } else {
      // Operating lease
      straightLineExpense = totalUndiscounted.div(termMonths).toDecimalPlaces(2);
      interest = beginningLiability.mul(monthlyRate).toDecimalPlaces(2);
      principal = payment.minus(interest).toDecimalPlaces(2);
      rouAmortization = new Decimal(0);
    }

    const endingLiability = beginningLiability.minus(principal).toDecimalPlaces(2);

    const insertRes = await pool.query(
      `INSERT INTO tenant_lease_payment_schedule
         (tenant_id, lease_id, period_number, payment_date, payment_amount,
          interest_amount, principal_amount, beginning_liability, ending_liability,
          rou_amortization, straight_line_expense)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        tenantId, leaseId, period, paymentDateStr,
        payment.toFixed(2), interest.toFixed(2), principal.toFixed(2),
        beginningLiability.toFixed(2), endingLiability.toFixed(2),
        rouAmortization.toFixed(2), straightLineExpense.toFixed(2),
      ]
    );

    results.push(mapScheduleRow(insertRes.rows[0]));
    beginningLiability = endingLiability;
  }

  return results;
}

// ============================================================================
// Propose Period Entries
// ============================================================================

/**
 * For each active lease, find schedule rows in the period and create draft JEs.
 * Finance: 2 JEs (interest + amortization). Operating: 1 JE (lease expense).
 */
export async function proposePeriodEntries(
  pool: Pool,
  tenantId: string,
  entityId: string,
  closeSessionId: string,
  periodStart: string,
  periodEnd: string
): Promise<PeriodEntryRow[]> {
  assertNoAiMutationContext();

  const leasesRes = await pool.query(
    `SELECT * FROM tenant_leases
     WHERE tenant_id = $1 AND entity_id = $2 AND status = 'active'`,
    [tenantId, entityId]
  );

  const entries: PeriodEntryRow[] = [];

  for (const leaseRow of leasesRes.rows) {
    const lease = mapLeaseRow(leaseRow);

    // Find schedule rows within the period
    const schedRes = await pool.query(
      `SELECT * FROM tenant_lease_payment_schedule
       WHERE tenant_id = $1 AND lease_id = $2
         AND payment_date >= $3 AND payment_date <= $4
       ORDER BY period_number`,
      [tenantId, lease.id, periodStart, periodEnd]
    );

    for (const schedRow of schedRes.rows) {
      const sched = mapScheduleRow(schedRow);

      if (lease.leaseType === 'finance') {
        // (a) Interest entry
        const interestAmt = new Decimal(sched.interestAmount);
        if (!interestAmt.isZero()) {
          const interestJE = await createDraftJE(pool, {
            closeSessionId,
            tenantId,
            memo: `${lease.leaseName} interest period ${sched.paymentDate}`,
            source: 'manual',
            lines: [
              { accountRef: lease.interestAccount, debit: interestAmt.toNumber(), credit: 0, description: 'Lease interest expense' },
              { accountRef: lease.liabilityAccount, debit: 0, credit: interestAmt.toNumber(), description: 'Lease liability interest accrual' },
            ],
          });

          const entryRes = await pool.query(
            `INSERT INTO tenant_lease_period_entries
               (tenant_id, lease_id, close_session_id, schedule_id, journal_entry_id, entry_type, amount)
             VALUES ($1, $2, $3, $4, $5, 'interest', $6)
             RETURNING *`,
            [tenantId, lease.id, closeSessionId, sched.id, interestJE.id, interestAmt.toFixed(2)]
          );
          entries.push(mapPeriodEntryRow(entryRes.rows[0]));
        }

        // (b) ROU Amortization entry
        const amortAmt = new Decimal(sched.rouAmortization);
        if (!amortAmt.isZero()) {
          const amortJE = await createDraftJE(pool, {
            closeSessionId,
            tenantId,
            memo: `${lease.leaseName} ROU amortization ${sched.paymentDate}`,
            source: 'manual',
            lines: [
              { accountRef: lease.amortizationAccount, debit: amortAmt.toNumber(), credit: 0, description: 'ROU asset amortization' },
              { accountRef: lease.accumAmortizationAccount, debit: 0, credit: amortAmt.toNumber(), description: 'Accumulated amortization' },
            ],
          });

          const entryRes = await pool.query(
            `INSERT INTO tenant_lease_period_entries
               (tenant_id, lease_id, close_session_id, schedule_id, journal_entry_id, entry_type, amount)
             VALUES ($1, $2, $3, $4, $5, 'amortization', $6)
             RETURNING *`,
            [tenantId, lease.id, closeSessionId, sched.id, amortJE.id, amortAmt.toFixed(2)]
          );
          entries.push(mapPeriodEntryRow(entryRes.rows[0]));
        }
      } else {
        // Operating lease: single JE for straight-line expense
        const slExpense = new Decimal(sched.straightLineExpense);
        if (!slExpense.isZero()) {
          // Debit lease expense, credit ROU and lease liability proportionally
          const interest = new Decimal(sched.interestAmount);
          const principal = new Decimal(sched.principalAmount);
          const rouReduction = slExpense.minus(interest).toDecimalPlaces(2);

          const opJE = await createDraftJE(pool, {
            closeSessionId,
            tenantId,
            memo: `${lease.leaseName} operating lease expense ${sched.paymentDate}`,
            source: 'manual',
            lines: [
              { accountRef: lease.expenseAccount, debit: slExpense.toNumber(), credit: 0, description: 'Operating lease expense' },
              { accountRef: lease.assetAccount, debit: 0, credit: rouReduction.abs().toNumber(), description: 'ROU asset reduction' },
              { accountRef: lease.liabilityAccount, debit: 0, credit: interest.toNumber(), description: 'Lease liability reduction' },
            ],
          });

          const entryRes = await pool.query(
            `INSERT INTO tenant_lease_period_entries
               (tenant_id, lease_id, close_session_id, schedule_id, journal_entry_id, entry_type, amount)
             VALUES ($1, $2, $3, $4, $5, 'operating_expense', $6)
             RETURNING *`,
            [tenantId, lease.id, closeSessionId, sched.id, opJE.id, slExpense.toFixed(2)]
          );
          entries.push(mapPeriodEntryRow(entryRes.rows[0]));
        }
      }
    }
  }

  return entries;
}

// ============================================================================
// Process Modification
// ============================================================================

/**
 * Remeasure lease liability at modification date with new terms/IBR.
 * Compute ROU adjustment and create draft AJE.
 */
export async function processModification(
  pool: Pool,
  tenantId: string,
  leaseId: string,
  closeSessionId: string,
  modification: {
    modificationDate: string;
    newTermMonths?: number;
    newMonthlyPayment?: string;
    newIbrAnnual?: string;
  }
): Promise<LeaseModificationRow> {
  assertNoAiMutationContext();

  const leaseRes = await pool.query(
    `SELECT * FROM tenant_leases WHERE id = $1 AND tenant_id = $2`,
    [leaseId, tenantId]
  );
  if (leaseRes.rows.length === 0) throw new Error('Lease not found');
  const lease = mapLeaseRow(leaseRes.rows[0]);

  const newTermMonths = modification.newTermMonths ?? lease.termMonths;
  const newPayment = new Decimal(modification.newMonthlyPayment ?? lease.monthlyPayment);
  const newIbr = modification.newIbrAnnual ?? lease.ibrAnnual;

  // Compute remaining months from modification date
  const modDate = new Date(modification.modificationDate);
  const commDate = new Date(lease.commencementDate);
  const elapsedMonths = Math.max(0, (modDate.getFullYear() - commDate.getFullYear()) * 12 + (modDate.getMonth() - commDate.getMonth()));
  const remainingMonths = Math.max(0, newTermMonths - elapsedMonths);

  // Remeasure: PV of remaining payments at new IBR
  const payments: { amount: string; periodNumber: number }[] = [];
  for (let i = 1; i <= remainingMonths; i++) {
    payments.push({ amount: newPayment.toFixed(2), periodNumber: i });
  }
  const remeasuredLiability = computePresentValue(payments, newIbr, remainingMonths);

  // Current liability balance (from latest schedule row before mod date)
  const currentLiabRes = await pool.query(
    `SELECT ending_liability FROM tenant_lease_payment_schedule
     WHERE tenant_id = $1 AND lease_id = $2 AND payment_date <= $3
     ORDER BY period_number DESC LIMIT 1`,
    [tenantId, leaseId, modification.modificationDate]
  );
  const currentLiability = new Decimal(currentLiabRes.rows[0]?.ending_liability ?? lease.leaseLiabilityInitial);
  const rouAdjustment = new Decimal(remeasuredLiability).minus(currentLiability).toDecimalPlaces(2);

  // Create modification AJE if there is an adjustment
  let journalEntryId: string | null = null;
  if (!rouAdjustment.isZero()) {
    const isIncrease = rouAdjustment.greaterThan(0);
    const absAdj = rouAdjustment.abs().toNumber();

    const je = await createDraftJE(pool, {
      closeSessionId,
      tenantId,
      memo: `ASC 842 lease modification — ${lease.leaseName} remeasurement ${modification.modificationDate}`,
      source: 'manual',
      lines: isIncrease
        ? [
            { accountRef: lease.assetAccount, debit: absAdj, credit: 0, description: 'ROU asset increase' },
            { accountRef: lease.liabilityAccount, debit: 0, credit: absAdj, description: 'Lease liability increase' },
          ]
        : [
            { accountRef: lease.liabilityAccount, debit: absAdj, credit: 0, description: 'Lease liability decrease' },
            { accountRef: lease.assetAccount, debit: 0, credit: absAdj, description: 'ROU asset decrease' },
          ],
    });
    journalEntryId = je.id;
  }

  // Insert modification record
  const modRes = await pool.query(
    `INSERT INTO tenant_lease_modifications
       (tenant_id, lease_id, modification_date, new_term_months, new_monthly_payment,
        new_ibr_annual, remeasured_liability, rou_adjustment, journal_entry_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      tenantId, leaseId, modification.modificationDate,
      modification.newTermMonths ?? null,
      modification.newMonthlyPayment ?? null,
      modification.newIbrAnnual ?? null,
      remeasuredLiability,
      rouAdjustment.toFixed(2),
      journalEntryId,
    ]
  );

  // Update lease status
  await pool.query(
    `UPDATE tenant_leases SET status = 'modified', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
    [leaseId, tenantId]
  );

  return mapModificationRow(modRes.rows[0]);
}

// ============================================================================
// ASC 842 Disclosure
// ============================================================================

/**
 * Generate ASC 842 disclosure summary: maturity analysis, WARL, WADR, expense breakdown.
 */
export async function getASC842Disclosure(
  pool: Pool,
  tenantId: string,
  entityId: string,
  closeSessionId: string
): Promise<LeaseDisclosure> {
  const leasesRes = await pool.query(
    `SELECT * FROM tenant_leases WHERE tenant_id = $1 AND entity_id = $2 AND status IN ('active','modified')`,
    [tenantId, entityId]
  );
  const leases = leasesRes.rows.map(mapLeaseRow);

  let financeCount = 0;
  let operatingCount = 0;
  let totalFinanceInterest = new Decimal(0);
  let totalFinanceAmort = new Decimal(0);
  let totalOperatingExpense = new Decimal(0);
  let weightedTermNumerator = new Decimal(0);
  let weightedRateNumerator = new Decimal(0);
  let totalLiability = new Decimal(0);
  const maturityMap = new Map<number, Decimal>();

  for (const lease of leases) {
    const liability = new Decimal(lease.leaseLiabilityInitial);
    totalLiability = totalLiability.plus(liability);

    if (lease.leaseType === 'finance') financeCount++;
    else operatingCount++;

    // Weighted average calculations
    const commDate = new Date(lease.commencementDate);
    const now = new Date();
    const elapsedMonths = (now.getFullYear() - commDate.getFullYear()) * 12 + (now.getMonth() - commDate.getMonth());
    const remainingMonths = Math.max(0, lease.termMonths - elapsedMonths);
    weightedTermNumerator = weightedTermNumerator.plus(liability.mul(remainingMonths));
    weightedRateNumerator = weightedRateNumerator.plus(liability.mul(new Decimal(lease.ibrAnnual)));

    // Load schedule for maturity analysis and expense totals
    const schedRes = await pool.query(
      `SELECT * FROM tenant_lease_payment_schedule
       WHERE tenant_id = $1 AND lease_id = $2
       ORDER BY period_number`,
      [tenantId, lease.id]
    );

    for (const sr of schedRes.rows) {
      const sched = mapScheduleRow(sr);
      const payDate = new Date(sched.paymentDate);
      const year = payDate.getFullYear();
      const existing = maturityMap.get(year) ?? new Decimal(0);
      maturityMap.set(year, existing.plus(new Decimal(sched.paymentAmount)));

      if (lease.leaseType === 'finance') {
        totalFinanceInterest = totalFinanceInterest.plus(new Decimal(sched.interestAmount));
        totalFinanceAmort = totalFinanceAmort.plus(new Decimal(sched.rouAmortization));
      } else {
        totalOperatingExpense = totalOperatingExpense.plus(new Decimal(sched.straightLineExpense));
      }
    }
  }

  const warl = totalLiability.isZero()
    ? '0.00'
    : weightedTermNumerator.div(totalLiability).toDecimalPlaces(2).toFixed(2);

  const wadr = totalLiability.isZero()
    ? '0.000000'
    : weightedRateNumerator.div(totalLiability).toDecimalPlaces(6).toFixed(6);

  const maturityAnalysis = Array.from(maturityMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, total]) => ({ year, totalPayments: total.toDecimalPlaces(2).toFixed(2) }));

  const finTotal = totalFinanceInterest.plus(totalFinanceAmort).toDecimalPlaces(2);

  return {
    maturityAnalysis,
    weightedAverageRemainingTerm: warl,
    weightedAverageDiscountRate: wadr,
    financeLeaseExpense: {
      interest: totalFinanceInterest.toDecimalPlaces(2).toFixed(2),
      amortization: totalFinanceAmort.toDecimalPlaces(2).toFixed(2),
      total: finTotal.toFixed(2),
    },
    operatingLeaseExpense: totalOperatingExpense.toDecimalPlaces(2).toFixed(2),
    totalLeaseCount: leases.length,
    financeLeaseCount: financeCount,
    operatingLeaseCount: operatingCount,
  };
}

// ============================================================================
// Read helpers
// ============================================================================

export async function listLeases(
  pool: Pool,
  tenantId: string,
  entityId?: string
): Promise<LeaseRow[]> {
  if (entityId) {
    const res = await pool.query(
      `SELECT * FROM tenant_leases WHERE tenant_id = $1 AND entity_id = $2 ORDER BY created_at DESC`,
      [tenantId, entityId]
    );
    return res.rows.map(mapLeaseRow);
  }
  const res = await pool.query(
    `SELECT * FROM tenant_leases WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return res.rows.map(mapLeaseRow);
}

export async function getLease(pool: Pool, tenantId: string, leaseId: string): Promise<LeaseRow | null> {
  const res = await pool.query(
    `SELECT * FROM tenant_leases WHERE id = $1 AND tenant_id = $2`,
    [leaseId, tenantId]
  );
  if (res.rows.length === 0) return null;
  return mapLeaseRow(res.rows[0]);
}

export async function updateLease(
  pool: Pool,
  tenantId: string,
  leaseId: string,
  patch: Partial<{
    leaseName: string;
    status: string;
    assetAccount: string;
    liabilityAccount: string;
    expenseAccount: string;
    interestAccount: string;
    amortizationAccount: string;
    accumAmortizationAccount: string;
  }>
): Promise<LeaseRow | null> {
  assertNoAiMutationContext();

  const sets: string[] = [];
  const vals: unknown[] = [tenantId, leaseId];
  let idx = 3;

  if (patch.leaseName !== undefined) { sets.push(`lease_name = $${idx++}`); vals.push(patch.leaseName); }
  if (patch.status !== undefined) { sets.push(`status = $${idx++}`); vals.push(patch.status); }
  if (patch.assetAccount !== undefined) { sets.push(`asset_account = $${idx++}`); vals.push(patch.assetAccount); }
  if (patch.liabilityAccount !== undefined) { sets.push(`liability_account = $${idx++}`); vals.push(patch.liabilityAccount); }
  if (patch.expenseAccount !== undefined) { sets.push(`expense_account = $${idx++}`); vals.push(patch.expenseAccount); }
  if (patch.interestAccount !== undefined) { sets.push(`interest_account = $${idx++}`); vals.push(patch.interestAccount); }
  if (patch.amortizationAccount !== undefined) { sets.push(`amortization_account = $${idx++}`); vals.push(patch.amortizationAccount); }
  if (patch.accumAmortizationAccount !== undefined) { sets.push(`accum_amortization_account = $${idx++}`); vals.push(patch.accumAmortizationAccount); }

  if (sets.length === 0) return getLease(pool, tenantId, leaseId);

  sets.push('updated_at = now()');
  const res = await pool.query(
    `UPDATE tenant_leases SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`,
    vals
  );
  if (res.rows.length === 0) return null;
  return mapLeaseRow(res.rows[0]);
}

export async function getPaymentSchedule(pool: Pool, tenantId: string, leaseId: string): Promise<PaymentScheduleRow[]> {
  const res = await pool.query(
    `SELECT * FROM tenant_lease_payment_schedule WHERE tenant_id = $1 AND lease_id = $2 ORDER BY period_number`,
    [tenantId, leaseId]
  );
  return res.rows.map(mapScheduleRow);
}

export async function listPeriodEntries(pool: Pool, tenantId: string, closeSessionId: string): Promise<PeriodEntryRow[]> {
  const res = await pool.query(
    `SELECT * FROM tenant_lease_period_entries WHERE tenant_id = $1 AND close_session_id = $2 ORDER BY created_at`,
    [tenantId, closeSessionId]
  );
  return res.rows.map(mapPeriodEntryRow);
}

// ============================================================================
// Row mappers
// ============================================================================

function mapLeaseRow(row: Record<string, unknown>): LeaseRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    entityId: row.entity_id as string,
    leaseName: (row.lease_name ?? '') as string,
    leaseType: row.lease_type as LeaseRow['leaseType'],
    commencementDate: String(row.commencement_date).slice(0, 10),
    termMonths: Number(row.term_months ?? 0),
    monthlyPayment: String(row.monthly_payment ?? 0),
    ibrAnnual: String(row.ibr_annual ?? 0),
    rouAssetInitial: String(row.rou_asset_initial ?? 0),
    leaseLiabilityInitial: String(row.lease_liability_initial ?? 0),
    assetAccount: (row.asset_account ?? '1800') as string,
    liabilityAccount: (row.liability_account ?? '2800') as string,
    expenseAccount: (row.expense_account ?? '6200') as string,
    interestAccount: (row.interest_account ?? '7100') as string,
    amortizationAccount: (row.amortization_account ?? '6210') as string,
    accumAmortizationAccount: (row.accum_amortization_account ?? '1810') as string,
    status: row.status as LeaseRow['status'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapScheduleRow(row: Record<string, unknown>): PaymentScheduleRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    leaseId: row.lease_id as string,
    periodNumber: Number(row.period_number ?? 0),
    paymentDate: String(row.payment_date).slice(0, 10),
    paymentAmount: String(row.payment_amount ?? 0),
    interestAmount: String(row.interest_amount ?? 0),
    principalAmount: String(row.principal_amount ?? 0),
    beginningLiability: String(row.beginning_liability ?? 0),
    endingLiability: String(row.ending_liability ?? 0),
    rouAmortization: String(row.rou_amortization ?? 0),
    straightLineExpense: String(row.straight_line_expense ?? 0),
    createdAt: String(row.created_at),
  };
}

function mapPeriodEntryRow(row: Record<string, unknown>): PeriodEntryRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    leaseId: row.lease_id as string,
    closeSessionId: row.close_session_id as string,
    scheduleId: row.schedule_id as string,
    journalEntryId: (row.journal_entry_id as string) ?? null,
    entryType: row.entry_type as PeriodEntryRow['entryType'],
    amount: String(row.amount ?? 0),
    createdAt: String(row.created_at),
  };
}

function mapModificationRow(row: Record<string, unknown>): LeaseModificationRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    leaseId: row.lease_id as string,
    modificationDate: String(row.modification_date).slice(0, 10),
    newTermMonths: row.new_term_months != null ? Number(row.new_term_months) : null,
    newMonthlyPayment: row.new_monthly_payment != null ? String(row.new_monthly_payment) : null,
    newIbrAnnual: row.new_ibr_annual != null ? String(row.new_ibr_annual) : null,
    remeasuredLiability: String(row.remeasured_liability ?? 0),
    rouAdjustment: String(row.rou_adjustment ?? 0),
    journalEntryId: (row.journal_entry_id as string) ?? null,
    createdAt: String(row.created_at),
  };
}
