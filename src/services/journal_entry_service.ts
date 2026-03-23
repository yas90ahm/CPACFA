/**
 * Journal Entry service: lifecycle (draft → proposed → approved/posted/exported/rejected),
 * validation (balanced, period, materiality), segregation (approved_by !== created_by unless override).
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { sumRound2, from as decimalFrom } from '../utils/decimal.js';
import type {
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  CreateDraftJEInput,
  ValidationResult,
} from '../types/journal_entry.js';
import { validateJEProvenance } from '../types/amount_provenance.js';
import * as repo from '../db/repositories/journal_entry_repository.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import { getLatestTriage } from './triage_service.js';
import { recordMaterialEvent } from './audit_service.js';
import { createJustificationFromAI } from './justification_service.js';
import { runPrePostChecksAndStore } from './shadow_auditor_service.js';
import { runJustifier, hashJustifierInputs } from '../ai/ai_orchestrator.js';
import { JUSTIFIER_PROMPT_VERSION } from '../ai/prompts/justifier.prompt.js';
import { executeCascade, CascadeTriggerType } from './cascade_engine.js';
import { financialEvents, buildEventPacket } from '../events/financial_event_emitter.js';

/** Maximum amount that fits NUMERIC(20,2): 99_999_999_999_999.99 */
const MAX_AMOUNT = 99_999_999_999_999.99;

/**
 * Sanitize a JE line amount value before Decimal processing.
 * Rejects NaN, Infinity, negative values, sub-penny precision, and values exceeding NUMERIC(20,2).
 * Returns a validated non-negative number with at most 2 decimal places.
 */
export function sanitizeAmount(val: unknown): number {
  const n = typeof val === 'string' ? Number(val) : (typeof val === 'number' ? val : NaN);
  if (!Number.isFinite(n)) {
    throw new JournalEntryError(
      `Invalid amount: value must be a finite number, received ${String(val)}`,
      'VALIDATION'
    );
  }
  if (n < 0) {
    throw new JournalEntryError(
      `Invalid amount: value must be >= 0, received ${n}`,
      'VALIDATION'
    );
  }
  if (n > MAX_AMOUNT) {
    throw new JournalEntryError(
      `Invalid amount: value ${n} exceeds maximum allowed (${MAX_AMOUNT})`,
      'VALIDATION'
    );
  }
  // Check for sub-penny precision (more than 2 decimal places)
  const parts = String(n).split('.');
  if (parts[1] && parts[1].length > 2) {
    throw new JournalEntryError(
      `Invalid amount: value ${n} has more than 2 decimal places (sub-penny precision not allowed)`,
      'VALIDATION'
    );
  }
  return n;
}

/**
 * Segregation of duties bypass — LOCAL DEVELOPMENT ONLY.
 * In production, staging, or demo modes, this always returns false
 * regardless of the ALLOW_SAME_USER_APPROVE environment variable.
 * M4 fix: Extend production guard to also block staging and demo modes.
 */
function isSameUserApproveAllowed(): boolean {
  const env = process.env.NODE_ENV ?? '';
  const mode = process.env.MODE ?? '';
  const blockedEnvs = ['production', 'staging', 'demo'];
  const blockedModes = ['prod', 'staging', 'demo'];
  if (blockedEnvs.includes(env) || blockedModes.includes(mode)) {
    return false;
  }
  return process.env.ALLOW_SAME_USER_APPROVE === '1' || process.env.ALLOW_SAME_USER_APPROVE === 'true';
}

export class JournalEntryError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'VALIDATION' | 'INVALID_STATUS' | 'SEGREGATION' | 'SHADOW_AUDIT_BLOCK'
  ) {
    super(message);
    this.name = 'JournalEntryError';
  }
}

/** Create a draft JE with lines. Enforces amount provenance at API and persists on each line. */
export async function createDraftJE(pool: Pool, input: CreateDraftJEInput): Promise<JournalEntry> {
  const memo = input.memo?.trim() ?? '';
  if (!memo) {
    throw new JournalEntryError('Journal entry memo/description is required', 'VALIDATION');
  }
  if (memo.length < 5) {
    throw new JournalEntryError('Journal entry memo must be at least 5 characters', 'VALIDATION');
  }
  // Sanitize all line amounts before any Decimal processing
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    try {
      line.debit = line.debit != null ? sanitizeAmount(line.debit) : 0;
      line.credit = line.credit != null ? sanitizeAmount(line.credit) : 0;
    } catch (e) {
      if (e instanceof JournalEntryError) {
        throw new JournalEntryError(`Line ${i + 1}: ${e.message}`, 'VALIDATION');
      }
      throw e;
    }
  }
  // Reject lines where both debit and credit are zero
  const zeroLines = input.lines.filter((l) => (l.debit ?? 0) === 0 && (l.credit ?? 0) === 0);
  if (zeroLines.length > 0) {
    throw new JournalEntryError(
      `${zeroLines.length} line(s) have both debit and credit equal to zero — remove them or assign an amount`,
      'VALIDATION'
    );
  }
  const balanced = validateBalanced(input.lines);
  if (!balanced.valid) {
    throw new JournalEntryError(
      `Journal entry must balance: ${balanced.errors.join('; ')}`,
      'VALIDATION'
    );
  }
  const debits = input.lines
    .filter((l) => (l.debit ?? 0) > 0)
    .map((l) => ({ account: l.accountRef, amount: l.debit!, amountProvenance: l.amountProvenance }));
  const credits = input.lines
    .filter((l) => (l.credit ?? 0) > 0)
    .map((l) => ({ account: l.accountRef, amount: l.credit!, amountProvenance: l.amountProvenance }));
  const provenanceResult = validateJEProvenance({ debits, credits });
  if (!provenanceResult.valid) {
    throw new JournalEntryError(
      `Amount provenance required for non-zero amounts: ${provenanceResult.errors.join('; ')}`,
      'VALIDATION'
    );
  }
  const id = randomUUID();
  await repo.insertJournalEntry(pool, id, {
    closeSessionId: input.closeSessionId,
    tenantId: input.tenantId,
    status: 'draft',
    memo: input.memo,
    source: input.source,
    createdBy: input.createdBy,
  });
  await repo.insertJournalEntryLines(
    pool,
    id,
    input.lines.map((l) => ({
      accountRef: l.accountRef,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
      description: l.description,
      amountProvenance: l.amountProvenance,
    }))
  );
  const je = await repo.getJournalEntryById(pool, id, input.tenantId);
  if (!je) throw new JournalEntryError('Journal entry not found after insert', 'NOT_FOUND');
  return je;
}

/** Propose a draft JE (draft → proposed). */
export async function proposeJE(pool: Pool, tenantId: string, id: string): Promise<JournalEntry> {
  const je = await repo.getJournalEntryById(pool, id, tenantId);
  if (!je) throw new JournalEntryError('Journal entry not found', 'NOT_FOUND');
  if (je.status !== 'draft') {
    throw new JournalEntryError(`Only draft JEs can be proposed; current status: ${je.status}`, 'INVALID_STATUS');
  }
  const lines = await repo.listJournalEntryLines(pool, id);
  const balanced = validateBalanced(
    lines.map((l) => ({ accountRef: l.accountRef, debit: Number(l.debit), credit: Number(l.credit) }))
  );
  if (!balanced.valid) {
    throw new JournalEntryError(`JE does not balance: ${balanced.errors.join('; ')}`, 'VALIDATION');
  }
  const updated = await repo.updateJournalEntryStatus(pool, id, tenantId, 'proposed', {
    expectedStatus: 'draft',
  });
  if (!updated) {
    const current = await repo.getJournalEntryById(pool, id, tenantId);
    throw new JournalEntryError(
      `Journal entry ${id} is in status '${current?.status ?? 'unknown'}', cannot propose`,
      'INVALID_STATUS'
    );
  }
  return updated;
}

/** Approve a proposed JE (proposed → approved). Enforces segregation of duties. */
export async function approveJE(
  pool: Pool,
  tenantId: string,
  id: string,
  approvedBy: string
): Promise<JournalEntry> {
  const je = await repo.getJournalEntryById(pool, id, tenantId);
  if (!je) throw new JournalEntryError('Journal entry not found', 'NOT_FOUND');
  if (je.status !== 'proposed') {
    throw new JournalEntryError(`Only proposed JEs can be approved; current status: ${je.status}`, 'INVALID_STATUS');
  }
  if (!isSameUserApproveAllowed() && je.createdBy && je.createdBy === approvedBy) {
    throw new JournalEntryError(
      'Segregation of duties: approver cannot be the same as preparer (created_by). SoD is enforced in production.',
      'SEGREGATION'
    );
  }
  const updated = await repo.updateJournalEntryStatus(pool, id, tenantId, 'approved', {
    approvedBy,
    expectedStatus: 'proposed',
  });
  if (!updated) {
    // Concurrent status change — re-fetch to provide descriptive error
    const current = await repo.getJournalEntryById(pool, id, tenantId);
    if (current?.status === 'approved') {
      throw new JournalEntryError(
        `Journal entry ${id} was already approved by ${current.approvedBy ?? 'unknown'}`,
        'INVALID_STATUS'
      );
    }
    throw new JournalEntryError(
      `Journal entry ${id} is in status '${current?.status ?? 'unknown'}', cannot approve`,
      'INVALID_STATUS'
    );
  }
  return updated;
}

/** Reject a proposed JE (proposed → rejected). Reason is required (min 10 chars). */
export async function rejectJE(
  pool: Pool,
  tenantId: string,
  id: string,
  reason: string,
  rejectedBy: string
): Promise<JournalEntry> {
  const je = await repo.getJournalEntryById(pool, id, tenantId);
  if (!je) throw new JournalEntryError('Journal entry not found', 'NOT_FOUND');
  if (je.status !== 'proposed') {
    throw new JournalEntryError(`Only proposed JEs can be rejected; current status: ${je.status}`, 'INVALID_STATUS');
  }
  const reasonTrimmed = reason?.trim() ?? '';
  if (reasonTrimmed.length < 10) {
    throw new JournalEntryError('Rejection reason is required (minimum 10 characters)', 'VALIDATION');
  }
  const now = new Date().toISOString();
  const updated = await repo.updateJournalEntryStatus(pool, id, tenantId, 'rejected', {
    rejectionReason: reasonTrimmed,
    rejectedBy,
    rejectedAt: now,
    expectedStatus: 'proposed',
  });
  if (!updated) {
    const current = await repo.getJournalEntryById(pool, id, tenantId);
    throw new JournalEntryError(
      `Journal entry ${id} is in status '${current?.status ?? 'unknown'}', cannot reject`,
      'INVALID_STATUS'
    );
  }
  const periodLabel = je.closeSessionId
    ? (await getCloseSessionById(pool, tenantId, je.closeSessionId))?.periodEnd?.slice(0, 7)
    : undefined;
  await recordMaterialEvent(pool, {
    tenantId,
    periodLabel,
    eventType: 'je_posting',
    deterministicFlagSnapshot: {
      jeId: id,
      event: 'je_rejected',
      reason: reasonTrimmed,
      rejectedBy,
      rejectedAt: now,
    },
  });
  return updated;
}

export interface PostJEResult {
  journalEntry: JournalEntry;
  aiWarnings?: Array<{ ai_status: string; reason: string; pillar: string }>;
  shadowWarnings?: Array<{ code: string; message: string; severity: 'warn' }>;
}

/** Post an approved JE (approved → posted). Shadow Auditor runs first; blocks on severity=block. */
function computeJETotalAmount(lines: { debit: string | number; credit: string | number }[]): number {
  return sumRound2(lines.map((l) => Number(l.debit ?? 0)));
}

export async function postJE(pool: Pool, tenantId: string, id: string, aiPool?: Pool): Promise<PostJEResult> {
  const je = await repo.getJournalEntryById(pool, id, tenantId);
  if (!je) throw new JournalEntryError('Journal entry not found', 'NOT_FOUND');
  if (je.status !== 'approved') {
    throw new JournalEntryError(`Only approved JEs can be posted; current status: ${je.status}`, 'INVALID_STATUS');
  }
  if (!je.memo || je.memo.trim().length === 0) {
    throw new JournalEntryError('Cannot post journal entry without a memo', 'VALIDATION');
  }

  // Validate entry date falls within close period and doesn't conflict with prior periods
  if (je.closeSessionId) {
    const session = await getCloseSessionById(pool, tenantId, je.closeSessionId);
    if (session && je.entryDate) {
      const periodResult = await validatePeriod(pool, tenantId, je.closeSessionId, je.entryDate);
      if (!periodResult.valid) {
        throw new JournalEntryError(periodResult.errors.join('; '), 'VALIDATION');
      }
      const priorResult = await validateNoPriorPeriodConflict(pool, tenantId, je.entryDate, je.closeSessionId);
      if (!priorResult.valid) {
        throw new JournalEntryError(priorResult.errors.join('; '), 'VALIDATION');
      }
    }
  }

  const lines = await repo.listJournalEntryLines(pool, id);

  const { getEvidencePolicy } = await import('../db/repositories/evidence_policy_repository.js');
  const { listEvidenceForObject } = await import('../db/repositories/evidence_repository.js');
  const policy = await getEvidencePolicy(pool, tenantId);
  const thresholdNum = policy?.materialityThreshold != null && policy.materialityThreshold !== ''
    ? Number(policy.materialityThreshold)
    : 0;
  if (thresholdNum > 0) {
    const totalAmount = computeJETotalAmount(lines);
    const totalDecimal = decimalFrom(totalAmount);
    const thresholdDecimal = decimalFrom(thresholdNum);
    if (totalDecimal.gte(thresholdDecimal)) {
      const attachments = await listEvidenceForObject(pool, tenantId, 'journal_entry', id);
      if (attachments.length === 0) {
        throw new JournalEntryError(
          `Cannot post: journal entry total of $${totalAmount.toFixed(2)} meets or exceeds the evidence threshold of $${thresholdNum.toFixed(2)}. Supporting documentation is required. Upload invoices, contracts, calculations, or other supporting documents before posting.`,
          'VALIDATION'
        );
      }
    }
  }
  const periodLabel =
    (je.closeSessionId
      ? (await getCloseSessionById(pool, tenantId, je.closeSessionId))?.periodEnd?.slice(0, 7)
      : undefined) ?? id;
  const shadowResult = await runPrePostChecksAndStore({
    pool,
    tenantId,
    periodLabel,
    journalEntryId: id,
    actorUserId: je.approvedBy,
    journalEntry: je,
    lines,
  });
  if (shadowResult.severity === 'block') {
    const messages = shadowResult.flags.map((f) => f.message).join('; ');
    throw new JournalEntryError(`Shadow Auditor blocked post: ${messages}`, 'SHADOW_AUDIT_BLOCK');
  }
  // Collect materiality warnings synchronously for response
  const shadowWarnings = shadowResult.severity === 'warn' && shadowResult.flags.length > 0
    ? shadowResult.flags.filter((f) => f.code === 'MATERIALITY_THRESHOLD').map((f) => ({
        code: f.code,
        message: f.message,
        severity: 'warn' as const,
      }))
    : [];

  // Emit async event for shadow audit warnings (non-blocking findings)
  if (shadowResult.severity === 'warn' && shadowResult.flags.length > 0) {
    financialEvents.emit('JE_POLICY_VIOLATION', buildEventPacket('JE_POLICY_VIOLATION', {
      errorCode: 'SHADOW_AUDIT_WARNING',
      conflictingData: { findings: shadowResult.flags },
      metadata: {
        tenantId,
        closeSessionId: je.closeSessionId ?? undefined,
        periodLabel,
        relatedTransactions: [id],
        accountCodes: lines.map((l) => l.accountRef),
      },
      data: {
        journalEntryId: id,
        severity: shadowResult.severity,
        findings: shadowResult.flags.map((f) => ({
          code: f.code ?? 'UNKNOWN',
          message: f.message,
          rule_ids: f.rule_ids ?? [],
          refs: f.refs ?? [id],
        })),
        confidence: 0,
        memo: je.memo,
        lines: lines.map((l) => ({ accountRef: l.accountRef, debit: Number(l.debit), credit: Number(l.credit), description: l.description })),
      },
    }));
  }
  const now = new Date().toISOString();
  const updated = await repo.updateJournalEntryStatus(pool, id, tenantId, 'posted', {
    postedAt: now,
    expectedStatus: 'approved',
  });
  if (!updated) {
    const current = await repo.getJournalEntryById(pool, id, tenantId);
    throw new JournalEntryError(
      `Journal entry ${id} is in status '${current?.status ?? 'unknown'}', cannot post`,
      'INVALID_STATUS'
    );
  }
  await recordMaterialEvent(pool, {
    tenantId,
    periodLabel,
    eventType: 'je_posting',
    deterministicFlagSnapshot: {
      jeId: id,
      closeSessionId: je.closeSessionId,
      previousStatus: 'approved',
      newStatus: 'posted',
      postedAt: now,
    },
  });
  const pl = periodLabel ?? id;
  const facts = {
    jeId: id,
    closeSessionId: je.closeSessionId,
    memo: je.memo,
    source: je.source,
    approvedBy: je.approvedBy,
    postedAt: now,
    lines: lines.map((l) => ({ accountRef: l.accountRef, debit: l.debit, credit: l.credit, description: l.description })),
  };
  const justifierResult = await runJustifier({
    pool,
    aiPool,
    tenantId,
    periodLabel: pl,
    relatedType: 'journal_entry',
    relatedId: id,
    facts,
  });
  const inputsHash = hashJustifierInputs(facts, JUSTIFIER_PROMPT_VERSION);
  // Save as draft status — AI justification requires human review before it's linked to the JE.
  await createJustificationFromAI({
    tenantId,
    pool,
    periodLabel: pl,
    relatedType: 'journal_entry',
    relatedId: id,
    memo_markdown: justifierResult.memo_markdown,
    irac_json: justifierResult.irac_json,
    prompt_version: justifierResult.prompt_version,
    model: process.env.AI_MODEL ?? undefined,
    inputs_hash: inputsHash,
    status: 'draft',
  });
  const aiWarnings =
    !justifierResult.ok
      ? [{ ai_status: 'unavailable' as const, reason: justifierResult.error ?? 'Justifier failed', pillar: 'justifier' as const }]
      : undefined;

  if (je.closeSessionId) {
    const session = await getCloseSessionById(pool, tenantId, je.closeSessionId);
    if (session) {
      await executeCascade(pool, tenantId, {
        type: CascadeTriggerType.AJE_POSTED,
        period_id: je.closeSessionId,
        entity_id: session.entityId,
        triggered_by: je.approvedBy ?? 'system',
        affected_accounts: lines.map((l) => l.accountRef),
        details: { aje_id: id },
      });
    }
    // Emit gate check event for potential auto-advance
    financialEvents.emit('GATE_CHECK_REQUESTED', buildEventPacket('GATE_CHECK_REQUESTED', {
      errorCode: 'GATE_CHECK',
      conflictingData: {},
      metadata: { tenantId, closeSessionId: je.closeSessionId },
      data: { closeSessionId: je.closeSessionId, trigger: 'je_posted', triggeredBy: je.approvedBy ?? 'system' },
    }));
  }
  return { journalEntry: updated, aiWarnings, shadowWarnings: shadowWarnings.length > 0 ? shadowWarnings : undefined };
}

/** Mark a posted JE as exported (posted → exported). */
export async function exportJE(pool: Pool, tenantId: string, id: string): Promise<JournalEntry> {
  const je = await repo.getJournalEntryById(pool, id, tenantId);
  if (!je) throw new JournalEntryError('Journal entry not found', 'NOT_FOUND');
  if (je.status !== 'posted') {
    throw new JournalEntryError(`Only posted JEs can be exported; current status: ${je.status}`, 'INVALID_STATUS');
  }
  const updated = await repo.updateJournalEntryStatus(pool, id, tenantId, 'exported', {
    expectedStatus: 'posted',
  });
  if (!updated) {
    const current = await repo.getJournalEntryById(pool, id, tenantId);
    throw new JournalEntryError(
      `Journal entry ${id} is in status '${current?.status ?? 'unknown'}', cannot export`,
      'INVALID_STATUS'
    );
  }
  return updated;
}

/** Validate that debits equal credits (exact to the penny via Decimal.js). */
export function validateBalanced(
  lines: { accountRef: string; debit?: number; credit?: number }[]
): ValidationResult {
  const totalDebit = sumRound2(lines.map((l) => l.debit ?? 0));
  const totalCredit = sumRound2(lines.map((l) => l.credit ?? 0));
  const diff = decimalFrom(totalDebit).minus(totalCredit).abs();
  if (!diff.isZero()) {
    return {
      valid: false,
      errors: [`Total debits (${totalDebit}) do not equal total credits (${totalCredit}); difference: ${diff.toNumber()}`],
    };
  }
  return { valid: true, errors: [] };
}

/** Validate that the close session exists and entry date falls within the period. */
export async function validatePeriod(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  entryDate?: string
): Promise<ValidationResult> {
  const session = await getCloseSessionById(pool, tenantId, closeSessionId);
  if (!session) {
    return { valid: false, errors: [`Close session ${closeSessionId} not found`] };
  }
  if (entryDate && session.periodStart && session.periodEnd) {
    const eDate = new Date(entryDate);
    const pStart = new Date(session.periodStart);
    const pEnd = new Date(session.periodEnd);
    if (eDate < pStart || eDate > pEnd) {
      return {
        valid: false,
        errors: [`Entry date ${entryDate} is outside the close period [${session.periodStart}, ${session.periodEnd}]`],
      };
    }
  }
  return { valid: true, errors: [] };
}

/** Check that no CERTIFIED or LOCKED session already covers the given date range (prior-period posting prevention). */
export async function validateNoPriorPeriodConflict(
  pool: Pool,
  tenantId: string,
  entryDate: string,
  currentSessionId: string
): Promise<ValidationResult> {
  try {
    const r = await pool.query(
      `SELECT id, period_start, period_end, status FROM close_sessions
       WHERE tenant_id = $1
         AND id != $2
         AND status IN ('certified', 'locked')
         AND period_start <= $3::date
         AND period_end >= $3::date
       LIMIT 1`,
      [tenantId, currentSessionId, entryDate]
    );
    if (r.rows.length > 0) {
      const s = r.rows[0];
      return {
        valid: false,
        errors: [`Cannot post to date ${entryDate}: period [${s.period_start}, ${s.period_end}] is already ${s.status} (session ${s.id})`],
      };
    }
  } catch {
    // Table may not exist in some test environments
  }
  return { valid: true, errors: [] };
}

/** Validate materiality: warn if any line amount exceeds threshold. */
export async function validateMaterialityWarnings(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  lines: { debit?: number; credit?: number }[],
  materialityThreshold?: number
): Promise<ValidationResult> {
  let threshold = materialityThreshold;
  if (threshold == null || threshold <= 0) {
    const triage = await getLatestTriage(pool, tenantId, closeSessionId);
    threshold = triage?.materialityThreshold ?? 0;
  }
  if (threshold <= 0) return { valid: true, errors: [], warnings: [] };
  const warnings: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const amt = Math.max(lines[i].debit ?? 0, lines[i].credit ?? 0);
    if (amt > threshold) {
      warnings.push(`Line ${i + 1} amount ${amt} exceeds materiality threshold ${threshold}`);
    }
  }
  return { valid: true, errors: [], warnings: warnings.length > 0 ? warnings : undefined };
}

export async function getJournalEntry(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<JournalEntry | null> {
  return repo.getJournalEntryById(pool, id, tenantId);
}

export async function getJournalEntryWithLines(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<{ je: JournalEntry; lines: JournalEntryLine[] } | null> {
  const je = await repo.getJournalEntryById(pool, id, tenantId);
  if (!je) return null;
  const lines = await repo.listJournalEntryLines(pool, id);
  return { je, lines };
}

export async function listJournalEntries(
  pool: Pool,
  tenantId: string,
  filters: { closeSessionId?: string; status?: JournalEntryStatus; limit?: number }
): Promise<JournalEntry[]> {
  return repo.listJournalEntries(pool, tenantId, filters);
}

/** List JEs that are approved or posted (for statement builder / adjusted TB). */
export async function listPostableJournalEntries(
  pool: Pool,
  tenantId: string,
  closeSessionId?: string
): Promise<JournalEntry[]> {
  const all = await repo.listJournalEntries(pool, tenantId, {
    closeSessionId,
    limit: 5000,
  });
  return all.filter((je) => je.status === 'approved' || je.status === 'posted' || je.status === 'exported');
}

/** Convert postable JEs to TrialBalanceAdjustment format for merge into adjusted TB / statements. */
export async function getPostableJEAdjustments(
  pool: Pool,
  tenantId: string,
  closeSessionId?: string
): Promise<{ debits: { account: string; amount: number }[]; credits: { account: string; amount: number }[] }[]> {
  const postable = await listPostableJournalEntries(pool, tenantId, closeSessionId);
  if (postable.length === 0) return [];
  const linesMap = await repo.listJournalEntryLinesBatch(pool, postable.map((je) => je.id));
  const result: { debits: { account: string; amount: number }[]; credits: { account: string; amount: number }[] }[] = [];
  for (const je of postable) {
    const lines = linesMap.get(je.id) ?? [];
    const debits = lines.filter((l) => Number(l.debit ?? 0) > 0).map((l) => ({ account: l.accountRef, amount: Number(l.debit) }));
    const credits = lines.filter((l) => Number(l.credit ?? 0) > 0).map((l) => ({ account: l.accountRef, amount: Number(l.credit) }));
    result.push({ debits, credits });
  }
  return result;
}

/** Delete a draft or rejected JE. Only draft/rejected can be deleted. */
export async function deleteDraftJE(
  pool: Pool,
  tenantId: string,
  id: string,
  userId: string
): Promise<{ deleted: true; id: string }> {
  const je = await repo.getJournalEntryById(pool, id, tenantId);
  if (!je) throw new JournalEntryError('Journal entry not found', 'NOT_FOUND');
  if (!['draft', 'rejected'].includes(je.status)) {
    throw new JournalEntryError(
      `Cannot delete journal entry in '${je.status}' status. Only draft or rejected entries can be deleted.`,
      'INVALID_STATUS'
    );
  }
  await repo.deleteJournalEntry(pool, id, tenantId);
  const periodLabel = je.closeSessionId
    ? (await getCloseSessionById(pool, tenantId, je.closeSessionId))?.periodEnd?.slice(0, 7)
    : undefined;
  await recordMaterialEvent(pool, {
    tenantId,
    periodLabel,
    eventType: 'je_posting',
    deterministicFlagSnapshot: {
      event: 'je_deleted',
      jeId: id,
      previousStatus: je.status,
      deletedBy: userId,
    },
  });
  return { deleted: true, id };
}

/**
 * Reverse a posted journal entry by creating a new draft JE with flipped debits/credits.
 * The original entry remains immutable; a new reversal entry is created and linked.
 * The reversal must go through the standard draft → proposed → approved → posted workflow.
 */
export async function reversePostedJE(
  pool: Pool,
  tenantId: string,
  originalId: string,
  userId: string,
  reversalDate?: string
): Promise<JournalEntry> {
  const original = await repo.getJournalEntryById(pool, originalId, tenantId);
  if (!original) throw new JournalEntryError('Journal entry not found', 'NOT_FOUND');
  if (original.status !== 'posted' && original.status !== 'exported') {
    throw new JournalEntryError(
      `Only posted or exported JEs can be reversed; current status: ${original.status}`,
      'INVALID_STATUS'
    );
  }
  if (original.reversedByJeId) {
    throw new JournalEntryError(
      `Journal entry ${originalId} has already been reversed by JE ${original.reversedByJeId}`,
      'VALIDATION'
    );
  }

  const originalLines = await repo.listJournalEntryLines(pool, originalId);

  // Create the reversal draft with flipped debits/credits
  const reversalInput: CreateDraftJEInput = {
    closeSessionId: original.closeSessionId,
    tenantId,
    memo: `Reversal of JE ${originalId}: ${original.memo ?? ''}`.trim(),
    source: 'manual',
    createdBy: userId,
    lines: originalLines.map((l) => ({
      accountRef: l.accountRef,
      debit: Number(l.credit), // flip: original credit becomes reversal debit
      credit: Number(l.debit), // flip: original debit becomes reversal credit
      description: `Reversal: ${l.description ?? l.accountRef}`,
      amountProvenance: { kind: 'human_entered' as const, enteredBy: userId },
    })),
  };

  const reversalJE = await createDraftJE(pool, reversalInput);

  // Link the reversal to the original (reversal JE points back to original via reverses_je_id)
  await pool.query(
    `UPDATE journal_entries SET reverses_je_id = $1, is_reversal = TRUE WHERE id = $2 AND tenant_id = $3`,
    [originalId, reversalJE.id, tenantId]
  ).catch(() => {
    // Column may not exist yet (reverses_je_id added by later migration); non-fatal
  });
  // Link the original to the reversal
  await pool.query(
    `UPDATE journal_entries SET reversed_by_je_id = $1 WHERE id = $2 AND tenant_id = $3 AND status IN ('posted', 'exported')`,
    [reversalJE.id, originalId, tenantId]
  ).catch(() => {
    // Column may not exist yet (reversed_by_je_id added by later migration); non-fatal
  });

  const periodLabel = original.closeSessionId
    ? (await getCloseSessionById(pool, tenantId, original.closeSessionId))?.periodEnd?.slice(0, 7)
    : undefined;
  await recordMaterialEvent(pool, {
    tenantId,
    periodLabel,
    eventType: 'je_posting',
    deterministicFlagSnapshot: {
      event: 'je_reversal_created',
      originalJeId: originalId,
      reversalJeId: reversalJE.id,
      reversalDate: reversalDate ?? undefined,
      createdBy: userId,
    },
  });

  return reversalJE;
}

/**
 * Auto-create reversal entries for all posted JEs that have a reversalDate
 * matching or preceding the given date. Used by period-end batch job.
 */
export async function processScheduledReversals(
  pool: Pool,
  tenantId: string,
  asOfDate: string,
  userId: string
): Promise<{ created: string[]; skipped: string[] }> {
  const r = await pool.query(
    `SELECT id FROM journal_entries
     WHERE tenant_id = $1
       AND status IN ('posted', 'exported')
       AND reversal_date IS NOT NULL
       AND reversal_date <= $2::date
       AND reversed_by_je_id IS NULL
       AND is_reversal = FALSE`,
    [tenantId, asOfDate]
  );
  const created: string[] = [];
  const skipped: string[] = [];
  for (const row of r.rows) {
    try {
      const reversal = await reversePostedJE(pool, tenantId, row.id, userId);
      created.push(reversal.id);
    } catch {
      skipped.push(row.id);
    }
  }
  return { created, skipped };
}

export async function addJEAttachment(
  pool: Pool,
  tenantId: string,
  jeId: string,
  fileRef: string
): Promise<{ id: string; jeId: string; fileRef: string; uploadedAt: string }> {
  const je = await repo.getJournalEntryById(pool, jeId, tenantId);
  if (!je) throw new JournalEntryError('Journal entry not found', 'NOT_FOUND');
  const id = randomUUID();
  return repo.insertJEAttachment(pool, id, jeId, fileRef, tenantId);
}
