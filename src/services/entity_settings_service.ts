/**
 * Entity general settings: fiscal year, currency, auto-lock, variance materiality.
 * Per tenant+entity. Falls back to defaults when no row exists.
 */

import type { Pool } from 'pg';

export interface EntitySettings {
  entityId: string;
  entityName: string;
  fiscalYearEndMonth: number;
  baseCurrency: string;
  autoLockDays: number;
  varianceMaterialityDollar: string;
  varianceMaterialityPercent: string;
}

interface EntitySettingsRow {
  entity_id: string;
  entity_name: string;
  fiscal_year_end_month: number;
  base_currency: string;
  auto_lock_days: number;
  variance_materiality_dollar: string;
  variance_materiality_percent: string;
}

function rowToSettings(row: EntitySettingsRow | null, entityId: string): EntitySettings {
  if (!row) {
    return {
      entityId,
      entityName: '',
      fiscalYearEndMonth: 12,
      baseCurrency: 'USD',
      autoLockDays: 0,
      varianceMaterialityDollar: '10000.00',
      varianceMaterialityPercent: '10.0',
    };
  }
  return {
    entityId: row.entity_id,
    entityName: row.entity_name ?? '',
    fiscalYearEndMonth: row.fiscal_year_end_month ?? 12,
    baseCurrency: row.base_currency ?? 'USD',
    autoLockDays: row.auto_lock_days ?? 0,
    varianceMaterialityDollar: String(row.variance_materiality_dollar ?? '10000.00'),
    varianceMaterialityPercent: String(row.variance_materiality_percent ?? '10.0'),
  };
}

export async function getEntitySettings(
  pool: Pool,
  tenantId: string,
  entityId: string
): Promise<EntitySettings> {
  const r = await pool.query<EntitySettingsRow>(
    'SELECT entity_id, entity_name, fiscal_year_end_month, base_currency, auto_lock_days, variance_materiality_dollar, variance_materiality_percent FROM tenant_entity_settings WHERE tenant_id = $1 AND entity_id = $2',
    [tenantId, entityId]
  );
  return rowToSettings(r.rows[0] ?? null, entityId);
}

export interface UpsertEntitySettingsInput {
  entityName?: string;
  fiscalYearEndMonth?: number;
  baseCurrency?: string;
  autoLockDays?: number;
  varianceMaterialityDollar?: string | number;
  varianceMaterialityPercent?: string | number;
}

export async function upsertEntitySettings(
  pool: Pool,
  tenantId: string,
  entityId: string,
  input: UpsertEntitySettingsInput
): Promise<EntitySettings> {
  const entityName = input.entityName ?? '';
  const fiscalYearEndMonth = input.fiscalYearEndMonth ?? 12;
  const baseCurrency = input.baseCurrency ?? 'USD';
  const autoLockDays = input.autoLockDays ?? 0;
  const varianceMaterialityDollar = input.varianceMaterialityDollar != null ? String(input.varianceMaterialityDollar) : '10000.00';
  const varianceMaterialityPercent = input.varianceMaterialityPercent != null ? String(input.varianceMaterialityPercent) : '10.0';

  await pool.query(
    `INSERT INTO tenant_entity_settings (tenant_id, entity_id, entity_name, fiscal_year_end_month, base_currency, auto_lock_days, variance_materiality_dollar, variance_materiality_percent, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric, NOW())
     ON CONFLICT (tenant_id, entity_id) DO UPDATE SET entity_name = EXCLUDED.entity_name, fiscal_year_end_month = EXCLUDED.fiscal_year_end_month, base_currency = EXCLUDED.base_currency, auto_lock_days = EXCLUDED.auto_lock_days, variance_materiality_dollar = EXCLUDED.variance_materiality_dollar, variance_materiality_percent = EXCLUDED.variance_materiality_percent, updated_at = NOW()`,
    [tenantId, entityId, entityName, fiscalYearEndMonth, baseCurrency, autoLockDays, varianceMaterialityDollar, varianceMaterialityPercent]
  );

  const r = await pool.query<EntitySettingsRow>(
    'SELECT entity_id, entity_name, fiscal_year_end_month, base_currency, auto_lock_days, variance_materiality_dollar, variance_materiality_percent FROM tenant_entity_settings WHERE tenant_id = $1 AND entity_id = $2',
    [tenantId, entityId]
  );
  return rowToSettings(r.rows[0], entityId);
}
