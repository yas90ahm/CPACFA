/**
 * Materiality settings per tenant — one source of truth for variance, sampling, disclosure.
 * In-memory when no pool/tenantId; optional tenant DB later. No LLM.
 */

import type { Pool } from 'pg';
import type { MaterialitySettings } from '../types/close_and_controls.js';

const store = new Map<string, MaterialitySettings>();

function key(tenantId: string, periodLabel?: string): string {
  return periodLabel ? `${tenantId}:${periodLabel}` : tenantId;
}

/**
 * Get materiality settings for a tenant (and optional period). Returns undefined if not set.
 */
export function getMateriality(
  tenantId: string,
  periodLabel?: string,
  _pool?: Pool
): MaterialitySettings | undefined {
  const k = key(tenantId, periodLabel);
  return store.get(k);
}

/**
 * Set materiality settings for a tenant (and optional period). Same pattern as other tenant stores.
 */
export function setMateriality(
  tenantId: string,
  settings: MaterialitySettings,
  periodLabel?: string,
  _pool?: Pool
): MaterialitySettings {
  const k = key(tenantId, periodLabel);
  store.set(k, { ...settings });
  return store.get(k)!;
}

/**
 * Compute numeric threshold for variance/material flag from settings and optional basis value.
 * E.g. overallMaterialityPercent 5 and basis net_income with netIncome 100k → 5000.
 */
export function materialityThresholdFromSettings(
  settings: MaterialitySettings | undefined,
  basisValue?: number
): { percent?: number; amount?: number } {
  if (!settings) return {};
  const percent = settings.overallMaterialityPercent ?? settings.performanceMaterialityPercent;
  let amount = settings.overallMaterialityAmount;
  if (amount == null && percent != null && basisValue != null) {
    amount = (basisValue * percent) / 100;
  }
  return { percent, amount };
}
