/**
 * Tenant financial config — materiality and other overrides per tenant.
 */

import type { Pool } from 'pg';

export interface MaterialityConfig {
  absoluteThreshold?: number;
  relativeThreshold?: number;
  roundingToleranceCents?: number;
  defaultThreshold?: number;
}

export async function getTenantMateriality(
  pool: Pool,
  tenantId: string
): Promise<MaterialityConfig | null> {
  const r = await pool.query<{ config_value: unknown }>(
    'SELECT config_value FROM tenant_financial_config WHERE tenant_id = $1 AND config_key = $2',
    [tenantId, 'materiality']
  );
  const row = r.rows[0];
  if (!row?.config_value || typeof row.config_value !== 'object') return null;
  const v = row.config_value as Record<string, unknown>;
  return {
    absoluteThreshold: typeof v.absoluteThreshold === 'number' ? v.absoluteThreshold : undefined,
    relativeThreshold: typeof v.relativeThreshold === 'number' ? v.relativeThreshold : undefined,
    roundingToleranceCents:
      typeof v.roundingToleranceCents === 'number' ? v.roundingToleranceCents : undefined,
    defaultThreshold: typeof v.defaultThreshold === 'number' ? v.defaultThreshold : undefined,
  };
}

export async function upsertTenantMateriality(
  pool: Pool,
  tenantId: string,
  config: MaterialityConfig
): Promise<void> {
  const value = {
    absoluteThreshold: config.absoluteThreshold ?? null,
    relativeThreshold: config.relativeThreshold ?? null,
    roundingToleranceCents: config.roundingToleranceCents ?? null,
    defaultThreshold: config.defaultThreshold ?? null,
  };
  await pool.query(
    `INSERT INTO tenant_financial_config (tenant_id, config_key, config_value, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (tenant_id, config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW()`,
    [tenantId, 'materiality', JSON.stringify(value)]
  );
}
