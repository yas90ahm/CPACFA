/**
 * Shadow Auditor findings — pre-post check results per JE (deterministic, queryable for binder).
 */

import type { Pool } from 'pg';

export type ShadowAuditSeverity = 'ok' | 'warn' | 'block';

export interface ShadowAuditFindingItem {
  code: string;
  message: string;
  severity?: 'warn' | 'block';
  rule_ids?: string[];
  refs?: string[];
}

export interface ShadowAuditFindingRow {
  id: string;
  tenant_id: string;
  period_label: string;
  journal_entry_id: string;
  run_at: string;
  severity: string;
  findings_json: ShadowAuditFindingItem[];
  actor_user_id: string | null;
  created_at: string;
  confidence?: number | null;
  prompt_version?: string | null;
  model?: string | null;
}

export async function createFinding(
  pool: Pool,
  params: {
    tenantId: string;
    periodLabel: string;
    journalEntryId: string;
    severity: ShadowAuditSeverity;
    findings: ShadowAuditFindingItem[];
    actorUserId?: string;
    confidence?: number;
    promptVersion?: string;
    model?: string;
  }
): Promise<{ id: string; createdAt: string }> {
  const r = await pool.query<{ id: string; created_at: string }>(
    `INSERT INTO tenant_shadow_audit_findings (tenant_id, period_label, journal_entry_id, severity, findings_json, actor_user_id, confidence, prompt_version, model)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, created_at`,
    [
      params.tenantId,
      params.periodLabel,
      params.journalEntryId,
      params.severity,
      JSON.stringify(params.findings),
      params.actorUserId ?? null,
      params.confidence ?? null,
      params.promptVersion ?? null,
      params.model ?? null,
    ]
  );
  const row = r.rows[0];
  if (!row) throw new Error('Failed to insert tenant_shadow_audit_findings');
  return { id: row.id, createdAt: row.created_at };
}

export async function getFindingByJE(
  pool: Pool,
  tenantId: string,
  journalEntryId: string
): Promise<ShadowAuditFindingRow | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    period_label: string;
    journal_entry_id: string;
    run_at: string;
    severity: string;
    findings_json: unknown;
    actor_user_id: string | null;
    created_at: string;
  }>(
    `SELECT id, tenant_id, period_label, journal_entry_id, run_at, severity, findings_json, actor_user_id, created_at
     FROM tenant_shadow_audit_findings
     WHERE tenant_id = $1 AND journal_entry_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, journalEntryId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...row,
    findings_json: Array.isArray(row.findings_json) ? (row.findings_json as ShadowAuditFindingItem[]) : [],
  };
}

export async function listFindingsByPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<ShadowAuditFindingRow[]> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    period_label: string;
    journal_entry_id: string;
    run_at: string;
    severity: string;
    findings_json: unknown;
    actor_user_id: string | null;
    created_at: string;
  }>(
    `SELECT id, tenant_id, period_label, journal_entry_id, run_at, severity, findings_json, actor_user_id, created_at
     FROM tenant_shadow_audit_findings
     WHERE tenant_id = $1 AND period_label = $2
     ORDER BY created_at ASC`,
    [tenantId, periodLabel]
  );
  return r.rows.map((row) => ({
    ...row,
    findings_json: Array.isArray(row.findings_json) ? (row.findings_json as ShadowAuditFindingItem[]) : [],
  }));
}
