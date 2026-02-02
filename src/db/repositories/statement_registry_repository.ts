/**
 * Latest statement generation per tenant — for audit binder, catalog, reconciliation summary.
 */

import type { Pool } from 'pg';
import type { FinancialStatementsOutput } from '../../types/financial.js';

export interface StatementGenerationRow {
  tenant_id: string;
  source_document_id: string;
  source_document_name: string;
  reasoning_chain_id: string;
  reasoning_chain_timestamp: string;
  registered_at: string;
  statements: FinancialStatementsOutput;
}

export interface StatementGenerationPayload {
  statements: FinancialStatementsOutput;
  sourceDocumentId: string;
  sourceDocumentName: string;
  reasoningChainId: string;
  reasoningChainTimestamp: string;
  registeredAt: string;
}

export async function upsertLatest(
  pool: Pool,
  tenantId: string,
  payload: StatementGenerationPayload
): Promise<void> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO statement_generations (tenant_id, source_document_id, source_document_name, reasoning_chain_id, reasoning_chain_timestamp, registered_at, statements)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tenant_id) DO UPDATE SET
       source_document_id = EXCLUDED.source_document_id,
       source_document_name = EXCLUDED.source_document_name,
       reasoning_chain_id = EXCLUDED.reasoning_chain_id,
       reasoning_chain_timestamp = EXCLUDED.reasoning_chain_timestamp,
       registered_at = EXCLUDED.registered_at,
       statements = EXCLUDED.statements`,
    [
      tenantId,
      payload.sourceDocumentId,
      payload.sourceDocumentName,
      payload.reasoningChainId,
      payload.reasoningChainTimestamp,
      payload.registeredAt ?? now,
      JSON.stringify(payload.statements),
    ]
  );
}

export async function getLatest(
  pool: Pool,
  tenantId: string
): Promise<StatementGenerationRow | null> {
  const r = await pool.query<{
    tenant_id: string;
    source_document_id: string;
    source_document_name: string;
    reasoning_chain_id: string;
    reasoning_chain_timestamp: string;
    registered_at: string;
    statements: unknown;
  }>(
    'SELECT tenant_id, source_document_id, source_document_name, reasoning_chain_id, reasoning_chain_timestamp, registered_at, statements FROM statement_generations WHERE tenant_id = $1',
    [tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    tenant_id: row.tenant_id,
    source_document_id: row.source_document_id,
    source_document_name: row.source_document_name,
    reasoning_chain_id: row.reasoning_chain_id,
    reasoning_chain_timestamp: row.reasoning_chain_timestamp,
    registered_at: row.registered_at,
    statements: row.statements as FinancialStatementsOutput,
  };
}
