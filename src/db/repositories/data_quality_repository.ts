/**
 * Data quality rules and exceptions — tenant-scoped.
 */

import type { Pool } from 'pg';
import type { DataQualityRule, DataQualityException } from '../../types/data_quality.js';

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createRule(
  pool: Pool,
  tenantId: string,
  rule: Omit<DataQualityRule, 'id' | 'createdAt' | 'updatedAt'>
): Promise<DataQualityRule> {
  const id = nextId('dqr');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO data_quality_rules (id, tenant_id, name, scope, type, config, severity, enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      tenantId,
      rule.name,
      rule.scope,
      rule.type,
      JSON.stringify(rule.config ?? {}),
      rule.severity,
      rule.enabled !== false,
      now,
      now,
    ]
  );
  return { ...rule, id, createdAt: now, updatedAt: now };
}

export async function getRule(pool: Pool, id: string, tenantId: string): Promise<DataQualityRule | null> {
  const r = await pool.query<{
    id: string;
    name: string;
    scope: string;
    type: string;
    config: unknown;
    severity: string;
    enabled: boolean;
    created_at: string;
    updated_at: string;
  }>('SELECT id, name, scope, type, config, severity, enabled, created_at, updated_at FROM data_quality_rules WHERE id = $1 AND tenant_id = $2', [
    id,
    tenantId,
  ]);
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    scope: row.scope as DataQualityRule['scope'],
    type: row.type as DataQualityRule['type'],
    config: (row.config as DataQualityRule['config']) ?? {},
    severity: row.severity as DataQualityRule['severity'],
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRules(pool: Pool, tenantId: string): Promise<DataQualityRule[]> {
  const r = await pool.query<{
    id: string;
    name: string;
    scope: string;
    type: string;
    config: unknown;
    severity: string;
    enabled: boolean;
    created_at: string;
    updated_at: string;
  }>('SELECT id, name, scope, type, config, severity, enabled, created_at, updated_at FROM data_quality_rules WHERE tenant_id = $1 ORDER BY created_at', [
    tenantId,
  ]);
  return r.rows.map((row) => ({
    id: row.id,
    name: row.name,
    scope: row.scope as DataQualityRule['scope'],
    type: row.type as DataQualityRule['type'],
    config: (row.config as DataQualityRule['config']) ?? {},
    severity: row.severity as DataQualityRule['severity'],
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createException(
  pool: Pool,
  tenantId: string,
  ex: Omit<DataQualityException, 'id' | 'createdAt' | 'updatedAt'>
): Promise<DataQualityException> {
  const id = nextId('dqe');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO data_quality_exceptions (id, tenant_id, rule_id, period_label, source_id, status, message, metric, severity, acknowledged_at, acknowledged_by, resolved_at, resolved_by, note, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      tenantId,
      ex.ruleId,
      ex.periodLabel ?? null,
      ex.sourceId ?? null,
      ex.status ?? 'open',
      ex.message,
      ex.metric ?? null,
      ex.severity,
      ex.acknowledgedAt ?? null,
      ex.acknowledgedBy ?? null,
      ex.resolvedAt ?? null,
      ex.resolvedBy ?? null,
      ex.note ?? null,
      now,
      now,
    ]
  );
  return { ...ex, id, tenantId, createdAt: now, updatedAt: now };
}

export async function getException(
  pool: Pool,
  id: string,
  tenantId: string
): Promise<DataQualityException | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    rule_id: string;
    period_label: string | null;
    source_id: string | null;
    status: string;
    message: string;
    metric: number | null;
    severity: string;
    acknowledged_at: string | null;
    acknowledged_by: string | null;
    resolved_at: string | null;
    resolved_by: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
  }>(
    'SELECT id, tenant_id, rule_id, period_label, source_id, status, message, metric, severity, acknowledged_at, acknowledged_by, resolved_at, resolved_by, note, created_at, updated_at FROM data_quality_exceptions WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ruleId: row.rule_id,
    periodLabel: row.period_label ?? undefined,
    sourceId: row.source_id ?? undefined,
    status: row.status as DataQualityException['status'],
    message: row.message,
    metric: row.metric ?? undefined,
    severity: row.severity as DataQualityException['severity'],
    acknowledgedAt: row.acknowledged_at ?? undefined,
    acknowledgedBy: row.acknowledged_by ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listExceptions(
  pool: Pool,
  tenantId: string,
  params?: { periodLabel?: string; ruleId?: string; severity?: string; status?: string; limit?: number }
): Promise<DataQualityException[]> {
  let sql =
    'SELECT id, tenant_id, rule_id, period_label, source_id, status, message, metric, severity, acknowledged_at, acknowledged_by, resolved_at, resolved_by, note, created_at, updated_at FROM data_quality_exceptions WHERE tenant_id = $1';
  const args: unknown[] = [tenantId];
  let i = 2;
  if (params?.periodLabel) {
    sql += ` AND period_label = $${i}`;
    args.push(params.periodLabel);
    i += 1;
  }
  if (params?.ruleId) {
    sql += ` AND rule_id = $${i}`;
    args.push(params.ruleId);
    i += 1;
  }
  if (params?.severity) {
    sql += ` AND severity = $${i}`;
    args.push(params.severity);
    i += 1;
  }
  if (params?.status) {
    sql += ` AND status = $${i}`;
    args.push(params.status);
    i += 1;
  }
  sql += ' ORDER BY created_at DESC';
  if (params?.limit != null) {
    sql += ` LIMIT $${i}`;
    args.push(params.limit);
  }
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    rule_id: string;
    period_label: string | null;
    source_id: string | null;
    status: string;
    message: string;
    metric: number | null;
    severity: string;
    acknowledged_at: string | null;
    acknowledged_by: string | null;
    resolved_at: string | null;
    resolved_by: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
  }>(sql, args);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    ruleId: row.rule_id,
    periodLabel: row.period_label ?? undefined,
    sourceId: row.source_id ?? undefined,
    status: row.status as DataQualityException['status'],
    message: row.message,
    metric: row.metric ?? undefined,
    severity: row.severity as DataQualityException['severity'],
    acknowledgedAt: row.acknowledged_at ?? undefined,
    acknowledgedBy: row.acknowledged_by ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateException(
  pool: Pool,
  id: string,
  tenantId: string,
  update: {
    status?: DataQualityException['status'];
    note?: string;
    acknowledgedBy?: string;
    resolvedBy?: string;
  }
): Promise<DataQualityException | null> {
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = $2'];
  const args: unknown[] = [id, tenantId];
  let i = 3;
  if (update.status !== undefined) {
    updates.push(`status = $${i}`);
    args.push(update.status);
    i += 1;
    if (update.status === 'acknowledged') {
      updates.push(`acknowledged_at = $${i}`, `acknowledged_by = $${i + 1}`);
      args.push(now, update.acknowledgedBy ?? null);
      i += 2;
    } else if (update.status === 'resolved') {
      updates.push(`resolved_at = $${i}`, `resolved_by = $${i + 1}`);
      args.push(now, update.resolvedBy ?? null);
      i += 2;
    }
  }
  if (update.note !== undefined) {
    updates.push(`note = $${i}`);
    args.push(update.note);
    i += 1;
  }
  await pool.query(
    `UPDATE data_quality_exceptions SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2`,
    args
  );
  return getException(pool, id, tenantId);
}

export async function getExceptionSummary(
  pool: Pool,
  tenantId: string,
  params?: { periodLabel?: string }
): Promise<{ bySeverity: Record<string, number>; byRule: Record<string, number>; total: number }> {
  let sql =
    'SELECT severity, rule_id, COUNT(*) AS cnt FROM data_quality_exceptions WHERE tenant_id = $1 AND status IN (\'open\', \'acknowledged\')';
  const args: unknown[] = [tenantId];
  if (params?.periodLabel) {
    sql += ' AND period_label = $2';
    args.push(params.periodLabel);
  }
  sql += ' GROUP BY severity, rule_id';
  const r = await pool.query<{ severity: string; rule_id: string; cnt: string }>(sql, args);
  const bySeverity: Record<string, number> = {};
  const byRule: Record<string, number> = {};
  let total = 0;
  for (const row of r.rows) {
    const n = parseInt(row.cnt, 10) || 0;
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + n;
    byRule[row.rule_id] = (byRule[row.rule_id] ?? 0) + n;
    total += n;
  }
  return { bySeverity, byRule, total };
}
