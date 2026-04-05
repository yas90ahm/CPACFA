/**
 * Repository for ERP mapping profiles and rules.
 */

import type { Pool } from 'pg';
import type { ErpMappingProfile, ErpMappingRule, MappingDataType } from '../../types/erp_mapping.js';

/* ── Profiles ──────────────────────────────────────────────────── */

export async function getActiveProfile(
  pool: Pool,
  tenantId: string,
  connectionId: string,
  dataType: MappingDataType,
): Promise<ErpMappingProfile | null> {
  const res = await pool.query<ErpMappingProfile>(
    `SELECT id, tenant_id AS "tenantId", connection_id AS "connectionId", provider,
            profile_name AS "profileName", data_type AS "dataType",
            is_template AS "isTemplate", is_active AS "isActive", version,
            created_at AS "createdAt", updated_at AS "updatedAt", created_by AS "createdBy"
     FROM erp_mapping_profiles
     WHERE tenant_id = $1 AND connection_id = $2 AND data_type = $3 AND is_active = TRUE
     ORDER BY version DESC LIMIT 1`,
    [tenantId, connectionId, dataType],
  );
  return res.rows[0] ?? null;
}

export async function getTemplate(
  pool: Pool,
  provider: string,
  dataType: MappingDataType,
): Promise<ErpMappingProfile | null> {
  const res = await pool.query<ErpMappingProfile>(
    `SELECT id, tenant_id AS "tenantId", connection_id AS "connectionId", provider,
            profile_name AS "profileName", data_type AS "dataType",
            is_template AS "isTemplate", is_active AS "isActive", version,
            created_at AS "createdAt", updated_at AS "updatedAt", created_by AS "createdBy"
     FROM erp_mapping_profiles
     WHERE tenant_id = '__system__' AND provider = $1 AND data_type = $2 AND is_template = TRUE
     ORDER BY version DESC LIMIT 1`,
    [provider, dataType],
  );
  return res.rows[0] ?? null;
}

export async function createProfile(
  pool: Pool,
  input: {
    tenantId: string;
    connectionId: string;
    provider: string;
    profileName: string;
    dataType: MappingDataType;
    isTemplate?: boolean;
    createdBy?: string;
  },
): Promise<ErpMappingProfile> {
  const res = await pool.query<ErpMappingProfile>(
    `INSERT INTO erp_mapping_profiles
       (tenant_id, connection_id, provider, profile_name, data_type, is_template, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, tenant_id AS "tenantId", connection_id AS "connectionId", provider,
               profile_name AS "profileName", data_type AS "dataType",
               is_template AS "isTemplate", is_active AS "isActive", version,
               created_at AS "createdAt", updated_at AS "updatedAt", created_by AS "createdBy"`,
    [input.tenantId, input.connectionId, input.provider, input.profileName,
     input.dataType, input.isTemplate ?? false, input.createdBy ?? null],
  );
  return res.rows[0];
}

/* ── Rules ─────────────────────────────────────────────────────── */

export async function getRulesForProfile(
  pool: Pool,
  profileId: string,
): Promise<ErpMappingRule[]> {
  const res = await pool.query<ErpMappingRule>(
    `SELECT id, profile_id AS "profileId", source_field AS "sourceField",
            canonical_field AS "canonicalField", transform_type AS "transformType",
            transform_config AS "transformConfig", default_value AS "defaultValue",
            is_required AS "isRequired", sort_order AS "sortOrder",
            created_at AS "createdAt"
     FROM erp_mapping_rules
     WHERE profile_id = $1
     ORDER BY sort_order`,
    [profileId],
  );
  return res.rows;
}

export async function insertRule(
  pool: Pool,
  input: {
    profileId: string;
    sourceField: string;
    canonicalField: string;
    transformType: string;
    transformConfig?: Record<string, unknown> | null;
    defaultValue?: string | null;
    isRequired?: boolean;
    sortOrder?: number;
  },
): Promise<ErpMappingRule> {
  const res = await pool.query<ErpMappingRule>(
    `INSERT INTO erp_mapping_rules
       (profile_id, source_field, canonical_field, transform_type, transform_config,
        default_value, is_required, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, profile_id AS "profileId", source_field AS "sourceField",
               canonical_field AS "canonicalField", transform_type AS "transformType",
               transform_config AS "transformConfig", default_value AS "defaultValue",
               is_required AS "isRequired", sort_order AS "sortOrder",
               created_at AS "createdAt"`,
    [input.profileId, input.sourceField, input.canonicalField, input.transformType,
     input.transformConfig ? JSON.stringify(input.transformConfig) : null,
     input.defaultValue ?? null, input.isRequired ?? false, input.sortOrder ?? 0],
  );
  return res.rows[0];
}

export async function insertRulesBatch(
  pool: Pool,
  profileId: string,
  rules: Array<{
    sourceField: string;
    canonicalField: string;
    transformType: string;
    transformConfig?: Record<string, unknown> | null;
    defaultValue?: string | null;
    isRequired?: boolean;
    sortOrder?: number;
  }>,
): Promise<void> {
  if (rules.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;
  for (const r of rules) {
    placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
    values.push(
      profileId, r.sourceField, r.canonicalField, r.transformType,
      r.transformConfig ? JSON.stringify(r.transformConfig) : null,
      r.defaultValue ?? null, r.isRequired ?? false, r.sortOrder ?? 0,
    );
  }
  await pool.query(
    `INSERT INTO erp_mapping_rules
       (profile_id, source_field, canonical_field, transform_type, transform_config,
        default_value, is_required, sort_order)
     VALUES ${placeholders.join(', ')}`,
    values,
  );
}

export async function deleteRulesForProfile(pool: Pool, profileId: string): Promise<void> {
  await pool.query('DELETE FROM erp_mapping_rules WHERE profile_id = $1', [profileId]);
}
