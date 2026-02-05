/**
 * AI call log repository: persist every LLM request/response for audit.
 */

import type { Pool } from 'pg';

export interface InsertCallLogParams {
  tenantId: string;
  pillar: string;
  promptVersion: string;
  model: string;
  requestJson: Record<string, unknown>;
  responseRaw: string | null;
  responseJson: Record<string, unknown> | null;
  ok: boolean;
  error: string | null;
}

export async function insertCallLog(
  pool: Pool,
  params: InsertCallLogParams
): Promise<{ id: string }> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO ai_call_log (
      tenant_id, pillar, prompt_version, model, request_json,
      response_raw, response_json, ok, error
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id`,
    [
      params.tenantId,
      params.pillar,
      params.promptVersion,
      params.model,
      JSON.stringify(params.requestJson),
      params.responseRaw ?? null,
      params.responseJson ? JSON.stringify(params.responseJson) : null,
      params.ok,
      params.error ?? null,
    ]
  );
  const row = r.rows[0];
  if (!row) throw new Error('Failed to insert ai_call_log');
  return { id: row.id };
}
