import { createHash, randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '../db/transaction.js';
import * as memoryRepository from '../db/repositories/accounting_memory_repository.js';
import * as journalRepository from '../db/repositories/journal_entry_repository.js';
import { createDraftJE, JournalEntryError, proposeJE } from './journal_entry_service.js';
import { recordAuditEvent, recordMaterialEvent } from './audit_service.js';
import type {
  AccountingCorrectionApplicability,
  AccountingCorrectionEvent,
  AccountingMemory,
  AccountingMemoryApplication,
  AccountingMemoryApplicationOutcome,
  AccountingMemoryMatch,
  AccountingMemoryScope,
  AccountingJournalSnapshot,
  CorrectJournalEntryInput,
  CorrectJournalEntryResult,
  JournalTreatment,
  JournalTreatmentLinePattern,
  JournalTreatmentSubject,
} from '../types/accounting_memory.js';
import type { JournalEntry, JournalEntryLine } from '../types/journal_entry.js';
import type { CompiledRunbookTask } from '../types/close_runbook.js';
import { from } from '../utils/decimal.js';

type Queryable = Pool | PoolClient;

const TOKEN_STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on',
  'or', 'the', 'to', 'with', 'entry', 'journal', 'adjustment', 'adjusting', 'close',
  'month', 'monthly', 'quarter', 'quarterly', 'period', 'current', 'year',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  // Keep spelled-out prior-period quantities out of model memory context too.
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty',
  'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'million',
  'billion', 'zéro', 'zero', 'un', 'une', 'deux', 'trois', 'quatre', 'cinq',
  'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze',
  'quinze', 'seize', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante',
  'cent', 'mille', 'millions', 'milliard', 'milliards',
]);

const VALID_APPLICABILITY = new Set<AccountingCorrectionApplicability>([
  'one_time', 'recurring', 'policy_candidate',
]);
const VALID_MEMORY_SCOPE = new Set<AccountingMemoryScope>([
  'transaction_pattern', 'account', 'entity',
]);

export class AccountingMemoryError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_FOUND'
      | 'INVALID_STATUS'
      | 'VALIDATION'
      | 'SESSION_NOT_WRITABLE'
      | 'FRAMEWORK_MISMATCH'
      | 'MEMORY_CONFLICT'
  ) {
    super(message);
    this.name = 'AccountingMemoryError';
  }
}

export function normalizeAccountingMemoryTokens(value: string): string[] {
  const normalized = value
    .toLowerCase()
    .replace(/\b\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!normalized) return [];
  return [...new Set(
    normalized
      .split(/\s+/)
      .filter((token) => token.length >= 2 && !TOKEN_STOP_WORDS.has(token))
  )].sort();
}

/** Keep the human accounting explanation while removing period-specific numeric facts. */
export function sanitizeReusableAccountingRationale(value: string): string {
  return value
    .replace(/[$€£]?\s*[-+]?\d[\d,]*(?:\.\d+)?%?/g, ' [current-period numeric fact omitted] ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2_000);
}

function lineSide(line: Pick<JournalEntryLine, 'debit' | 'credit'>): 'debit' | 'credit' {
  return from(line.debit).greaterThan(0) ? 'debit' : 'credit';
}

export function buildJournalTreatmentLinePattern(
  lines: Array<Pick<JournalEntryLine, 'accountRef' | 'debit' | 'credit' | 'description'>>
): JournalTreatmentLinePattern[] {
  return lines
    .map((line) => ({
      accountRef: line.accountRef.trim(),
      side: lineSide(line),
      descriptionTokens: normalizeAccountingMemoryTokens(line.description ?? ''),
    }))
    .sort((left, right) => {
      const account = left.accountRef.localeCompare(right.accountRef);
      return account !== 0 ? account : left.side.localeCompare(right.side);
    });
}

function canonicalLineStructure(lines: JournalTreatmentLinePattern[]): string {
  return lines
    .map((line) => `${line.accountRef.trim().toLowerCase()}:${line.side}`)
    .sort()
    .join('|');
}

function containsLineStructure(
  candidate: JournalTreatmentLinePattern[],
  expected: JournalTreatmentLinePattern[]
): boolean {
  const candidateSet = new Set(candidate.map((line) => `${line.accountRef.trim().toLowerCase()}:${line.side}`));
  return expected.every((line) => candidateSet.has(`${line.accountRef.trim().toLowerCase()}:${line.side}`));
}

export function buildAccountingMemoryPatternSignature(subject: JournalTreatmentSubject): string {
  const stable = JSON.stringify({
    memoTokens: subject.memoTokens,
    originalLineStructure: canonicalLineStructure(subject.originalLinePattern),
    originalSource: subject.originalSource,
  });
  return createHash('sha256').update(stable).digest('hex');
}

function treatmentFingerprint(treatment: JournalTreatment): string {
  return createHash('sha256').update(JSON.stringify({
    correctedMemoTokens: treatment.correctedMemoTokens,
    correctedLinePattern: treatment.correctedLinePattern,
    amountPolicy: treatment.amountPolicy,
  })).digest('hex');
}

function snapshotJournalEntry(
  journalEntry: JournalEntry,
  lines: JournalEntryLine[]
): AccountingJournalSnapshot {
  return {
    journalEntryId: journalEntry.id,
    status: journalEntry.status,
    memo: journalEntry.memo,
    source: journalEntry.source,
    lines: lines.map((line) => ({
      accountRef: line.accountRef,
      debit: String(line.debit),
      credit: String(line.credit),
      description: line.description,
      amountProvenance: line.amountProvenance,
    })),
  };
}

function buildSubject(journalEntry: JournalEntry, lines: JournalEntryLine[]): JournalTreatmentSubject {
  return {
    memoTokens: normalizeAccountingMemoryTokens(journalEntry.memo ?? ''),
    originalLinePattern: buildJournalTreatmentLinePattern(lines),
    originalSource: journalEntry.source,
  };
}

function buildTreatment(journalEntry: JournalEntry, lines: JournalEntryLine[]): JournalTreatment {
  const correctedMemoTokens = normalizeAccountingMemoryTokens(journalEntry.memo ?? '');
  return {
    correctedMemo: (correctedMemoTokens.join(' ') || 'supervisor corrected treatment').slice(0, 500),
    correctedMemoTokens,
    correctedLinePattern: buildJournalTreatmentLinePattern(lines),
    amountPolicy: 'recalculate_from_current_period_source',
    requiresCurrentPeriodEvidence: true,
    reusableAmountsStored: false,
  };
}

function jaccard(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 && rightSet.size === 0) return 0;
  let intersection = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) intersection += 1;
  }
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function lineAccountTokens(lines: JournalTreatmentLinePattern[]): string[] {
  return [...new Set(lines.flatMap((line) => [
    `account:${line.accountRef.trim().toLowerCase()}`,
    ...normalizeAccountingMemoryTokens(line.accountRef),
  ]))].sort();
}

export function matchAccountingMemoryToJournalEntry(
  memory: AccountingMemory,
  journalEntry: Pick<JournalEntry, 'memo' | 'source'>,
  lines: Array<Pick<JournalEntryLine, 'accountRef' | 'debit' | 'credit' | 'description'>>
): AccountingMemoryMatch {
  const candidatePattern = buildJournalTreatmentLinePattern(lines);
  const memoSimilarity = jaccard(
    memory.subject.memoTokens,
    normalizeAccountingMemoryTokens(journalEntry.memo ?? '')
  );
  const accountSimilarity = jaccard(
    lineAccountTokens(memory.subject.originalLinePattern),
    lineAccountTokens(candidatePattern)
  );
  const sourceBonus = memory.subject.originalSource === journalEntry.source ? 0.1 : 0;
  const similarity = Math.min(1, Number((memoSimilarity * 0.6 + accountSimilarity * 0.3 + sourceBonus).toFixed(4)));
  const candidateStructure = canonicalLineStructure(candidatePattern);
  const originalStructure = canonicalLineStructure(memory.subject.originalLinePattern);
  const correctedStructure = canonicalLineStructure(memory.treatment.correctedLinePattern);
  if (memory.memoryScope === 'entity') {
    return {
      memory,
      similarity,
      relationship: 'context',
      reason: 'This entity-level treatment is context only; applying it to a journal entry requires human confirmation.',
    };
  }
  const repeatsOriginal = memory.memoryScope === 'account'
    ? containsLineStructure(candidatePattern, memory.subject.originalLinePattern)
    : candidateStructure === originalStructure;
  const followsCorrection = memory.memoryScope === 'account'
    ? containsLineStructure(candidatePattern, memory.treatment.correctedLinePattern)
    : candidateStructure === correctedStructure;

  if (
    originalStructure !== correctedStructure &&
    repeatsOriginal &&
    similarity >= 0.35
  ) {
    return {
      memory,
      similarity,
      relationship: 'conflict',
      reason: 'The proposed line structure repeats a treatment previously corrected by the Close Supervisor.',
    };
  }
  if (followsCorrection && similarity >= 0.35) {
    return {
      memory,
      similarity,
      relationship: 'consistent',
      reason: 'The proposed line structure is consistent with an approved Close Supervisor correction.',
    };
  }
  return {
    memory,
    similarity,
    relationship: 'context',
    reason: 'The approved correction may be relevant, but current-period facts require human confirmation.',
  };
}

export async function findMemoryMatchesForJournalEntry(
  db: Queryable,
  input: {
    tenantId: string;
    entityId: string;
    periodLabel: string;
    journalEntry: Pick<JournalEntry, 'memo' | 'source'>;
    lines: JournalEntryLine[];
    minimumSimilarity?: number;
  }
): Promise<AccountingMemoryMatch[]> {
  const memories = await memoryRepository.listApprovedMemoriesForPeriod(
    db,
    input.tenantId,
    input.entityId,
    input.periodLabel
  );
  const minimumSimilarity = input.minimumSimilarity ?? 0.35;
  return memories
    .map((memory) => matchAccountingMemoryToJournalEntry(memory, input.journalEntry, input.lines))
    .filter((match) => match.similarity >= minimumSimilarity)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 10);
}

export async function getApprovedMemoryContextForTask(
  db: Queryable,
  input: {
    tenantId: string;
    entityId: string;
    periodLabel: string;
    task: CompiledRunbookTask;
  }
): Promise<AccountingMemory[]> {
  const memories = await memoryRepository.listApprovedMemoriesForPeriod(
    db,
    input.tenantId,
    input.entityId,
    input.periodLabel
  );
  if (input.task.capability === 'journal_entry_review') return memories.slice(0, 10);
  const taskTokens = normalizeAccountingMemoryTokens(
    `${input.task.title} ${input.task.description} ${input.task.category} ${input.task.controlCode ?? ''}`
  );
  return memories
    .map((memory) => ({
      memory,
      score: Math.max(
        jaccard(taskTokens, memory.subject.memoTokens),
        jaccard(taskTokens, memory.treatment.correctedMemoTokens),
        jaccard(taskTokens, lineAccountTokens(memory.treatment.correctedLinePattern))
      ),
    }))
    .filter((item) => item.score >= 0.15)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((item) => item.memory);
}

export function buildSafeMemoryContext(memory: AccountingMemory): Record<string, unknown> {
  return {
    memoryId: memory.id,
    status: memory.status,
    applicability: memory.applicability,
    scope: memory.memoryScope,
    rationaleTokens: normalizeAccountingMemoryTokens(memory.rationale),
    effectiveFromPeriod: memory.effectiveFromPeriod,
    priorPattern: {
      memoTokens: memory.subject.memoTokens,
      lineStructure: memory.subject.originalLinePattern,
    },
    approvedTreatment: {
      correctedMemoTokens: memory.treatment.correctedMemoTokens,
      correctedLinePattern: memory.treatment.correctedLinePattern,
      amountPolicy: memory.treatment.amountPolicy,
      requiresCurrentPeriodEvidence: memory.treatment.requiresCurrentPeriodEvidence,
      reusableAmountsStored: memory.treatment.reusableAmountsStored,
    },
    accountingGuardrails: {
      copyPriorAmounts: false,
      recalculateFromCurrentPeriodSource: true,
      currentPeriodEvidenceRequired: true,
      humanConfirmationRequired: true,
    },
  };
}

export async function recordMemoryApplication(
  db: Queryable,
  input: {
    tenantId: string;
    entityId: string;
    closeSessionId: string;
    memoryId: string;
    targetType: AccountingMemoryApplication['targetType'];
    targetId: string;
    taskExecutionId?: string;
    outcome: AccountingMemoryApplicationOutcome;
    similarity: number;
    detail?: Record<string, unknown>;
    appliedBy: string;
  }
): Promise<AccountingMemoryApplication> {
  return memoryRepository.insertApplication(db, {
    id: randomUUID(),
    ...input,
    detail: input.detail ?? {},
  });
}

function validateCorrectionInput(input: CorrectJournalEntryInput): void {
  const rationale = input.rationale?.trim() ?? '';
  if (rationale.length < 10) {
    throw new AccountingMemoryError('Correction rationale must be at least 10 characters.', 'VALIDATION');
  }
  if (!VALID_APPLICABILITY.has(input.applicability)) {
    throw new AccountingMemoryError('Invalid correction applicability.', 'VALIDATION');
  }
  if (!VALID_MEMORY_SCOPE.has(input.memoryScope)) {
    throw new AccountingMemoryError('Invalid accounting memory scope.', 'VALIDATION');
  }
  if (!input.memo?.trim() || input.memo.trim().length < 5) {
    throw new AccountingMemoryError('Corrected journal entry memo must be at least 5 characters.', 'VALIDATION');
  }
  if (!Array.isArray(input.lines) || input.lines.length < 2) {
    throw new AccountingMemoryError('A corrected journal entry requires at least two lines.', 'VALIDATION');
  }
}

export async function correctProposedJournalEntry(
  pool: Pool,
  input: CorrectJournalEntryInput
): Promise<CorrectJournalEntryResult> {
  validateCorrectionInput(input);
  const rationale = input.rationale.trim();
  try {
    return await withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${input.tenantId}:${input.journalEntryId}:accounting-correction`,
    ]);
    const original = await journalRepository.getJournalEntryById(
      client,
      input.journalEntryId,
      input.tenantId
    );
    if (!original) throw new AccountingMemoryError('Journal entry not found.', 'NOT_FOUND');
    if (original.status !== 'proposed') {
      throw new AccountingMemoryError(
        `Only proposed journal entries can be corrected; current status is ${original.status}.`,
        'INVALID_STATUS'
      );
    }
    const sessionResult = await client.query<{
      entity_id: string;
      period_end: string | Date;
      standard: string;
      status: string;
    }>(
      `SELECT entity_id, period_end, standard, status
       FROM core.close_sessions
       WHERE tenant_id = $1 AND id = $2
       FOR SHARE`,
      [input.tenantId, original.closeSessionId]
    );
    const session = sessionResult.rows[0];
    if (!session) throw new AccountingMemoryError('Close session not found.', 'NOT_FOUND');
    if (session.status !== 'in_progress') {
      throw new AccountingMemoryError(
        `Accounting corrections are frozen while the close session is ${session.status}.`,
        'SESSION_NOT_WRITABLE'
      );
    }
    if (session.standard.toUpperCase() !== 'ASPE') {
      throw new AccountingMemoryError('Governed correction memory currently requires ASPE.', 'FRAMEWORK_MISMATCH');
    }
    const periodEnd = typeof session.period_end === 'string'
      ? session.period_end
      : session.period_end.toISOString();
    const periodLabel = periodEnd.slice(0, 7);
    const originalLines = await journalRepository.listJournalEntryLines(client, original.id);
    const beforeSnapshot = snapshotJournalEntry(original, originalLines);

    const replacement = await createDraftJE(client, {
      tenantId: input.tenantId,
      closeSessionId: original.closeSessionId,
      memo: input.memo.trim(),
      source: 'manual',
      createdBy: input.correctedBy,
      lines: input.lines.map((line) => ({
        accountRef: line.accountRef.trim(),
        debit: line.debit ?? 0,
        credit: line.credit ?? 0,
        description: line.description?.trim() || undefined,
        amountProvenance: {
          kind: 'human_entered' as const,
          enteredBy: input.correctedBy,
          enteredAt: new Date().toISOString(),
        },
      })),
    });
    const proposedReplacement = await proposeJE(client, input.tenantId, replacement.id);
    const replacementLines = await journalRepository.listJournalEntryLines(client, replacement.id);
    const afterSnapshot = snapshotJournalEntry(proposedReplacement, replacementLines);

    const rejected = await journalRepository.updateJournalEntryStatus(
      client,
      original.id,
      input.tenantId,
      'rejected',
      {
        expectedStatus: 'proposed',
        rejectedBy: input.correctedBy,
        rejectedAt: new Date().toISOString(),
        rejectionReason: `Corrected by Close Supervisor: ${rationale}`,
      }
    );
    if (!rejected) {
      throw new AccountingMemoryError('Journal entry changed while the correction was being recorded.', 'INVALID_STATUS');
    }

    const correctionId = randomUUID();
    const correction = await memoryRepository.insertCorrectionEvent(client, {
      id: correctionId,
      tenantId: input.tenantId,
      entityId: session.entity_id,
      closeSessionId: original.closeSessionId,
      periodLabel,
      framework: 'ASPE',
      correctionType: 'journal_entry',
      originalJournalEntryId: original.id,
      replacementJournalEntryId: replacement.id,
      beforeSnapshot,
      afterSnapshot,
      rationale,
      applicability: input.applicability,
      memoryScope: input.memoryScope,
      correctedBy: input.correctedBy,
    });

    const subject = buildSubject(original, originalLines);
    const treatment = buildTreatment(proposedReplacement, replacementLines);
    const patternSignature = buildAccountingMemoryPatternSignature(subject);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${input.tenantId}:${session.entity_id}:${patternSignature}:accounting-memory-pattern`,
    ]);
    const existingMemory = await memoryRepository.getApprovedMemoryBySignature(
      client,
      input.tenantId,
      session.entity_id,
      patternSignature
    );
    const treatmentChanged = existingMemory
      ? treatmentFingerprint(existingMemory.treatment) !== treatmentFingerprint(treatment)
      : false;
    const correctionPredatesActiveMemory = existingMemory
      ? periodLabel < existingMemory.effectiveFromPeriod
      : false;
    const now = new Date().toISOString();
    let memoryStatus: AccountingMemory['status'] = input.applicability === 'policy_candidate'
      ? 'candidate'
      : 'approved';
    let supersedesMemoryId: string | undefined;
    let conflictsWithMemoryId: string | undefined;
    if (existingMemory && (
      treatmentChanged || correctionPredatesActiveMemory || memoryStatus === 'candidate'
    )) {
      memoryStatus = 'candidate';
      conflictsWithMemoryId = existingMemory.id;
    } else if (existingMemory && memoryStatus === 'approved') {
      const superseded = await memoryRepository.resolveMemory(
        client,
        input.tenantId,
        existingMemory.id,
        'superseded',
        {
          actor: input.correctedBy,
          reason: 'Reconfirmed by a later Close Supervisor correction with the same treatment.',
          effectiveToPeriod: periodLabel,
          expectedStatuses: ['approved'],
        }
      );
      if (!superseded) {
        throw new AccountingMemoryError(
          'The active accounting memory changed while the correction was being recorded.',
          'MEMORY_CONFLICT'
        );
      }
      supersedesMemoryId = existingMemory.id;
    }
    const memory = await memoryRepository.insertMemory(client, {
      id: randomUUID(),
      tenantId: input.tenantId,
      entityId: session.entity_id,
      framework: 'ASPE',
      memoryType: 'journal_treatment',
      status: memoryStatus,
      patternSignature,
      subject,
      treatment,
      rationale: sanitizeReusableAccountingRationale(rationale),
      applicability: input.applicability,
      memoryScope: input.memoryScope,
      effectiveFromPeriod: periodLabel,
      sourceCorrectionEventId: correction.id,
      supersedesMemoryId,
      conflictsWithMemoryId,
      approvedBy: memoryStatus === 'approved' ? input.correctedBy : undefined,
      approvedAt: memoryStatus === 'approved' ? now : undefined,
    });

    await recordAuditEvent(client, input.tenantId, {
      eventType: 'aje_corrected',
      entityId: session.entity_id,
      periodId: original.closeSessionId,
      periodLabel,
      userId: input.correctedBy,
      targetType: 'journal_entry',
      targetId: original.id,
      beforeState: beforeSnapshot as unknown as Record<string, unknown>,
      afterState: afterSnapshot as unknown as Record<string, unknown>,
      details: {
        correctionEventId: correction.id,
        replacementJournalEntryId: replacement.id,
        accountingMemoryId: memory.id,
        memoryStatus: memory.status,
        applicability: input.applicability,
        memoryScope: input.memoryScope,
        rationale,
      },
    });
    return {
      correction,
      memory,
      replacementJournalEntryId: replacement.id,
      memoryConflictRequiresApproval: memory.status === 'candidate',
    };
    });
  } catch (error) {
    if (error instanceof JournalEntryError) {
      const code = error.code === 'NOT_FOUND'
        ? 'NOT_FOUND'
        : error.code === 'INVALID_STATUS'
          ? 'INVALID_STATUS'
          : 'VALIDATION';
      throw new AccountingMemoryError(error.message, code);
    }
    throw error;
  }
}

export async function approveCandidateMemory(
  pool: Pool,
  input: { tenantId: string; memoryId: string; actor: string; reason: string }
): Promise<AccountingMemory> {
  if (input.reason.trim().length < 10) {
    throw new AccountingMemoryError('Memory approval rationale must be at least 10 characters.', 'VALIDATION');
  }
  return withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${input.tenantId}:${input.memoryId}:accounting-memory-resolution`,
    ]);
    const candidate = await memoryRepository.getMemory(client, input.tenantId, input.memoryId);
    if (!candidate) throw new AccountingMemoryError('Accounting memory not found.', 'NOT_FOUND');
    if (candidate.status !== 'candidate') {
      throw new AccountingMemoryError(
        `Only candidate memories can be approved; current status is ${candidate.status}.`,
        'INVALID_STATUS'
      );
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${input.tenantId}:${candidate.entityId}:${candidate.patternSignature}:accounting-memory-pattern`,
    ]);
    const current = await memoryRepository.getApprovedMemoryBySignature(
      client,
      input.tenantId,
      candidate.entityId,
      candidate.patternSignature
    );
    if (current && candidate.effectiveFromPeriod < current.effectiveFromPeriod) {
      throw new AccountingMemoryError(
        'This correction predates the active treatment. Reopen it in the correct effective-period workflow instead of rewriting later-period memory.',
        'MEMORY_CONFLICT'
      );
    }
    if (current) {
      const superseded = await memoryRepository.resolveMemory(
        client,
        input.tenantId,
        current.id,
        'superseded',
        {
          actor: input.actor,
          reason: `Superseded by approved memory ${candidate.id}: ${input.reason.trim()}`,
          effectiveToPeriod: candidate.effectiveFromPeriod,
          expectedStatuses: ['approved'],
        }
      );
      if (!superseded) {
        throw new AccountingMemoryError('The conflicting memory changed during approval.', 'MEMORY_CONFLICT');
      }
    }
    const approved = await memoryRepository.resolveMemory(
      client,
      input.tenantId,
      candidate.id,
      'approved',
      { actor: input.actor, reason: input.reason.trim(), expectedStatuses: ['candidate'] }
    );
    if (!approved) throw new AccountingMemoryError('Accounting memory changed during approval.', 'MEMORY_CONFLICT');
    await recordMaterialEvent(client, {
      tenantId: input.tenantId,
      periodLabel: approved.effectiveFromPeriod,
      eventType: 'accounting_memory_change',
      deterministicFlagSnapshot: {
        event: 'accounting_memory_approved',
        memoryId: approved.id,
        supersededMemoryId: current?.id,
        entityId: approved.entityId,
        reason: input.reason.trim(),
      },
      createdBy: input.actor,
    });
    return approved;
  });
}

export async function revokeAccountingMemory(
  pool: Pool,
  input: { tenantId: string; memoryId: string; actor: string; reason: string }
): Promise<AccountingMemory> {
  if (input.reason.trim().length < 10) {
    throw new AccountingMemoryError('Memory revocation rationale must be at least 10 characters.', 'VALIDATION');
  }
  return withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${input.tenantId}:${input.memoryId}:accounting-memory-resolution`,
    ]);
    const existing = await memoryRepository.getMemory(client, input.tenantId, input.memoryId);
    if (!existing) {
      throw new AccountingMemoryError('Accounting memory not found.', 'NOT_FOUND');
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${input.tenantId}:${existing.entityId}:${existing.patternSignature}:accounting-memory-pattern`,
    ]);
    const memory = await memoryRepository.resolveMemory(
      client,
      input.tenantId,
      input.memoryId,
      'revoked',
      {
        actor: input.actor,
        reason: input.reason.trim(),
        expectedStatuses: ['candidate', 'approved'],
      }
    );
    if (!memory) throw new AccountingMemoryError('Accounting memory not found or already terminal.', 'INVALID_STATUS');
    await recordMaterialEvent(client, {
      tenantId: input.tenantId,
      periodLabel: memory.effectiveFromPeriod,
      eventType: 'accounting_memory_change',
      deterministicFlagSnapshot: {
        event: 'accounting_memory_revoked',
        memoryId: memory.id,
        entityId: memory.entityId,
        reason: input.reason.trim(),
      },
      createdBy: input.actor,
    });
    return memory;
  });
}

export async function getAccountingMemorySessionView(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  entityId: string
): Promise<{
  corrections: AccountingCorrectionEvent[];
  memories: Array<AccountingMemory & { correctionCount: number; promotionRecommended: boolean }>;
  applications: AccountingMemoryApplication[];
}> {
  const [corrections, memories, applications] = await Promise.all([
    memoryRepository.listCorrectionEvents(pool, tenantId, closeSessionId),
    memoryRepository.listMemories(pool, tenantId, { entityId }),
    memoryRepository.listApplications(pool, tenantId, closeSessionId),
  ]);
  const correctionCounts = await memoryRepository.countPatternCorrectionsBySignature(
    pool,
    tenantId,
    entityId,
    memories.map((memory) => memory.patternSignature)
  );
  const enriched = memories.map((memory) => {
    const correctionCount = correctionCounts.get(memory.patternSignature) ?? 0;
    return {
      ...memory,
      correctionCount,
      promotionRecommended:
        correctionCount >= 2 && memory.applicability !== 'one_time' && memory.status === 'approved',
    };
  });
  return { corrections, memories: enriched, applications };
}
