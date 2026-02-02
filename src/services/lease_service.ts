/**
 * Lease service — ASC 842 / IFRS 16: classification, amortization schedule, position.
 */

import type { Pool } from 'pg';
import { computeLeaseLiability } from './leaseLiabilityCalc.js';
import * as repo from '../db/repositories/lease_repository.js';
import { sumRound2, minus as decMinus, round2, absGt } from '../utils/decimal.js';
import type { LeaseRow, LeaseScheduleRow, LeaseClassification, PaymentFrequency } from '../db/repositories/lease_repository.js';

export type { LeaseRow, LeaseScheduleRow, LeaseClassification, PaymentFrequency };

export interface LeaseScheduleEntry {
  periodStart: string;
  periodEnd: string;
  leasePayment: number;
  interestExpense: number;
  liabilityReduction: number;
  leaseLiability: number;
  rouAsset: number;
  rouAmortization: number;
}

/** Basis used for classification (auditable). */
export interface LeaseClassificationBasis {
  termMonths: number;
  economicLifeMonthsUsed: number;
  pvOfPayments: number;
  fairValueOfAsset?: number;
  fairValueUsed: boolean;
  majorPartOfLife: boolean;
  pvVsFvTest: boolean;
}

/**
 * ASC 842: classify as operating or finance (major part of economic life or PV ≥ 90% FV => finance).
 * When fairValueOfAsset is not provided, the 90% test is not applied (only term vs economic life).
 */
export function classifyLease(params: {
  termMonths: number;
  pvOfPayments: number;
  fairValueOfAsset?: number;
  /** Optional economic life in months; when not provided, 10 years (120) is used and documented. */
  economicLifeMonths?: number;
  standard: 'asc842' | 'ifrs16';
}): { classification: 'operating' | 'finance'; classificationBasis: LeaseClassificationBasis } {
  if (params.standard === 'ifrs16') {
    return {
      classification: 'finance',
      classificationBasis: {
        termMonths: params.termMonths,
        economicLifeMonthsUsed: params.economicLifeMonths ?? 120,
        pvOfPayments: params.pvOfPayments,
        fairValueOfAsset: params.fairValueOfAsset,
        fairValueUsed: false,
        majorPartOfLife: false,
        pvVsFvTest: false,
      },
    };
  }
  const { termMonths, pvOfPayments, fairValueOfAsset, economicLifeMonths } = params;
  const economicLifeMonthsUsed = economicLifeMonths ?? 120;
  const majorPartOfLife = termMonths >= economicLifeMonthsUsed * 0.75;
  const fairValueUsed = fairValueOfAsset != null && fairValueOfAsset > 0;
  const pvVsFvTest = fairValueUsed && pvOfPayments / fairValueOfAsset! >= 0.9;
  const classification: 'operating' | 'finance' = majorPartOfLife || pvVsFvTest ? 'finance' : 'operating';
  return {
    classification,
    classificationBasis: {
      termMonths,
      economicLifeMonthsUsed,
      pvOfPayments,
      fairValueOfAsset,
      fairValueUsed,
      majorPartOfLife,
      pvVsFvTest,
    },
  };
}

/**
 * Build payment stream (optionally with escalation). Returns array of payment amounts per period.
 */
function buildPaymentStream(
  paymentAmount: number,
  termMonths: number,
  paymentFrequency: PaymentFrequency,
  escalationPct: number
): number[] {
  const periodsPerYear = paymentFrequency === 'monthly' ? 12 : paymentFrequency === 'quarterly' ? 4 : 1;
  const numPeriods = paymentFrequency === 'monthly'
    ? termMonths
    : paymentFrequency === 'quarterly'
      ? Math.ceil(termMonths / 3)
      : Math.ceil(termMonths / 12);
  const payments: number[] = [];
  for (let i = 0; i < numPeriods; i++) {
    const esc = escalationPct ? paymentAmount * Math.pow(1 + escalationPct, i / periodsPerYear) : paymentAmount;
    payments.push(round2(esc));
  }
  return payments;
}

/**
 * Period rate from annual discount rate by frequency.
 */
function periodRate(annualRate: number, paymentFrequency: PaymentFrequency): number {
  if (paymentFrequency === 'monthly') return annualRate / 12;
  if (paymentFrequency === 'quarterly') return annualRate / 4;
  return annualRate;
}

const ROUND_TRIP_TOLERANCE = 0.01;

/**
 * Build full amortization schedule for a lease (interest, liability reduction, ROU amortization).
 * After building, reconciles to contractual totals; if rounding drift exceeds tolerance,
 * applies a last-period sweep so total interest + total principal = total payments and ROU amort sums to initial ROU.
 */
export function buildAmortizationSchedule(lease: LeaseRow): LeaseScheduleEntry[] {
  const payments = buildPaymentStream(
    lease.paymentAmount,
    lease.termMonths,
    lease.paymentFrequency,
    lease.escalationPct ?? 0
  );
  const rate = periodRate(lease.discountRate, lease.paymentFrequency);
  const atEnd = true;

  const pvResult = computeLeaseLiability({
    leasePayments: payments,
    discountRate: rate,
    paymentTiming: atEnd ? 'end' : 'beginning',
  });
  let liability = pvResult.leaseLiability;
  let rouAsset = pvResult.rightOfUseAsset;
  const totalRou = rouAsset;
  const initialLiability = pvResult.leaseLiability;
  const totalPayments = payments.reduce((a, b) => a + b, 0);
  const totalContractualInterest = totalPayments - initialLiability;
  const numPeriods = payments.length;
  const rouAmortPerPeriod = totalRou / numPeriods;

  const start = new Date(lease.commencementDate);
  const entries: LeaseScheduleEntry[] = [];
  const monthStep = lease.paymentFrequency === 'monthly' ? 1 : lease.paymentFrequency === 'quarterly' ? 3 : 12;

  for (let i = 0; i < payments.length; i++) {
    const periodStart = new Date(start);
    periodStart.setMonth(periodStart.getMonth() + i * monthStep);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + monthStep);
    periodEnd.setDate(0);
    if (periodEnd.getMonth() !== (periodStart.getMonth() + monthStep - 1) % 12) {
      periodEnd.setDate(new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 0).getDate());
    }
    const periodStartStr = periodStart.toISOString().slice(0, 10);
    const periodEndStr = periodEnd.toISOString().slice(0, 10);

    const payment = payments[i]!;
    const interest = round2(liability * rate);
    const liabilityReduction = round2(payment - interest);
    liability = round2(liability - liabilityReduction);
    if (liability < 0) liability = 0;
    const rouAmort = i === payments.length - 1
      ? round2(rouAsset - 0)
      : round2(rouAmortPerPeriod);
    rouAsset = round2(rouAsset - rouAmort);
    if (rouAsset < 0) rouAsset = 0;

    entries.push({
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
      leasePayment: payment,
      interestExpense: interest,
      liabilityReduction,
      leaseLiability: liability,
      rouAsset,
      rouAmortization: rouAmort,
    });
  }

  if (entries.length === 0) return entries;

  const sumInterest = sumRound2(entries.map((e) => e.interestExpense));
  const sumLiabilityRed = sumRound2(entries.map((e) => e.liabilityReduction));
  const sumRouAmort = sumRound2(entries.map((e) => e.rouAmortization));
  const needsSweep =
    absGt(sumInterest, totalContractualInterest, ROUND_TRIP_TOLERANCE) ||
    absGt(sumLiabilityRed, initialLiability, ROUND_TRIP_TOLERANCE) ||
    absGt(sumRouAmort, totalRou, ROUND_TRIP_TOLERANCE);

  if (needsSweep) {
    const last = entries[entries.length - 1]!;
    const prev = entries[entries.length - 2];
    const priorInterest = sumInterest - last.interestExpense;
    const lastInterest = decMinus(totalContractualInterest, priorInterest);
    const lastLiabilityRed = prev ? prev.leaseLiability : initialLiability;
    const priorRouAmort = sumRouAmort - last.rouAmortization;
    const lastRouAmort = decMinus(totalRou, priorRouAmort);
    entries[entries.length - 1] = {
      ...last,
      interestExpense: round2(lastInterest),
      liabilityReduction: round2(lastLiabilityRed),
      leaseLiability: 0,
      rouAmortization: round2(lastRouAmort),
      rouAsset: 0,
    };
  }

  return entries;
}

export async function createLease(
  tenantId: string,
  pool: Pool,
  input: Omit<LeaseRow, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> & {
    fairValueOfAsset?: number;
    economicLifeMonths?: number;
  }
): Promise<LeaseRow> {
  const { fairValueOfAsset, economicLifeMonths, ...leaseInput } = input;
  const payments = buildPaymentStream(
    leaseInput.paymentAmount,
    leaseInput.termMonths,
    leaseInput.paymentFrequency,
    leaseInput.escalationPct ?? 0
  );
  const rate = periodRate(leaseInput.discountRate, leaseInput.paymentFrequency);
  const pvResult = computeLeaseLiability({ leasePayments: payments, discountRate: rate, paymentTiming: 'end' });
  const { classification, classificationBasis } = classifyLease({
    termMonths: leaseInput.termMonths,
    pvOfPayments: pvResult.leaseLiability,
    fairValueOfAsset,
    economicLifeMonths,
    standard: leaseInput.standard,
  });
  return repo.createLease(pool, tenantId, { ...leaseInput, classification, classificationBasis });
}

export async function getLease(tenantId: string, pool: Pool, id: string): Promise<LeaseRow | null> {
  return repo.getLease(pool, tenantId, id);
}

export async function listLeases(tenantId: string, pool: Pool): Promise<LeaseRow[]> {
  return repo.listLeases(pool, tenantId);
}

export async function updateLease(
  tenantId: string,
  pool: Pool,
  id: string,
  patch: Partial<Omit<LeaseRow, 'id' | 'tenantId' | 'createdAt'>>
): Promise<LeaseRow | null> {
  return repo.updateLease(pool, tenantId, id, patch);
}

export async function deleteLease(tenantId: string, pool: Pool, id: string): Promise<boolean> {
  return repo.deleteLease(pool, tenantId, id);
}

export async function generateAndPersistSchedule(tenantId: string, pool: Pool, leaseId: string): Promise<LeaseScheduleRow[]> {
  const lease = await repo.getLease(pool, tenantId, leaseId);
  if (!lease) throw new Error('Lease not found');
  await repo.deleteScheduleByLeaseId(pool, leaseId);
  const entries = buildAmortizationSchedule(lease);
  const rows = entries.map((e) => ({
    leaseId,
    periodStart: e.periodStart,
    periodEnd: e.periodEnd,
    leasePayment: e.leasePayment,
    interestExpense: e.interestExpense,
    liabilityReduction: e.liabilityReduction,
    leaseLiability: e.leaseLiability,
    rouAsset: e.rouAsset,
    rouAmortization: e.rouAmortization,
  }));
  return repo.createLeaseScheduleRows(pool, rows);
}

export async function getLeaseSchedule(tenantId: string, pool: Pool, leaseId: string): Promise<LeaseScheduleRow[]> {
  const lease = await repo.getLease(pool, tenantId, leaseId);
  if (!lease) throw new Error('Lease not found');
  return repo.listLeaseSchedules(pool, leaseId);
}

export async function getLeasePosition(tenantId: string, pool: Pool, periodLabel: string): Promise<{
  totalRouAsset: number;
  totalLeaseLiability: number;
}> {
  return repo.getLeasePositionForPeriod(pool, tenantId, periodLabel);
}
