import type { Pool, PoolClient } from 'pg';
import type {
  AccountingCorrectionEvent,
  AccountingMemory,
  AccountingMemoryApplication,
  AccountingMemoryApplicationOutcome,
  AccountingMemoryStatus,
  JournalTreatment,
  JournalTreatmentSubject,
} from '../../types/accounting_memory.js';

type Queryable = Pool | PoolClient;

interface CorrectionRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  close_session_id: string;
  period_label: string;
  framework: 'ASPE';
  correction_type: 'journal_entry';
  original_je_id: string;
  replacement_je_id: string;
  before_snapshot: unknown;
  after_snapshot: unknown;
  rationale: string;
  applicability: AccountingCorrectionEvent['applicability'];
  memory_scope: AccountingCorrectionEvent['memoryScope'];
  corrected_by: string;
  created_at: string;
}

interface MemoryRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  framework: 'ASPE';
  memory_type: 'journal_treatment';
  status: AccountingMemoryStatus;
  pattern_signature: string;
  subject: unknown;
  treatment: unknown;
  rationale: string;
  applicability: AccountingMemory['applicability'];
  memory_scope: AccountingMemory['memoryScope'];
  effective_from_period: string;
  effective_to_period: string | null;
  source_correction_event_id: string;
  supersedes_memory_id: string | null;
  conflicts_with_memory_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_reason: string | null;
  created_at: string;
}

interface ApplicationRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  close_session_id: string;
  memory_id: string;
  target_type: AccountingMemoryApplication['targetType'];
  target_id: string;
  task_execution_id: string | null;
  outcome: AccountingMemoryApplicationOutcome;
  similarity: string | number;
  detail: unknown;
  applied_by: string;
  created_at: string;
}

const CORRECTION_COLUMNS = `
  id, tenant_id, entity_id, close_session_id, period_label, framework,
  correction_type, original_je_id, replacement_je_id, before_snapshot,
  after_snapshot, rationale, applicability, memory_scope, corrected_by, created_at
`;
const MEMORY_COLUMNS = `
  id, tenant_id, entity_id, framework, memory_type, status, pattern_signature,
  subject, treatment, rationale, applicability, memory_scope,
  effective_from_period, effective_to_period, source_correction_event_id,
  supersedes_memory_id, conflicts_with_memory_id, approved_by, approved_at,
  resolved_by, resolved_at, resolution_reason, created_at
`;
const APPLICATION_COLUMNS = `
  id, tenant_id, entity_id, close_session_id, memory_id, target_type,
  target_id, task_execution_id, outcome, similarity, detail, applied_by, created_at
`;

function toCorrection(row: CorrectionRow): AccountingCorrectionEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    closeSessionId: row.close_session_id,
    periodLabel: row.period_label,
    framework: row.framework,
    correctionType: row.correction_type,
    originalJournalEntryId: row.original_je_id,
    replacementJournalEntryId: row.replacement_je_id,
    beforeSnapshot: row.before_snapshot as AccountingCorrectionEvent['beforeSnapshot'],
    afterSnapshot: row.after_snapshot as AccountingCorrectionEvent['afterSnapshot'],
    rationale: row.rationale,
    applicability: row.applicability,
    memoryScope: row.memory_scope,
    correctedBy: row.corrected_by,
    createdAt: row.created_at,
  };
}

function toMemory(row: MemoryRow): AccountingMemory {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    framework: row.framework,
    memoryType: row.memory_type,
    status: row.status,
    patternSignature: row.pattern_signature,
    subject: row.subject as JournalTreatmentSubject,
    treatment: row.treatment as JournalTreatment,
    rationale: row.rationale,
    applicability: row.applicability,
    memoryScope: row.memory_scope,
    effectiveFromPeriod: row.effective_from_period,
    effectiveToPeriod: row.effective_to_period ?? undefined,
    sourceCorrectionEventId: row.source_correction_event_id,
    supersedesMemoryId: row.supersedes_memory_id ?? undefined,
    conflictsWithMemoryId: row.conflicts_with_memory_id ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    resolutionReason: row.resolution_reason ?? undefined,
    createdAt: row.created_at,
  };
}

function toApplication(row: ApplicationRow): AccountingMemoryApplication {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    closeSessionId: row.close_session_id,
    memoryId: row.memory_id,
    targetType: row.target_type,
    targetId: row.target_id,
    taskExecutionId: row.task_execution_id ?? undefined,
    outcome: row.outcome,
    similarity: Number(row.similarity),
    detail: row.detail && typeof row.detail === 'object' ? row.detail as Record<string, unknown> : {},
    appliedBy: row.applied_by,
    createdAt: row.created_at,
  };
}

export async function insertCorrectionEvent(
  db: Queryable,
  input: Omit<AccountingCorrectionEvent, 'createdAt'>
): Promise<AccountingCorrectionEvent> {
  const result = await db.query<CorrectionRow>(
    `INSERT INTO core.accounting_correction_events (
       id, tenant_id, entity_id, close_session_id, period_label, framework,
       correction_type, original_je_id, replacement_je_id, before_snapshot,
       after_snapshot, rationale, applicability, memory_scope, corrected_by
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
       $11::jsonb, $12, $13, $14, $15
     ) RETURNING ${CORRECTION_COLUMNS}`,
    [
      input.id,
      input.tenantId,
      input.entityId,
      input.closeSessionId,
      input.periodLabel,
      input.framework,
      input.correctionType,
      input.originalJournalEntryId,
      input.replacementJournalEntryId,
      JSON.stringify(input.beforeSnapshot),
      JSON.stringify(input.afterSnapshot),
      input.rationale,
      input.applicability,
      input.memoryScope,
      input.correctedBy,
    ]
  );
  return toCorrection(result.rows[0]!);
}

export async function listCorrectionEvents(
  db: Queryable,
  tenantId: string,
  closeSessionId: string
): Promise<AccountingCorrectionEvent[]> {
  const result = await db.query<CorrectionRow>(
    `SELECT ${CORRECTION_COLUMNS}
     FROM core.accounting_correction_events
     WHERE tenant_id = $1 AND close_session_id = $2
     ORDER BY created_at DESC`,
    [tenantId, closeSessionId]
  );
  return result.rows.map(toCorrection);
}

export async function getCorrectionEvent(
  db: Queryable,
  tenantId: string,
  correctionEventId: string
): Promise<AccountingCorrectionEvent | null> {
  const result = await db.query<CorrectionRow>(
    `SELECT ${CORRECTION_COLUMNS}
     FROM core.accounting_correction_events
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, correctionEventId]
  );
  return result.rows[0] ? toCorrection(result.rows[0]) : null;
}

export async function insertMemory(
  db: Queryable,
  input: Omit<AccountingMemory, 'createdAt' | 'resolvedBy' | 'resolvedAt' | 'resolutionReason'>
): Promise<AccountingMemory> {
  const result = await db.query<MemoryRow>(
    `INSERT INTO core.accounting_memories (
       id, tenant_id, entity_id, framework, memory_type, status,
       pattern_signature, subject, treatment, rationale, applicability,
       memory_scope, effective_from_period, effective_to_period,
       source_correction_event_id, supersedes_memory_id, conflicts_with_memory_id,
       approved_by, approved_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11,
       $12, $13, $14, $15, $16, $17, $18, $19
     ) RETURNING ${MEMORY_COLUMNS}`,
    [
      input.id,
      input.tenantId,
      input.entityId,
      input.framework,
      input.memoryType,
      input.status,
      input.patternSignature,
      JSON.stringify(input.subject),
      JSON.stringify(input.treatment),
      input.rationale,
      input.applicability,
      input.memoryScope,
      input.effectiveFromPeriod,
      input.effectiveToPeriod ?? null,
      input.sourceCorrectionEventId,
      input.supersedesMemoryId ?? null,
      input.conflictsWithMemoryId ?? null,
      input.approvedBy ?? null,
      input.approvedAt ?? null,
    ]
  );
  return toMemory(result.rows[0]!);
}

export async function getMemory(
  db: Queryable,
  tenantId: string,
  memoryId: string
): Promise<AccountingMemory | null> {
  const result = await db.query<MemoryRow>(
    `SELECT ${MEMORY_COLUMNS}
     FROM core.accounting_memories
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, memoryId]
  );
  return result.rows[0] ? toMemory(result.rows[0]) : null;
}

export async function getApprovedMemoryBySignature(
  db: Queryable,
  tenantId: string,
  entityId: string,
  patternSignature: string
): Promise<AccountingMemory | null> {
  const result = await db.query<MemoryRow>(
    `SELECT ${MEMORY_COLUMNS}
     FROM core.accounting_memories
     WHERE tenant_id = $1 AND entity_id = $2 AND framework = 'ASPE'
       AND pattern_signature = $3 AND status = 'approved'
     LIMIT 1`,
    [tenantId, entityId, patternSignature]
  );
  return result.rows[0] ? toMemory(result.rows[0]) : null;
}

export async function listMemories(
  db: Queryable,
  tenantId: string,
  filters: {
    entityId?: string;
    status?: AccountingMemoryStatus;
    closeSessionId?: string;
  } = {}
): Promise<AccountingMemory[]> {
  const conditions = ['m.tenant_id = $1'];
  const values: unknown[] = [tenantId];
  if (filters.entityId) {
    values.push(filters.entityId);
    conditions.push(`m.entity_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`m.status = $${values.length}`);
  }
  if (filters.closeSessionId) {
    values.push(filters.closeSessionId);
    conditions.push(
      `EXISTS (
         SELECT 1 FROM core.accounting_correction_events ce
         WHERE ce.id = m.source_correction_event_id
           AND ce.close_session_id = $${values.length}
       )`
    );
  }
  const result = await db.query<MemoryRow>(
    `SELECT ${MEMORY_COLUMNS.replace(/\b(id|tenant_id|entity_id|framework|memory_type|status|pattern_signature|subject|treatment|rationale|applicability|memory_scope|effective_from_period|effective_to_period|source_correction_event_id|supersedes_memory_id|conflicts_with_memory_id|approved_by|approved_at|resolved_by|resolved_at|resolution_reason|created_at)\b/g, 'm.$1')}
     FROM core.accounting_memories m
     WHERE ${conditions.join(' AND ')}
     ORDER BY m.created_at DESC`,
    values
  );
  return result.rows.map(toMemory);
}

export async function listApprovedMemoriesForPeriod(
  db: Queryable,
  tenantId: string,
  entityId: string,
  periodLabel: string
): Promise<AccountingMemory[]> {
  const result = await db.query<MemoryRow>(
    `SELECT ${MEMORY_COLUMNS}
     FROM core.accounting_memories
     WHERE tenant_id = $1 AND entity_id = $2 AND framework = 'ASPE'
       AND status = 'approved' AND applicability <> 'one_time'
       AND effective_from_period <= $3
       AND (effective_to_period IS NULL OR effective_to_period >= $3)
     ORDER BY created_at DESC`,
    [tenantId, entityId, periodLabel]
  );
  return result.rows.map(toMemory);
}

export async function resolveMemory(
  db: Queryable,
  tenantId: string,
  memoryId: string,
  status: Extract<AccountingMemoryStatus, 'approved' | 'superseded' | 'revoked'>,
  input: { actor: string; reason: string; effectiveToPeriod?: string; expectedStatuses: AccountingMemoryStatus[] }
): Promise<AccountingMemory | null> {
  const result = await db.query<MemoryRow>(
    `UPDATE core.accounting_memories
     SET status = $3,
         approved_by = CASE WHEN $3 = 'approved' THEN $4 ELSE approved_by END,
         approved_at = CASE WHEN $3 = 'approved' THEN NOW() ELSE approved_at END,
         resolved_by = $4,
         resolved_at = NOW(),
         resolution_reason = $5,
         effective_to_period = COALESCE($6, effective_to_period)
     WHERE tenant_id = $1 AND id = $2 AND status = ANY($7::text[])
     RETURNING ${MEMORY_COLUMNS}`,
    [tenantId, memoryId, status, input.actor, input.reason, input.effectiveToPeriod ?? null, input.expectedStatuses]
  );
  return result.rows[0] ? toMemory(result.rows[0]) : null;
}

export async function insertApplication(
  db: Queryable,
  input: Omit<AccountingMemoryApplication, 'createdAt'>
): Promise<AccountingMemoryApplication> {
  const result = await db.query<ApplicationRow>(
    `INSERT INTO core.accounting_memory_applications (
       id, tenant_id, entity_id, close_session_id, memory_id, target_type,
       target_id, task_execution_id, outcome, similarity, detail, applied_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
     ON CONFLICT (tenant_id, close_session_id, memory_id, target_type, target_id, outcome)
     DO NOTHING
     RETURNING ${APPLICATION_COLUMNS}`,
    [
      input.id,
      input.tenantId,
      input.entityId,
      input.closeSessionId,
      input.memoryId,
      input.targetType,
      input.targetId,
      input.taskExecutionId ?? null,
      input.outcome,
      input.similarity,
      JSON.stringify(input.detail),
      input.appliedBy,
    ]
  );
  if (result.rows[0]) return toApplication(result.rows[0]);
  const existing = await db.query<ApplicationRow>(
    `SELECT ${APPLICATION_COLUMNS}
     FROM core.accounting_memory_applications
     WHERE tenant_id = $1 AND close_session_id = $2 AND memory_id = $3
       AND target_type = $4 AND target_id = $5 AND outcome = $6`,
    [
      input.tenantId,
      input.closeSessionId,
      input.memoryId,
      input.targetType,
      input.targetId,
      input.outcome,
    ]
  );
  if (!existing.rows[0]) {
    throw new Error('Accounting memory application was not inserted or found after conflict.');
  }
  return toApplication(existing.rows[0]);
}

export async function listApplications(
  db: Queryable,
  tenantId: string,
  closeSessionId: string
): Promise<AccountingMemoryApplication[]> {
  const result = await db.query<ApplicationRow>(
    `SELECT ${APPLICATION_COLUMNS}
     FROM core.accounting_memory_applications
     WHERE tenant_id = $1 AND close_session_id = $2
     ORDER BY created_at DESC`,
    [tenantId, closeSessionId]
  );
  return result.rows.map(toApplication);
}

export async function countPatternCorrectionsBySignature(
  db: Queryable,
  tenantId: string,
  entityId: string,
  patternSignatures: string[]
): Promise<Map<string, number>> {
  if (patternSignatures.length === 0) return new Map();
  const result = await db.query<{ pattern_signature: string; count: string }>(
    `SELECT pattern_signature, COUNT(*)::text AS count
     FROM core.accounting_memories
     WHERE tenant_id = $1 AND entity_id = $2 AND pattern_signature = ANY($3::text[])
     GROUP BY pattern_signature`,
    [tenantId, entityId, [...new Set(patternSignatures)]]
  );
  return new Map(result.rows.map((row) => [row.pattern_signature, Number(row.count)]));
}
