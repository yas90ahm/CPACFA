/**
 * Policy memory persistence — standard, country, publiclyAccountable, etc. per tenant/entity/period.
 */

import type { Pool } from 'pg';
import type { PolicyMemoryRecord } from '../../memory/policy_memory.js';

const PERIOD_EMPTY = '';

function periodKey(fiscalYear?: string): string {
  return fiscalYear ?? PERIOD_EMPTY;
}

function rowToRecord(row: {
  entity_id: string;
  period_label: string;
  standard: string | null;
  country: string | null;
  jurisdiction: string | null;
  currency: string | null;
  tax_id: string | null;
  business_number: string | null;
  publicly_accountable: boolean | null;
  overrides: unknown;
  updated_at: string;
}): PolicyMemoryRecord {
  return {
    entityId: row.entity_id,
    fiscalYear: row.period_label === PERIOD_EMPTY ? undefined : row.period_label,
    standard: row.standard as PolicyMemoryRecord['standard'] ?? undefined,
    country: row.country ?? undefined,
    jurisdiction: row.jurisdiction ?? undefined,
    currency: row.currency ?? undefined,
    taxId: row.tax_id ?? undefined,
    businessNumber: row.business_number ?? undefined,
    publiclyAccountable: row.publicly_accountable ?? undefined,
    overrides: (row.overrides as Record<string, string>) ?? {},
    updatedAt: row.updated_at,
  };
}

export async function getPolicyMemoryFromDb(
  pool: Pool,
  tenantId: string,
  entityId: string,
  fiscalYear?: string
): Promise<PolicyMemoryRecord | null> {
  const pl = periodKey(fiscalYear);
  const r = await pool.query<{
    entity_id: string;
    period_label: string;
    standard: string | null;
    country: string | null;
    jurisdiction: string | null;
    currency: string | null;
    tax_id: string | null;
    business_number: string | null;
    publicly_accountable: boolean | null;
    overrides: unknown;
    updated_at: string;
  }>(
    `SELECT entity_id, period_label, standard, country, jurisdiction, currency, tax_id, business_number, publicly_accountable, overrides, updated_at
     FROM tenant_policy_memory WHERE tenant_id = $1 AND entity_id = $2 AND period_label = $3`,
    [tenantId, entityId, pl]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToRecord(row);
}

export async function setPolicyMemoryInDb(
  pool: Pool,
  tenantId: string,
  record: PolicyMemoryRecord
): Promise<void> {
  const now = new Date().toISOString();
  const pl = periodKey(record.fiscalYear);
  await pool.query(
    `INSERT INTO tenant_policy_memory (tenant_id, entity_id, period_label, standard, country, jurisdiction, currency, tax_id, business_number, publicly_accountable, overrides, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (tenant_id, entity_id, period_label) DO UPDATE SET
       standard = EXCLUDED.standard,
       country = EXCLUDED.country,
       jurisdiction = EXCLUDED.jurisdiction,
       currency = EXCLUDED.currency,
       tax_id = EXCLUDED.tax_id,
       business_number = EXCLUDED.business_number,
       publicly_accountable = EXCLUDED.publicly_accountable,
       overrides = EXCLUDED.overrides,
       updated_at = EXCLUDED.updated_at`,
    [
      tenantId,
      record.entityId,
      pl,
      record.standard ?? null,
      record.country ?? null,
      record.jurisdiction ?? null,
      record.currency ?? null,
      record.taxId ?? null,
      record.businessNumber ?? null,
      record.publiclyAccountable ?? null,
      JSON.stringify(record.overrides ?? {}),
      record.updatedAt ?? now,
    ]
  );
}

export async function updatePolicyMemoryInDb(
  pool: Pool,
  tenantId: string,
  entityId: string,
  patch: Partial<PolicyMemoryRecord>,
  fiscalYear?: string
): Promise<void> {
  const existing = await getPolicyMemoryFromDb(pool, tenantId, entityId, fiscalYear);
  const merged: PolicyMemoryRecord = {
    ...existing,
    ...patch,
    entityId,
    fiscalYear,
    standard: patch.standard ?? existing?.standard,
    country: patch.country ?? existing?.country,
    jurisdiction: patch.jurisdiction ?? existing?.jurisdiction,
    currency: patch.currency ?? existing?.currency,
    taxId: patch.taxId ?? existing?.taxId,
    businessNumber: patch.businessNumber ?? existing?.businessNumber,
    publiclyAccountable: patch.publiclyAccountable ?? existing?.publiclyAccountable,
    overrides: { ...(existing?.overrides ?? {}), ...(patch.overrides ?? {}) },
    updatedAt: new Date().toISOString(),
  };
  await setPolicyMemoryInDb(pool, tenantId, merged);
}
