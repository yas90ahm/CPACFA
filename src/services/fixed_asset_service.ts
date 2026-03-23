/**
 * STATUS: UNWIRED — This service compiles but is not imported by any active route.
 * It exists as potential future functionality.
 * Last verified: 2026-02-25
 * To activate: Create a route file that imports this service and register it in server.ts
 */

/**
 * Fixed asset service — CRUD, depreciation run (straight-line, declining balance), summary.
 * Pure schedule functions (depreciationScheduleSl, depreciationScheduleDdb) ported from backend/accounting_engine.py for API parity.
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/fixed_asset_repository.js';
import type { FixedAssetRow, DepreciationMethod, DepreciationRunRow, DepreciationRunDetailRow } from '../db/repositories/fixed_asset_repository.js';
import Decimal from 'decimal.js';
import { minus as decMinus, round2 } from '../utils/decimal.js';
import { NotImplementedError } from '../errors.js';

export type { FixedAssetRow, DepreciationRunRow, DepreciationRunDetailRow, DepreciationMethod };

/** Single period line in a depreciation schedule (ASC 360-10-35). */
export interface DepreciationScheduleLine {
  period: number;
  periodEndDate: string; // ISO date
  beginningBookValue: number;
  depreciationExpense: number;
  accumulatedDepreciation: number;
  endingBookValue: number;
}

/** Full depreciation schedule for one asset (ASC 360 / IAS 16). */
export interface DepreciationSchedule {
  assetId: string;
  assetDescription: string;
  method: 'straight_line' | 'declining_balance';
  cost: number;
  salvageValue: number;
  usefulLifeYears: number;
  placedInServiceDate: string; // ISO date
  lines: DepreciationScheduleLine[];
  codificationRef?: { standard: string; reference: string; title: string };
}

export interface DepreciationPeriodEntry {
  periodStart: string;
  periodEnd: string;
  fixedAssetId: string;
  depreciationAmount: number;
  accumulatedDepreciation: number;
}

/**
 * Compute period depreciation for one asset (straight-line or declining balance).
 * Straight-line: (cost - residual) / useful_life_years, prorated for period fraction.
 * Declining balance: book value * (rate/periods per year); rate = 2/useful_life_years for DDB.
 */
function computePeriodDepreciation(
  asset: FixedAssetRow,
  periodStart: string,
  periodEnd: string,
  accumulatedBeforePeriod: number
): number {
  const cost = Number(asset.cost);
  const residual = Number(asset.residualValue ?? 0);
  const lifeYears = asset.usefulLifeYears;
  if (lifeYears <= 0) return 0;

  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const depStart = new Date(asset.depreciationStartDate);
  const effectiveStart = start < depStart ? depStart : start;
  if (effectiveStart >= end) return 0;

  const daysInPeriod = (end.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24);
  const daysInYear = 365.25;
  const fraction = Math.min(1, daysInPeriod / daysInYear);

  const maxAccumulated = Math.max(0, new Decimal(cost).minus(new Decimal(residual)).toNumber());
  const remainingToDepreciate = Math.max(0, new Decimal(maxAccumulated).minus(accumulatedBeforePeriod).toNumber());

  if (asset.method === 'straight_line') {
    const depreciable = Math.max(0, new Decimal(cost).minus(new Decimal(residual)).toNumber());
    const annualDep = lifeYears > 0 ? new Decimal(depreciable).div(lifeYears).toNumber() : 0;
    const periodDep = new Decimal(annualDep).mul(fraction).toNumber();
    if (periodDep >= remainingToDepreciate) {
      return round2(remainingToDepreciate);
    }
    return round2(periodDep);
  }

  if (asset.method === 'declining_balance') {
    const bookValue = Math.max(0, new Decimal(cost).minus(accumulatedBeforePeriod).toNumber());
    if (bookValue <= 0) return 0;
    const rate = new Decimal(2).div(lifeYears).toNumber(); // double-declining
    const annualDep = new Decimal(bookValue).mul(rate).toNumber();
    const periodDep = new Decimal(annualDep).mul(fraction).toNumber();
    if (periodDep >= remainingToDepreciate) {
      return round2(remainingToDepreciate);
    }
    return round2(periodDep);
  }

  if (asset.method === 'units_of_production') {
    throw new NotImplementedError(
      'units_of_production depreciation',
      'Units-of-production depreciation requires usage data per period. Use straight_line or declining_balance, or add usage input support.'
    );
  }
  return 0;
}

/**
 * Compute accumulated depreciation from depreciation_start_date to periodStart (exclusive).
 */
function accumulatedToDate(asset: FixedAssetRow, toDate: string): number {
  const depStart = new Date(asset.depreciationStartDate);
  const to = new Date(toDate);
  if (to <= depStart) return 0;
  let acc = 0;
  const maxAccumulated = Math.max(0, new Decimal(asset.cost).minus(new Decimal(asset.residualValue ?? 0)).toNumber());
  const lifeYears = Math.ceil(asset.usefulLifeYears) + 2;
  for (let y = 0; y < lifeYears; y++) {
    const rangeStart = new Date(depStart.getFullYear() + y, depStart.getMonth(), depStart.getDate());
    const rangeEnd = new Date(depStart.getFullYear() + y + 1, depStart.getMonth(), depStart.getDate());
    if (rangeStart >= to) break;
    const end = rangeEnd > to ? to : rangeEnd;
    if (rangeStart >= end) continue;
    const periodDep = computePeriodDepreciation(
      asset,
      rangeStart.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
      acc
    );
    acc += periodDep;
    if (acc >= maxAccumulated) return maxAccumulated;
  }
  return Math.min(acc, maxAccumulated);
}

/**
 * Build one period's depreciation entry for an asset.
 */
function buildDepreciationEntriesForAsset(
  asset: FixedAssetRow,
  periodStart: string,
  periodEnd: string
): DepreciationPeriodEntry {
  const depStart = new Date(asset.depreciationStartDate);
  const end = new Date(periodEnd);
  if (end <= depStart) {
    return {
      periodStart,
      periodEnd,
      fixedAssetId: asset.id,
      depreciationAmount: 0,
      accumulatedDepreciation: 0,
    };
  }
  const accumulatedBefore = accumulatedToDate(asset, periodStart);
  const periodDep = computePeriodDepreciation(asset, periodStart, periodEnd, accumulatedBefore);
  const cost = Number(asset.cost);
  const residual = Number(asset.residualValue ?? 0);
  const maxAccumulated = Math.max(0, cost - residual);
  let accumulatedEnd = round2(accumulatedBefore + periodDep);
  let finalAmount = periodDep;
  if (accumulatedEnd >= maxAccumulated - 0.01) {
    finalAmount = round2(decMinus(maxAccumulated, accumulatedBefore));
    accumulatedEnd = maxAccumulated;
  }
  return {
    periodStart,
    periodEnd,
    fixedAssetId: asset.id,
    depreciationAmount: finalAmount,
    accumulatedDepreciation: accumulatedEnd,
  };
}

const ASC_360_35 = { standard: 'FASB', reference: 'ASC 360-10-35', title: 'Property, Plant & Equipment—Subsequent Measurement' };

/**
 * Straight-line depreciation schedule (pure function). API parity with backend/accounting_engine.depreciation_schedule_sl.
 * ASC 360-10-35. Returns one line per year of useful life.
 */
export function depreciationScheduleSl(
  cost: number,
  salvageValue: number,
  usefulLifeYears: number,
  placedInServiceDate: string,
  assetId = '',
  assetDescription = ''
): DepreciationSchedule {
  if (usefulLifeYears <= 0) throw new Error('Useful life must be positive');
  const depreciable = Math.max(0, cost - salvageValue);
  const annual = depreciable / usefulLifeYears;
  const placed = new Date(placedInServiceDate);
  const lines: DepreciationScheduleLine[] = [];
  let accDep = 0;
  for (let year = 1; year <= usefulLifeYears; year++) {
    const periodEnd = new Date(placed.getFullYear() + year, placed.getMonth(), placed.getDate());
    const periodEndStr = periodEnd.toISOString().slice(0, 10);
    const remaining = Math.max(0, cost - salvageValue - accDep);
    const exp = round2(Math.min(annual, remaining));
    accDep += exp;
    const bv = round2(cost - accDep);
    lines.push({
      period: year,
      periodEndDate: periodEndStr,
      beginningBookValue: round2(bv + exp),
      depreciationExpense: exp,
      accumulatedDepreciation: round2(accDep),
      endingBookValue: bv,
    });
  }
  return {
    assetId,
    assetDescription,
    method: 'straight_line',
    cost,
    salvageValue,
    usefulLifeYears,
    placedInServiceDate,
    lines,
    codificationRef: ASC_360_35,
  };
}

/**
 * Double-declining balance depreciation schedule (pure function). API parity with backend/accounting_engine.depreciation_schedule_ddb.
 * ASC 360-10-35. FUTURE: Switch to SL when SL > DDB (hybrid DDB→SL) not implemented.
 */
export function depreciationScheduleDdb(
  cost: number,
  salvageValue: number,
  usefulLifeYears: number,
  placedInServiceDate: string,
  assetId = '',
  assetDescription = ''
): DepreciationSchedule {
  if (usefulLifeYears <= 0) throw new Error('Useful life must be positive');
  const rate = 2 / usefulLifeYears;
  const placed = new Date(placedInServiceDate);
  const lines: DepreciationScheduleLine[] = [];
  let accDep = 0;
  let bv = cost;
  for (let year = 1; year <= usefulLifeYears; year++) {
    const periodEnd = new Date(placed.getFullYear() + year, placed.getMonth(), placed.getDate());
    const periodEndStr = periodEnd.toISOString().slice(0, 10);
    let exp = bv * rate;
    const remaining = Math.max(0, cost - salvageValue - accDep);
    if (exp > remaining || year === usefulLifeYears) exp = remaining;
    exp = round2(Math.max(0, exp));
    accDep += exp;
    bv = round2(cost - accDep);
    lines.push({
      period: year,
      periodEndDate: periodEndStr,
      beginningBookValue: round2(bv + exp),
      depreciationExpense: exp,
      accumulatedDepreciation: round2(accDep),
      endingBookValue: bv,
    });
  }
  return {
    assetId,
    assetDescription,
    method: 'declining_balance',
    cost,
    salvageValue,
    usefulLifeYears,
    placedInServiceDate,
    lines,
    codificationRef: ASC_360_35,
  };
}

/**
 * Run depreciation for tenant/period: compute for each active FA, persist run + details.
 */
export async function runDepreciation(
  tenantId: string,
  pool: Pool,
  periodLabel: string,
  periodStart: string,
  periodEnd: string
): Promise<{ run: DepreciationRunRow; details: DepreciationRunDetailRow[] }> {
  const assets = await repo.listActiveFixedAssets(pool, tenantId);
  const detailsInput: Omit<repo.DepreciationRunDetailRow, 'id' | 'createdAt'>[] = [];
  let totalDepreciation = 0;

  for (const asset of assets) {
    const entry = buildDepreciationEntriesForAsset(asset, periodStart, periodEnd);
    totalDepreciation += entry.depreciationAmount;
    detailsInput.push({
      runId: '', // set after run created
      fixedAssetId: asset.id,
      periodStart: entry.periodStart,
      periodEnd: entry.periodEnd,
      depreciationAmount: String(entry.depreciationAmount),
      accumulatedDepreciation: String(entry.accumulatedDepreciation),
    });
  }

  const run = await repo.createDepreciationRun(pool, tenantId, periodLabel, totalDepreciation);
  const withRunId = detailsInput.map((d) => ({ ...d, runId: run.id }));
  const details = await repo.createDepreciationRunDetails(pool, withRunId);
  return { run, details };
}

export interface DepreciationSummary {
  periodLabel: string;
  totalDepreciation: number;
  byAsset: { fixedAssetId: string; assetNumber: string; assetType: string; depreciationAmount: number }[];
  byType: Record<string, number>;
}

/**
 * Get depreciation summary for tenant/period (from latest run for that period).
 */
export async function getDepreciationSummary(
  tenantId: string,
  pool: Pool,
  periodLabel: string
): Promise<DepreciationSummary | null> {
  const runs = await repo.listDepreciationRuns(pool, tenantId, periodLabel);
  if (runs.length === 0) return null;
  const run = runs[0]!;
  const detailRows = await repo.listDepreciationRunDetails(pool, tenantId, run.id);
  const assets = await repo.listFixedAssets(pool, tenantId);
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  const byAsset: DepreciationSummary['byAsset'] = [];
  const byType: Record<string, number> = {};
  let totalDepreciation = 0;

  for (const d of detailRows) {
    const asset = assetMap.get(d.fixedAssetId);
    totalDepreciation += Number(d.depreciationAmount);
    byAsset.push({
      fixedAssetId: d.fixedAssetId,
      assetNumber: asset?.assetNumber ?? d.fixedAssetId,
      assetType: asset?.assetType ?? 'Unknown',
      depreciationAmount: Number(d.depreciationAmount),
    });
    const t = asset?.assetType ?? 'Unknown';
    byType[t] = (byType[t] ?? 0) + Number(d.depreciationAmount);
  }

  return {
    periodLabel,
    totalDepreciation,
    byAsset,
    byType,
  };
}

export async function createFixedAsset(
  tenantId: string,
  pool: Pool,
  row: Omit<repo.FixedAssetRow, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>
): Promise<repo.FixedAssetRow> {
  return repo.createFixedAsset(pool, tenantId, row);
}

export async function getFixedAsset(
  tenantId: string,
  pool: Pool,
  id: string
): Promise<repo.FixedAssetRow | null> {
  return repo.getFixedAsset(pool, tenantId, id);
}

export async function listFixedAssets(tenantId: string, pool: Pool): Promise<repo.FixedAssetRow[]> {
  return repo.listFixedAssets(pool, tenantId);
}

export async function updateFixedAsset(
  tenantId: string,
  pool: Pool,
  id: string,
  patch: Partial<Omit<repo.FixedAssetRow, 'id' | 'tenantId' | 'createdAt'>>
): Promise<repo.FixedAssetRow | null> {
  return repo.updateFixedAsset(pool, tenantId, id, patch);
}

export async function deleteFixedAsset(tenantId: string, pool: Pool, id: string): Promise<boolean> {
  return repo.deleteFixedAsset(pool, tenantId, id);
}

export async function listDepreciationRuns(
  tenantId: string,
  pool: Pool,
  periodLabel?: string
): Promise<repo.DepreciationRunRow[]> {
  return repo.listDepreciationRuns(pool, tenantId, periodLabel);
}

export async function listDepreciationRunDetails(
  tenantId: string,
  pool: Pool,
  runId: string
): Promise<repo.DepreciationRunDetailRow[]> {
  return repo.listDepreciationRunDetails(pool, tenantId, runId);
}
