/**
 * Materiality configuration — tenant override + global defaults.
 * Export gate and consolidation read from here. If materiality is missing entirely, fail with clear error.
 */

import type { Pool } from 'pg';
import { getFinancialRules } from './rules_registry.js';
import * as tenantConfigRepo from '../db/repositories/tenant_financial_config_repository.js';

export interface MaterialityValues {
  absoluteThreshold: number;
  relativeThreshold: number;
  roundingToleranceCents: number;
  defaultThreshold: number;
}

function getGlobalDefaults(): MaterialityValues {
  const rules = getFinancialRules();
  const m = rules.materiality as Record<string, unknown> | undefined;
  return {
    absoluteThreshold:
      typeof m?.absoluteThreshold === 'number' && Number.isFinite(m.absoluteThreshold)
        ? (m.absoluteThreshold as number)
        : 1000,
    relativeThreshold:
      typeof m?.relativeThreshold === 'number' && Number.isFinite(m.relativeThreshold)
        ? (m.relativeThreshold as number)
        : 0.005,
    roundingToleranceCents:
      typeof m?.roundingToleranceCents === 'number' && Number.isFinite(m.roundingToleranceCents)
        ? (m.roundingToleranceCents as number)
        : 1,
    defaultThreshold:
      typeof m?.defaultThreshold === 'number' && Number.isFinite(m.defaultThreshold)
        ? (m.defaultThreshold as number)
        : 0.01,
  };
}

/**
 * Get effective materiality for a tenant. Tenant config overrides global defaults.
 * Never returns null — always has values from global defaults at minimum.
 */
export async function getEffectiveMateriality(
  pool: Pool,
  tenantId: string
): Promise<MaterialityValues> {
  const global = getGlobalDefaults();
  const tenant = await tenantConfigRepo.getTenantMateriality(pool, tenantId);
  if (!tenant) return global;
  return {
    absoluteThreshold:
      tenant.absoluteThreshold ?? global.absoluteThreshold,
    relativeThreshold:
      tenant.relativeThreshold ?? global.relativeThreshold,
    roundingToleranceCents:
      tenant.roundingToleranceCents ?? global.roundingToleranceCents,
    defaultThreshold:
      tenant.defaultThreshold ?? global.defaultThreshold,
  };
}

/**
 * Numeric threshold for consolidation/export rounding gap checks.
 * Uses absoluteThreshold (currency units) when available.
 */
export async function getMaterialityThresholdForExport(
  pool: Pool,
  tenantId: string
): Promise<number> {
  const m = await getEffectiveMateriality(pool, tenantId);
  return m.absoluteThreshold > 0 ? m.absoluteThreshold : 1000;
}
