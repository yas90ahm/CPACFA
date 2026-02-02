/**
 * LBO service — sources/uses, debt schedule, projection, IRR/MOIC (CFA).
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/lbo_repository.js';

export interface SourcesUses {
  sources: { equity: number; debt: number; rollover?: number };
  uses: { purchase: number; fees: number; debtPaydown?: number };
}

export interface DebtScheduleEntry {
  period: number;
  beginningDebt: number;
  interest: number;
  principal: number;
  endingDebt: number;
}

export interface LboProjectionResult {
  entryEv: number;
  entryMultiple: number;
  exitYear: number;
  exitEv: number;
  exitMultiple: number;
  fcfByYear: number[];
  debtSchedule: DebtScheduleEntry[];
  equityValueAtExit: number;
  irr: number;
  moic: number;
}

/**
 * Build sources and uses from acquisition price, fees %, existing debt, cash.
 */
export function buildSourcesUses(
  acquisitionPrice: number,
  feesPct: number,
  existingDebt: number,
  cash: number
): SourcesUses {
  const fees = acquisitionPrice * feesPct;
  const totalUses = acquisitionPrice + fees;
  const debtPaydown = Math.min(existingDebt, totalUses);
  const equity = Math.max(0, totalUses - (existingDebt + cash) - 0);
  const debt = Math.max(0, totalUses - equity - cash);
  return {
    sources: { equity, debt, rollover: 0 },
    uses: { purchase: acquisitionPrice, fees, debtPaydown },
  };
}

/**
 * Build debt schedule: interest and principal by period.
 */
export function buildDebtSchedule(
  initialDebt: number,
  rate: number,
  repaymentSchedule: number[]
): DebtScheduleEntry[] {
  const entries: DebtScheduleEntry[] = [];
  let balance = initialDebt;
  for (let i = 0; i < repaymentSchedule.length; i++) {
    const principal = repaymentSchedule[i] ?? 0;
    const interest = round2(balance * rate);
    const endingDebt = Math.max(0, balance - principal);
    entries.push({
      period: i + 1,
      beginningDebt: balance,
      interest,
      principal,
      endingDebt,
    });
    balance = endingDebt;
  }
  return entries;
}

/**
 * Run LBO projection: FCF growth, debt paydown, equity value at exit, IRR and MOIC.
 */
export function runLboProjection(
  entryEv: number,
  initialEbitda: number,
  fcfMarginPct: number,
  growthRate: number,
  exitYear: number,
  exitMultiple: number,
  equityInvested: number,
  debtSchedule: DebtScheduleEntry[]
): LboProjectionResult {
  const fcfByYear: number[] = [];
  let ebitda = initialEbitda;
  let cumulativeDebt = debtSchedule.reduce((s, d) => s + d.beginningDebt, 0) / Math.max(1, debtSchedule.length);
  const initialDebt = debtSchedule[0]?.beginningDebt ?? 0;

  for (let y = 0; y < exitYear; y++) {
    const fcf = ebitda * fcfMarginPct;
    fcfByYear.push(round2(fcf));
    ebitda *= 1 + growthRate;
    const ds = debtSchedule[y];
    if (ds) cumulativeDebt = ds.endingDebt;
  }

  const exitEbitda = initialEbitda * Math.pow(1 + growthRate, exitYear);
  const exitEv = exitEbitda * exitMultiple;
  const endingDebt = debtSchedule[Math.min(exitYear - 1, debtSchedule.length - 1)]?.endingDebt ?? 0;
  const equityValueAtExit = Math.max(0, exitEv - endingDebt);
  const moic = equityInvested > 0 ? equityValueAtExit / equityInvested : 0;
  const irr = equityInvested > 0 && equityValueAtExit > 0
    ? Math.pow(equityValueAtExit / equityInvested, 1 / exitYear) - 1
    : 0;

  return {
    entryEv,
    entryMultiple: initialEbitda > 0 ? entryEv / initialEbitda : 0,
    exitYear,
    exitEv: round2(exitEv),
    exitMultiple,
    fcfByYear,
    debtSchedule,
    equityValueAtExit: round2(equityValueAtExit),
    irr: round4(irr),
    moic: round4(moic),
  };
}

export async function createLboModel(
  tenantId: string,
  pool: Pool,
  row: Omit<repo.LboModelRow, 'id' | 'createdAt' | 'updatedAt'>
): Promise<repo.LboModelRow> {
  return repo.createLboModel(pool, tenantId, row);
}

export async function getLboModel(
  tenantId: string,
  pool: Pool,
  id: string
): Promise<repo.LboModelRow | null> {
  return repo.getLboModel(pool, tenantId, id);
}

export async function listLboModels(tenantId: string, pool: Pool): Promise<repo.LboModelRow[]> {
  return repo.listLboModels(pool, tenantId);
}

export async function updateLboModel(
  tenantId: string,
  pool: Pool,
  id: string,
  patch: Partial<Omit<repo.LboModelRow, 'id' | 'tenantId' | 'createdAt'>>
): Promise<repo.LboModelRow | null> {
  return repo.updateLboModel(pool, tenantId, id, patch);
}

export async function deleteLboModel(tenantId: string, pool: Pool, id: string): Promise<boolean> {
  return repo.deleteLboModel(pool, tenantId, id);
}
