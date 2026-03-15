/**
 * Shadow Auditor — deterministic + AI pre-post checks for manual entries.
 * Flags and blocks; does not mutate amounts. Results stored for audit and binder.
 * AI shadow audit runs and merges with deterministic; block only when severity='block'.
 * On AI failure: fail-open (do not block), AI result recorded as warn (AI_FAILED).
 */

import type { Pool } from 'pg';
import type { JournalEntry } from '../types/journal_entry.js';
import type { JournalEntryLine } from '../types/journal_entry.js';
import * as findingsRepo from '../db/repositories/tenant_shadow_audit_findings_repository.js';
import type { ShadowAuditFindingItem } from '../db/repositories/tenant_shadow_audit_findings_repository.js';
import { runShadowAudit } from '../ai/ai_orchestrator.js';

export type ShadowAuditSeverity = 'ok' | 'warn' | 'block';

export interface PrePostCheckInput {
  pool: Pool;
  tenantId: string;
  periodLabel: string;
  journalEntryId: string;
  actorUserId?: string;
  /** JE header (for memo/source). */
  journalEntry: JournalEntry;
  /** JE lines (debit/credit per account). */
  lines: JournalEntryLine[];
}

export interface PrePostCheckResult {
  flags: ShadowAuditFindingItem[];
  severity: ShadowAuditSeverity;
  findingId?: string;
}

/** Config: comma-separated account refs that are restricted (e.g. Related Party, Restricted Cash). */
const RESTRICTED_ACCOUNTS_ENV = 'SHADOW_AUDITOR_RESTRICTED_ACCOUNTS';
/** Config: materiality threshold (numeric); lines above this amount trigger warn. */
const MATERIALITY_THRESHOLD_ENV = 'SHADOW_AUDITOR_MATERIALITY_THRESHOLD';

function getRestrictedAccounts(): string[] {
  const raw = process.env[RESTRICTED_ACCOUNTS_ENV];
  if (!raw?.trim()) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function getMaterialityThreshold(): number | null {
  const raw = process.env[MATERIALITY_THRESHOLD_ENV];
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Run all pre-post checks. Deterministic; does not mutate amounts.
 * Returns flags and overall severity; callers store result and block when severity === 'block'.
 */
export function runPrePostChecks(input: PrePostCheckInput): PrePostCheckResult {
  const { lines } = input;
  const flags: ShadowAuditFindingItem[] = [];
  let severity: ShadowAuditSeverity = 'ok';

  const restricted = getRestrictedAccounts();
  const materialityThreshold = getMaterialityThreshold();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const accountRef = (line.accountRef ?? '').trim();
    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);

    // Restricted account check (config-driven) — block
    if (restricted.length > 0) {
      const match = restricted.some(
        (r) => accountRef.toLowerCase() === r.toLowerCase() || accountRef.toLowerCase().includes(r.toLowerCase())
      );
      if (match) {
        flags.push({
          code: 'RESTRICTED_ACCOUNT',
          message: `Account "${accountRef}" is on the restricted/related-party list. Posting blocked.`,
          severity: 'block',
        });
        severity = 'block';
      }
    }

    // Negative debit or credit — block (double-entry convention: non-negative amounts)
    if (debit < 0 || credit < 0) {
      flags.push({
        code: 'NEGATIVE_AMOUNT',
        message: `Line ${i + 1}: debit=${debit}, credit=${credit}. Debit and credit must be non-negative.`,
        severity: 'block',
      });
      severity = 'block';
    }

    // Zero both — block (no financial movement, line serves no purpose)
    if (debit === 0 && credit === 0) {
      flags.push({
        code: 'ZERO_LINE',
        message: `Line ${i + 1}: account "${accountRef}" has zero debit and credit. Lines must have a non-zero debit or credit.`,
        severity: 'block',
      });
      severity = 'block';
    }

    // Materiality threshold — warn when any line amount exceeds configured threshold
    if (materialityThreshold != null && (debit >= materialityThreshold || credit >= materialityThreshold)) {
      flags.push({
        code: 'MATERIALITY_THRESHOLD',
        message: `Line ${i + 1}: amount ${Math.max(debit, credit)} exceeds materiality threshold ${materialityThreshold}.`,
        severity: 'warn',
      });
      if (severity !== 'block') severity = 'warn';
    }
  }

  return { flags, severity };
}

/** Map deterministic flags to items with rule_ids/refs for merged storage. */
function toFindingItems(flags: ShadowAuditFindingItem[], jeId: string): ShadowAuditFindingItem[] {
  return flags.map((f) => ({
    ...f,
    rule_ids: f.rule_ids ?? [],
    refs: f.refs ?? [jeId],
  }));
}

/**
 * Run pre-post checks (deterministic + AI) and persist one merged result.
 * Caller must block post when severity === 'block'. AI failure is fail-open (warn only).
 */
export async function runPrePostChecksAndStore(input: PrePostCheckInput): Promise<PrePostCheckResult> {
  const deterministicResult = runPrePostChecks(input);
  const { pool, tenantId, periodLabel, journalEntryId, actorUserId, journalEntry, lines } = input;

  const facts = {
    jeId: journalEntryId,
    closeSessionId: journalEntry.closeSessionId,
    memo: journalEntry.memo,
    source: journalEntry.source,
    approvedBy: journalEntry.approvedBy,
    lines: lines.map((l) => ({ accountRef: l.accountRef, debit: l.debit, credit: l.credit, description: l.description })),
  };

  const aiResult = await runShadowAudit({
    pool,
    tenantId,
    periodLabel,
    subjectType: 'journal_entry',
    subjectId: journalEntryId,
    facts,
    materialityThreshold: getMaterialityThreshold() ?? undefined,
  });

  const mergedSeverity: ShadowAuditSeverity =
    deterministicResult.severity === 'block' || aiResult.severity === 'block'
      ? 'block'
      : deterministicResult.severity === 'warn' || aiResult.severity === 'warn'
        ? 'warn'
        : 'ok';

  const deterministicItems = toFindingItems(deterministicResult.flags, journalEntryId);
  const aiItems: ShadowAuditFindingItem[] = aiResult.findings.map((f) => ({
    code: f.code,
    message: f.message,
    rule_ids: f.rule_ids,
    refs: f.refs,
  }));
  const mergedFindings = [...deterministicItems, ...aiItems];

  const created = await findingsRepo.createFinding(pool, {
    tenantId,
    periodLabel,
    journalEntryId,
    severity: mergedSeverity,
    findings: mergedFindings,
    actorUserId,
    confidence: aiResult.ok ? aiResult.confidence : undefined,
    promptVersion: aiResult.prompt_version,
    model: process.env.AI_MODEL,
  });

  return {
    flags: mergedFindings,
    severity: mergedSeverity,
    findingId: created.id,
  };
}
