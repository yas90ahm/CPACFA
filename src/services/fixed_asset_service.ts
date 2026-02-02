/**
 * Fixed asset service — CRUD, depreciation run (straight-line, declining balance), summary.
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/fixed_asset_repository.js';
import type { FixedAssetRow, DepreciationMethod, DepreciationRunRow, DepreciationRunDetailRow } from '../db/repositories/fixed_asset_repository.js';
import { minus as decMinus, round2 } from '../utils/decimal.js';

export type { FixedAssetRow, DepreciationRunRow, DepreciationRunDetailRow, DepreciationMethod };

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
  const cost = asset.cost;
  const residual = asset.residualValue ?? 0;
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

  const maxAccumulated = Math.max(0, cost - residual);
  const remainingToDepreciate = Math.max(0, maxAccumulated - accumulatedBeforePeriod);

  if (asset.method === 'straight_line') {
    const depreciable = Math.max(0, cost - residual);
    const annualDep = lifeYears > 0 ? depreciable / lifeYears : 0;
    const periodDep = annualDep * fraction;
    if (periodDep >= remainingToDepreciate) {
      return round2(remainingToDepreciate);
    }
    return round2(periodDep);
  }

  if (asset.method === 'declining_balance') {
    const bookValue = Math.max(0, cost - accumulatedBeforePeriod);
    if (bookValue <= 0) return 0;
    const rate = 2 / lifeYears; // double-declining
    const annualDep = bookValue * rate;
    const periodDep = annualDep * fraction;
    if (periodDep >= remainingToDepreciate) {
      return round2(remainingToDepreciate);
    }
    return round2(periodDep);
  }

  // units_of_production: stub, no usage input
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
  const maxAccumulated = Math.max(0, asset.cost - (asset.residualValue ?? 0));
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
  const cost = asset.cost;
  const residual = asset.residualValue ?? 0;
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
      depreciationAmount: entry.depreciationAmount,
      accumulatedDepreciation: entry.accumulatedDepreciation,
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
  const detailRows = await repo.listDepreciationRunDetails(pool, run.id);
  const assets = await repo.listFixedAssets(pool, tenantId);
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  const byAsset: DepreciationSummary['byAsset'] = [];
  const byType: Record<string, number> = {};
  let totalDepreciation = 0;

  for (const d of detailRows) {
    const asset = assetMap.get(d.fixedAssetId);
    totalDepreciation += d.depreciationAmount;
    byAsset.push({
      fixedAssetId: d.fixedAssetId,
      assetNumber: asset?.assetNumber ?? d.fixedAssetId,
      assetType: asset?.assetType ?? 'Unknown',
      depreciationAmount: d.depreciationAmount,
    });
    const t = asset?.assetType ?? 'Unknown';
    byType[t] = (byType[t] ?? 0) + d.depreciationAmount;
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
  pool: Pool,
  runId: string
): Promise<repo.DepreciationRunDetailRow[]> {
  return repo.listDepreciationRunDetails(pool, runId);
}
