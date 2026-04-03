/**
 * Entity general settings: fiscal year, currency, auto-lock, variance materiality.
 * Per tenant+entity. Falls back to defaults when no row exists.
 */

import type { Pool } from 'pg';

export interface EntitySettings {
  entityId: string;
  entityName: string;
  fiscalYearEndMonth: number;
  fiscalYearEndDay: number;
  baseCurrency: string;
  autoLockDays: number;
  varianceMaterialityDollar: string;
  varianceMaterialityPercent: string;
  mappingConfidenceThreshold: number;
  mappingAutoAcceptEnabled: boolean;
  autoApplyAfterNPeriods: number;
  templateAutoApplyEnabled: boolean;
  /** Functional (reporting) currency — defaults to USD */
  functionalCurrency: string;
  /** When abs(unexplained_variance) < this threshold, auto-waive as immaterial (0 = disabled) */
  reconImmaterialWaiverThreshold: string;
  /** When all gates pass, auto-advance session to next state */
  autoAdvanceEnabled: boolean;
  /** Allow same user to advance and certify (SoD opt-out for small teams) */
  allowSameUserCertify: boolean;
}

interface EntitySettingsRow {
  entity_id: string;
  entity_name: string;
  fiscal_year_end_month: number;
  fiscal_year_end_day: number;
  base_currency: string;
  auto_lock_days: number;
  variance_materiality_dollar: string;
  variance_materiality_percent: string;
  mapping_confidence_threshold: string | number | null;
  mapping_auto_accept_enabled: boolean | null;
  auto_apply_after_n_periods: number | null;
  template_auto_apply_enabled: boolean | null;
  functional_currency: string | null;
  recon_immaterial_waiver_threshold: string | null;
  auto_advance_enabled: boolean | null;
  allow_same_user_certify: boolean | null;
}

function rowToSettings(row: EntitySettingsRow | null, entityId: string): EntitySettings {
  if (!row) {
    return {
      entityId,
      entityName: '',
      fiscalYearEndMonth: 12,
      fiscalYearEndDay: 31,
      baseCurrency: 'USD',
      autoLockDays: 0,
      varianceMaterialityDollar: '10000.00',
      varianceMaterialityPercent: '10.0',
      mappingConfidenceThreshold: 0.95,
      mappingAutoAcceptEnabled: false,
      autoApplyAfterNPeriods: 3,
      templateAutoApplyEnabled: false,
      functionalCurrency: 'USD',
      reconImmaterialWaiverThreshold: '0.00',
      autoAdvanceEnabled: false,
      allowSameUserCertify: false,
    };
  }
  return {
    entityId: row.entity_id,
    entityName: row.entity_name ?? '',
    fiscalYearEndMonth: row.fiscal_year_end_month ?? 12,
    fiscalYearEndDay: row.fiscal_year_end_day ?? 31,
    baseCurrency: row.base_currency ?? 'USD',
    autoLockDays: row.auto_lock_days ?? 0,
    varianceMaterialityDollar: String(row.variance_materiality_dollar ?? '10000.00'),
    varianceMaterialityPercent: String(row.variance_materiality_percent ?? '10.0'),
    mappingConfidenceThreshold: Number(row.mapping_confidence_threshold ?? 0.95),
    mappingAutoAcceptEnabled: row.mapping_auto_accept_enabled ?? false,
    autoApplyAfterNPeriods: row.auto_apply_after_n_periods ?? 3,
    templateAutoApplyEnabled: row.template_auto_apply_enabled ?? false,
    functionalCurrency: row.functional_currency ?? 'USD',
    reconImmaterialWaiverThreshold: String(row.recon_immaterial_waiver_threshold ?? '0.00'),
    autoAdvanceEnabled: row.auto_advance_enabled ?? false,
    allowSameUserCertify: row.allow_same_user_certify ?? false,
  };
}

export async function getEntitySettings(
  pool: Pool,
  tenantId: string,
  entityId: string
): Promise<EntitySettings> {
  const r = await pool.query<EntitySettingsRow>(
    `SELECT entity_id, entity_name, fiscal_year_end_month, fiscal_year_end_day, base_currency, auto_lock_days,
       variance_materiality_dollar, variance_materiality_percent,
       mapping_confidence_threshold, mapping_auto_accept_enabled,
       auto_apply_after_n_periods, template_auto_apply_enabled, functional_currency,
       recon_immaterial_waiver_threshold, auto_advance_enabled, allow_same_user_certify
     FROM tenant_entity_settings WHERE tenant_id = $1 AND entity_id = $2`,
    [tenantId, entityId]
  );
  return rowToSettings(r.rows[0] ?? null, entityId);
}

export interface UpsertEntitySettingsInput {
  entityName?: string;
  fiscalYearEndMonth?: number;
  fiscalYearEndDay?: number;
  baseCurrency?: string;
  autoLockDays?: number;
  varianceMaterialityDollar?: string | number;
  varianceMaterialityPercent?: string | number;
  mappingConfidenceThreshold?: number;
  mappingAutoAcceptEnabled?: boolean;
  autoApplyAfterNPeriods?: number;
  templateAutoApplyEnabled?: boolean;
  functionalCurrency?: string;
  reconImmaterialWaiverThreshold?: string | number;
  autoAdvanceEnabled?: boolean;
  allowSameUserCertify?: boolean;
}

export async function upsertEntitySettings(
  pool: Pool,
  tenantId: string,
  entityId: string,
  input: UpsertEntitySettingsInput
): Promise<EntitySettings> {
  // Read existing values to preserve fields not in the input (PATCH semantics)
  const existing = await pool.query<EntitySettingsRow>(
    `SELECT * FROM tenant_entity_settings WHERE tenant_id = $1 AND entity_id = $2`,
    [tenantId, entityId]
  );
  const cur = existing.rows[0];

  const entityName = input.entityName ?? cur?.entity_name ?? '';
  const fiscalYearEndMonth = input.fiscalYearEndMonth ?? cur?.fiscal_year_end_month ?? 12;
  const fiscalYearEndDay = input.fiscalYearEndDay ?? cur?.fiscal_year_end_day ?? 31;
  const baseCurrency = input.baseCurrency ?? cur?.base_currency ?? 'USD';
  const autoLockDays = input.autoLockDays ?? cur?.auto_lock_days ?? 0;
  const varianceMaterialityDollar = input.varianceMaterialityDollar != null ? String(input.varianceMaterialityDollar) : (cur?.variance_materiality_dollar ?? '10000.00');
  const varianceMaterialityPercent = input.varianceMaterialityPercent != null ? String(input.varianceMaterialityPercent) : (cur?.variance_materiality_percent ?? '10.0');
  const rawThreshold = input.mappingConfidenceThreshold ?? cur?.mapping_confidence_threshold ?? 0.95;
  const mappingConfidenceThreshold = Math.min(1.0, Math.max(0.80, typeof rawThreshold === 'string' ? parseFloat(rawThreshold) : rawThreshold));
  const mappingAutoAcceptEnabled = input.mappingAutoAcceptEnabled ?? cur?.mapping_auto_accept_enabled ?? false;
  const autoApplyAfterNPeriods = input.autoApplyAfterNPeriods ?? cur?.auto_apply_after_n_periods ?? 3;
  const templateAutoApplyEnabled = input.templateAutoApplyEnabled ?? cur?.template_auto_apply_enabled ?? false;
  const functionalCurrency = input.functionalCurrency ?? cur?.functional_currency ?? 'USD';
  const reconImmaterialWaiverThreshold = input.reconImmaterialWaiverThreshold != null ? String(input.reconImmaterialWaiverThreshold) : (cur?.recon_immaterial_waiver_threshold ?? '0.00');
  const autoAdvanceEnabled = input.autoAdvanceEnabled ?? cur?.auto_advance_enabled ?? false;
  const allowSameUserCertify = input.allowSameUserCertify ?? cur?.allow_same_user_certify ?? false;

  await pool.query(
    `INSERT INTO tenant_entity_settings (
       tenant_id, entity_id, entity_name, fiscal_year_end_month, fiscal_year_end_day, base_currency, auto_lock_days,
       variance_materiality_dollar, variance_materiality_percent,
       mapping_confidence_threshold, mapping_auto_accept_enabled,
       auto_apply_after_n_periods, template_auto_apply_enabled, functional_currency,
       recon_immaterial_waiver_threshold, auto_advance_enabled, allow_same_user_certify, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $9::numeric, $10, $11, $12, $13, $14, $15::numeric, $16, $17, NOW())
     ON CONFLICT (tenant_id, entity_id) DO UPDATE SET
       entity_name = EXCLUDED.entity_name, fiscal_year_end_month = EXCLUDED.fiscal_year_end_month,
       fiscal_year_end_day = EXCLUDED.fiscal_year_end_day,
       base_currency = EXCLUDED.base_currency, auto_lock_days = EXCLUDED.auto_lock_days,
       variance_materiality_dollar = EXCLUDED.variance_materiality_dollar,
       variance_materiality_percent = EXCLUDED.variance_materiality_percent,
       mapping_confidence_threshold = EXCLUDED.mapping_confidence_threshold,
       mapping_auto_accept_enabled = EXCLUDED.mapping_auto_accept_enabled,
       auto_apply_after_n_periods = EXCLUDED.auto_apply_after_n_periods,
       template_auto_apply_enabled = EXCLUDED.template_auto_apply_enabled,
       functional_currency = EXCLUDED.functional_currency,
       recon_immaterial_waiver_threshold = EXCLUDED.recon_immaterial_waiver_threshold,
       auto_advance_enabled = EXCLUDED.auto_advance_enabled,
       allow_same_user_certify = EXCLUDED.allow_same_user_certify,
       updated_at = NOW()`,
    [
      tenantId, entityId, entityName, fiscalYearEndMonth, fiscalYearEndDay, baseCurrency, autoLockDays,
      varianceMaterialityDollar, varianceMaterialityPercent,
      mappingConfidenceThreshold, mappingAutoAcceptEnabled,
      autoApplyAfterNPeriods, templateAutoApplyEnabled,
      functionalCurrency, reconImmaterialWaiverThreshold, autoAdvanceEnabled, allowSameUserCertify,
    ]
  );

  const r = await pool.query<EntitySettingsRow>(
    `SELECT entity_id, entity_name, fiscal_year_end_month, fiscal_year_end_day, base_currency, auto_lock_days,
       variance_materiality_dollar, variance_materiality_percent,
       mapping_confidence_threshold, mapping_auto_accept_enabled,
       auto_apply_after_n_periods, template_auto_apply_enabled, functional_currency,
       recon_immaterial_waiver_threshold, auto_advance_enabled, allow_same_user_certify
     FROM tenant_entity_settings WHERE tenant_id = $1 AND entity_id = $2`,
    [tenantId, entityId]
  );
  return rowToSettings(r.rows[0], entityId);
}
