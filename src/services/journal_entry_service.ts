/**
 * Journal Entry service: lifecycle (draft → proposed → approved/posted/exported/rejected),
 * validation (balanced, period, materiality), segregation (approved_by !== created_by unless override).
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type {
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  CreateDraftJEInput,
  ValidationResult,
} from '../types/journal_entry.js';
import * as repo from '../db/repositories/journal_entry_repository.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import { getLatestTriage } from './triage_service.js';
import { recordMaterialEvent } from './audit_ledger_service.js';
import { createJustificationFromAI } from './justification_service.js';
import { runPrePostChecksAndStore } from './shadow_auditor_service.js';
import { runJustifier, hashJustifierInputs } from '../ai/ai_orchestrator.js';
import { JUSTIFIER_PROMPT_VERSION } from '../ai/prompts/justifier.prompt.js';

const ALLOW_SAME_USER_APPROVE =
  process.env.ALLOW_SAME_USER_APPROVE === '1' || process.env.ALLOW_SAME_USER_APPROVE === 'true';

export class JournalEntryError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'VALIDATION' | 'INVALID_STATUS' | 'SEGREGATION' | 'SHADOW_AUDIT_BLOCK'
  ) {
    super(message);
    this.name = 'JournalEntryError';
  }
}

/** Create a draft JE with lines. */
export async function createDraftJE(pool: Pool, input: CreateDraftJEInput): Promise<JournalEntry> {
  const balanced = validateBalanced(input.lines);
  if (!balanced.valid) {
    throw new JournalEntryError(
      `Journal entry must balance: ${balanced.errors.join('; ')}`,
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
    lines.map((l) => ({ accountRef: l.accountRef, debit: l.debit, credit: l.credit }))
  );
  if (!balanced.valid) {
    throw new JournalEntryError(`JE does not balance: ${balanced.errors.join('; ')}`, 'VALIDATION');
  }
  const updated = await repo.updateJournalEntryStatus(pool, id, tenantId, 'proposed');
  return updated!;
}

/** Approve a proposed JE (proposed → approved). Enforces segregation unless ALLOW_SAME_USER_APPROVE. */
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
  if (!ALLOW_SAME_USER_APPROVE && je.createdBy && je.createdBy === approvedBy) {
    throw new JournalEntryError(
      'Segregation of duties: approver cannot be the same as preparer (created_by). Set ALLOW_SAME_USER_APPROVE=1 for single-user override.',
      'SEGREGATION'
    );
  }
  const updated = await repo.updateJournalEntryStatus(pool, id, tenantId, 'approved', {
    approvedBy,
  });
  return updated!;
}

/** Reject a proposed JE (proposed → rejected). */
export async function rejectJE(pool: Pool, tenantId: string, id: string): Promise<JournalEntry> {
  const je = await repo.getJournalEntryById(pool, id, tenantId);
  if (!je) throw new JournalEntryError('Journal entry not found', 'NOT_FOUND');
  if (je.status !== 'proposed') {
    throw new JournalEntryError(`Only proposed JEs can be rejected; current status: ${je.status}`, 'INVALID_STATUS');
  }
  const updated = await repo.updateJournalEntryStatus(pool, id, tenantId, 'rejected');
  return updated!;
}

export interface PostJEResult {
  journalEntry: JournalEntry;
  aiWarnings?: Array<{ ai_status: string; reason: string; pillar: string }>;
}

/** Post an approved JE (approved → posted). Shadow Auditor runs first; blocks on severity=block. */
export async function postJE(pool: Pool, tenantId: string, id: string): Promise<PostJEResult> {
  const je = await repo.getJournalEntryById(pool, id, tenantId);
  if (!je) throw new JournalEntryError('Journal entry not found', 'NOT_FOUND');
  if (je.status !== 'approved') {
    throw new JournalEntryError(`Only approved JEs can be posted; current status: ${je.status}`, 'INVALID_STATUS');
  }
  const lines = await repo.listJournalEntryLines(pool, id);
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
  const now = new Date().toISOString();
  const updated = await repo.updateJournalEntryStatus(pool, id, tenantId, 'posted', {
    postedAt: now,
  });
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
    tenantId,
    periodLabel: pl,
    relatedType: 'journal_entry',
    relatedId: id,
    facts,
  });
  const inputsHash = hashJustifierInputs(facts, JUSTIFIER_PROMPT_VERSION);
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
  });
  const aiWarnings =
    !justifierResult.ok
      ? [{ ai_status: 'unavailable' as const, reason: justifierResult.error ?? 'Justifier failed', pillar: 'justifier' as const }]
      : undefined;
  return { journalEntry: updated!, aiWarnings };
}

/** Mark a posted JE as exported (posted → exported). */
export async function exportJE(pool: Pool, tenantId: string, id: string): Promise<JournalEntry> {
  const je = await repo.getJournalEntryById(pool, id, tenantId);
  if (!je) throw new JournalEntryError('Journal entry not found', 'NOT_FOUND');
  if (je.status !== 'posted') {
    throw new JournalEntryError(`Only posted JEs can be exported; current status: ${je.status}`, 'INVALID_STATUS');
  }
  const updated = await repo.updateJournalEntryStatus(pool, id, tenantId, 'exported');
  return updated!;
}

/** Validate that debits equal credits. */
export function validateBalanced(
  lines: { accountRef: string; debit?: number; credit?: number }[]
): ValidationResult {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    totalDebit += l.debit ?? 0;
    totalCredit += l.credit ?? 0;
  }
  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > 0.001) {
    return {
      valid: false,
      errors: [`Total debits (${totalDebit}) do not equal total credits (${totalCredit}); difference: ${diff}`],
    };
  }
  return { valid: true, errors: [] };
}

/** Validate that the close session exists and period is valid (for future effective-date checks). */
export async function validatePeriod(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<ValidationResult> {
  const session = await getCloseSessionById(pool, tenantId, closeSessionId);
  if (!session) {
    return { valid: false, errors: [`Close session ${closeSessionId} not found`] };
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
  const result: { debits: { account: string; amount: number }[]; credits: { account: string; amount: number }[] }[] = [];
  for (const je of postable) {
    const lines = await repo.listJournalEntryLines(pool, je.id);
    const debits = lines.filter((l) => (l.debit ?? 0) > 0).map((l) => ({ account: l.accountRef, amount: l.debit }));
    const credits = lines.filter((l) => (l.credit ?? 0) > 0).map((l) => ({ account: l.accountRef, amount: l.credit }));
    result.push({ debits, credits });
  }
  return result;
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
  return repo.insertJEAttachment(pool, id, jeId, fileRef);
}
