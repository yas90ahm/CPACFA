/**
 * COA Mapping Rules — DB repository (tenant-scoped pool).
 */

import type { Pool } from 'pg';
import type { CoaMappingRule, CashFlowClass } from '../../types/coa_mapping.js';

interface CoaRuleRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  effective_from: string;
  effective_to: string | null;
  version: number;
  source_account_name_pattern: string;
  source_account_number_pattern: string | null;
  mapped_fs_line_id: string;
  confidence_default: string;
  cash_flow_class: string | null;
  pe_line_id: string | null;
  created_at: string;
}

function rowToRule(row: CoaRuleRow): CoaMappingRule {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined,
    version: row.version,
    sourceAccountNamePattern: row.source_account_name_pattern,
    sourceAccountNumberPattern: row.source_account_number_pattern ?? undefined,
    mappedFsLineId: row.mapped_fs_line_id,
    confidenceDefault: Number(row.confidence_default),
    cashFlowClass: (row.cash_flow_class as CashFlowClass) ?? undefined,
    peLineId: row.pe_line_id ?? undefined,
    createdAt: row.created_at,
  };
}

const SELECT_COLS = `id, tenant_id, entity_id, effective_from, effective_to, version,
    source_account_name_pattern, source_account_number_pattern, mapped_fs_line_id,
    confidence_default, cash_flow_class, pe_line_id, created_at`;

export async function getNextRuleVersion(pool: Pool, tenantId: string, entityId: string): Promise<number> {
  const r = await pool.query<{ max: string | null }>(
    'SELECT MAX(version) AS max FROM coa_mapping_rules WHERE tenant_id = $1 AND entity_id = $2',
    [tenantId, entityId]
  );
  const max = r.rows[0]?.max;
  return max != null ? Number(max) + 1 : 1;
}

export async function listCoaMappingRules(
  pool: Pool,
  tenantId: string,
  entityId: string,
  opts?: { asOfDate?: string; version?: number }
): Promise<CoaMappingRule[]> {
  let sql = `SELECT ${SELECT_COLS}
    FROM coa_mapping_rules WHERE tenant_id = $1 AND entity_id = $2`;
  const params: unknown[] = [tenantId, entityId];
  if (opts?.asOfDate) {
    sql += ` AND effective_from <= $3 AND (effective_to IS NULL OR effective_to >= $3)`;
    params.push(opts.asOfDate);
  }
  if (opts?.version != null) {
    sql += ` AND version = $${params.length + 1}`;
    params.push(opts.version);
  }
  sql += ' ORDER BY version DESC, created_at';
  const r = await pool.query<CoaRuleRow>(sql, params);
  return r.rows.map(rowToRule);
}

export async function insertCoaMappingRule(
  pool: Pool,
  id: string,
  tenantId: string,
  entityId: string,
  version: number,
  input: {
    effectiveFrom: string;
    effectiveTo?: string | null;
    sourceAccountNamePattern: string;
    sourceAccountNumberPattern?: string | null;
    mappedFsLineId: string;
    confidenceDefault: number;
    cashFlowClass?: string | null;
    peLineId?: string | null;
  }
): Promise<CoaMappingRule> {
  await pool.query(
    `INSERT INTO coa_mapping_rules (
      id, tenant_id, entity_id, effective_from, effective_to, version,
      source_account_name_pattern, source_account_number_pattern, mapped_fs_line_id,
      confidence_default, cash_flow_class, pe_line_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      tenantId,
      entityId,
      input.effectiveFrom,
      input.effectiveTo ?? null,
      version,
      input.sourceAccountNamePattern,
      input.sourceAccountNumberPattern ?? null,
      input.mappedFsLineId,
      input.confidenceDefault,
      input.cashFlowClass ?? null,
      input.peLineId ?? null,
    ]
  );
  const r = await pool.query<CoaRuleRow>(
    `SELECT ${SELECT_COLS} FROM coa_mapping_rules WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return rowToRule(r.rows[0]);
}
