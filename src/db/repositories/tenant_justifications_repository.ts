/**
 * Tenant justifications — durable IRAC linked to hitl_staging, close_adjustment, journal_entry, export, ingest.
 */

import type { Pool } from 'pg';
import type { IRACJustification } from '../../types/justification.js';

export type JustificationRelatedType = 'hitl_staging' | 'close_adjustment' | 'journal_entry' | 'export' | 'ingest';
export type CreatedByType = 'user' | 'agent';

export interface CreateJustificationParams {
  tenantId: string;
  periodLabel: string;
  relatedType: JustificationRelatedType;
  relatedId: string;
  createdBy?: string;
  createdByType?: CreatedByType;
  iracJson?: { irac: IRACJustification; sourceTag: string; formatted: string };
  memoMarkdown?: string;
  promptVersion?: string;
  model?: string;
  inputsHash?: string;
}

export interface JustificationRow {
  id: string;
  tenant_id: string;
  period_label: string;
  related_type: string;
  related_id: string;
  created_by: string | null;
  created_by_type: string;
  irac_json: unknown;
  memo_markdown: string | null;
  prompt_version: string | null;
  model: string | null;
  inputs_hash: string | null;
  created_at: string;
}

export async function createJustification(
  pool: Pool,
  params: CreateJustificationParams
): Promise<{ id: string; createdAt: string }> {
  const {
    tenantId,
    periodLabel,
    relatedType,
    relatedId,
    createdBy,
    createdByType = 'user',
    iracJson,
    memoMarkdown,
    promptVersion,
    model,
    inputsHash,
  } = params;
  const r = await pool.query<{ id: string; created_at: string }>(
    `INSERT INTO tenant_justifications (
      tenant_id, period_label, related_type, related_id, created_by, created_by_type,
      irac_json, memo_markdown, prompt_version, model, inputs_hash
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id, created_at`,
    [
      tenantId,
      periodLabel,
      relatedType,
      relatedId,
      createdBy ?? null,
      createdByType,
      iracJson ? JSON.stringify(iracJson) : null,
      memoMarkdown ?? null,
      promptVersion ?? null,
      model ?? null,
      inputsHash ?? null,
    ]
  );
  const row = r.rows[0];
  if (!row) throw new Error('Failed to insert tenant_justifications');
  return { id: row.id, createdAt: row.created_at };
}

export async function listJustificationsByPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<JustificationRow[]> {
  const r = await pool.query<JustificationRow>(
    `SELECT id, tenant_id, period_label, related_type, related_id, created_by, created_by_type,
            irac_json, memo_markdown, prompt_version, model, inputs_hash, created_at
     FROM tenant_justifications
     WHERE tenant_id = $1 AND period_label = $2
     ORDER BY created_at ASC`,
    [tenantId, periodLabel]
  );
  return r.rows;
}

/** List justifications whose period_label falls within a date range (period labels like 2025-01 or FY2025). */
export async function listJustificationsForPeriodRange(
  pool: Pool,
  tenantId: string,
  periodStart: string,
  periodEnd: string
): Promise<JustificationRow[]> {
  const r = await pool.query<JustificationRow>(
    `SELECT id, tenant_id, period_label, related_type, related_id, created_by, created_by_type,
            irac_json, memo_markdown, prompt_version, model, inputs_hash, created_at
     FROM tenant_justifications
     WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at <= $3::timestamptz
     ORDER BY created_at ASC`,
    [tenantId, periodStart, periodEnd]
  );
  return r.rows;
}

export async function getJustificationByRelated(
  pool: Pool,
  tenantId: string,
  relatedType: JustificationRelatedType,
  relatedId: string
): Promise<JustificationRow | null> {
  const r = await pool.query<JustificationRow>(
    `SELECT id, tenant_id, period_label, related_type, related_id, created_by, created_by_type,
            irac_json, memo_markdown, prompt_version, model, inputs_hash, created_at
     FROM tenant_justifications
     WHERE tenant_id = $1 AND related_type = $2 AND related_id = $3
     LIMIT 1`,
    [tenantId, relatedType, relatedId]
  );
  return r.rows[0] ?? null;
}
