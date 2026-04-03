/**
 * Materiality settings per tenant — durable in tenant_entity_settings DB.
 * Falls back to in-memory when no pool (dev/test only). No LLM.
 */

import type { Pool } from 'pg';
import type { MaterialitySettings } from '../types/close_and_controls.js';

/** In-memory fallback for dev/test when no DB pool is available */
const memoryStore = new Map<string, MaterialitySettings>();

function key(tenantId: string, periodLabel?: string): string {
  return periodLabel ? `${tenantId}:${periodLabel}` : tenantId;
}

/**
 * Get materiality settings for a tenant. Reads from DB (tenant_entity_settings) when pool available.
 */
export async function getMateriality(
  tenantId: string,
  periodLabel?: string,
  pool?: Pool
): Promise<MaterialitySettings | undefined> {
  if (pool) {
    try {
      const r = await pool.query<{
        variance_materiality_dollar: string | null;
        variance_materiality_percent: string | null;
      }>(
        `SELECT variance_materiality_dollar, variance_materiality_percent
         FROM tenant_entity_settings WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
      );
      if (r.rows[0]) {
        const row = r.rows[0];
        return {
          overallMaterialityAmount: row.variance_materiality_dollar ? parseFloat(row.variance_materiality_dollar) : undefined,
          overallMaterialityPercent: row.variance_materiality_percent ? parseFloat(row.variance_materiality_percent) * 100 : undefined,
        };
      }
    } catch { /* fall through to memory */ }
  }
  return memoryStore.get(key(tenantId, periodLabel));
}

/**
 * Set materiality settings for a tenant. Writes to DB when pool available.
 */
export async function setMateriality(
  tenantId: string,
  settings: MaterialitySettings,
  periodLabel?: string,
  pool?: Pool
): Promise<MaterialitySettings> {
  if (pool) {
    try {
      const dollar = settings.overallMaterialityAmount != null ? String(settings.overallMaterialityAmount) : null;
      const percent = settings.overallMaterialityPercent != null ? String(settings.overallMaterialityPercent / 100) : null;
      await pool.query(
        `UPDATE tenant_entity_settings
         SET variance_materiality_dollar = COALESCE($1::numeric, variance_materiality_dollar),
             variance_materiality_percent = COALESCE($2::numeric, variance_materiality_percent)
         WHERE tenant_id = $3`,
        [dollar, percent, tenantId]
      );
    } catch { /* fall through to memory */ }
  }
  const k = key(tenantId, periodLabel);
  memoryStore.set(k, { ...settings });
  return settings;
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
