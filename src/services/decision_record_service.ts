/**
 * Decision records service: append-only creation for explainability.
 * No update/delete — immutability for auditors.
 */

import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { CreateDecisionRecordInput, DecisionRecord } from '../types/decision_record.js';
import * as repo from '../db/repositories/decision_record_repository.js';

/** Hash input for idempotency / dedup (optional). Deterministic. */
export function hashInputSnapshot(input: Record<string, unknown>): string {
  const canonical = JSON.stringify(input, Object.keys(input).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Create a decision record (append-only). Call after classification, COA mapping, JE suggestion, etc.
 */
export async function createDecisionRecord(
  pool: Pool,
  input: CreateDecisionRecordInput
): Promise<DecisionRecord> {
  const id = randomUUID();
  const inputSnapshot = input.inputSnapshot ?? null;
  const inputHash = input.inputHash ?? (inputSnapshot != null ? hashInputSnapshot(inputSnapshot as Record<string, unknown>) : null);
  return repo.insertDecisionRecord(pool, id, {
    closeSessionId: input.closeSessionId ?? null,
    tenantId: input.tenantId,
    decisionType: input.decisionType,
    subjectRef: input.subjectRef ?? {},
    inputHash: inputHash ?? null,
    inputSnapshot: inputSnapshot ?? null,
    outputSnapshot: input.outputSnapshot ?? null,
    confidenceScore: input.confidenceScore ?? null,
    rationaleText: input.rationaleText ?? null,
    engineVersion: input.engineVersion ?? null,
    promptSnapshot: input.promptSnapshot ?? null,
  });
}

/** Get one record by id. */
export async function getDecisionRecord(pool: Pool, tenantId: string, id: string): Promise<DecisionRecord | null> {
  return repo.getDecisionRecordById(pool, tenantId, id);
}

/** List records (append-only: no update/delete). */
export async function listDecisionRecords(
  pool: Pool,
  filters: { tenantId: string; closeSessionId?: string | null; decisionType?: string; limit?: number }
): Promise<DecisionRecord[]> {
  return repo.listDecisionRecords(pool, filters);
}
