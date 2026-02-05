/**
 * Substance-over-form protocol (embedded leases): semantic LLM assessment of
 * "Control of an Identified Asset" per IFRS 16 / ASC 842. Flag-only; no auto-execute.
 */

import type { Pool } from 'pg';
import type { ProfessionalReviewInput } from '../types/professional_review.js';
import type { CreateProfessionalAuditFlagInput } from '../db/repositories/professional_audit_flags_repository.js';
import { callLLMWithFallback } from '../llm/callWithFallback.js';

const EMBEDDED_LEASE_KEYWORDS = [
  'identified asset',
  'right to use',
  'specific asset',
  'control of',
  'substantially all',
  'lease term',
  'fixed payment',
  'dedicated servers',
  'exclusive facility access',
  // High-risk account-name patterns (e.g. Service Agreement) so fallback catches when LLM misses
  'service agreement',
  'service contract',
  'long-term service',
  'facility agreement',
  'equipment use',
];

/** Principle-based: trigger reflective "right to control" check even when legal labels avoid "lease". */
const PRINCIPLE_BASED_KEYWORDS = [
  'exclusive use',
  'exclusive right',
  'designated capacity',
  'designated asset',
  'designated unit',
  'mobile infrastructure',
  'capacity unit',
  'right to direct',
];

const EXPENSE_LINE_PATTERNS = /service|maintenance|subscription|facility|equipment use|rent/i;

/** Materiality threshold (absolute amount): high-value service-type lines get deterministic fallback flag when LLM says no. */
const EMBEDDED_LEASE_MATERIALITY = 1_000_000;

const SUBSTANCE_OVER_FORM_SYSTEM = `You are a lease specialist under ASC 842 and IFRS 16. Given contract or expense text, determine whether it describes a LEASE: the customer has the right to control the use of an IDENTIFIED ASSET for a period of time in exchange for consideration. Consider: (1) Is there an identified asset (specific item, or capacity that is physically distinct)? (2) Does the customer have the right to obtain substantially all economic benefits from use? (3) Does the customer have the right to direct how and for what purpose the asset is used (e.g. no substantive substitution rights by the supplier)? Reply with a single JSON object only: { "hasEmbeddedLease": true or false, "rationale": "brief reason" }.`;

const REFLECTIVE_SYSTEM =
  'You are a lease specialist. Given text that mentions exclusive use or designated capacity, determine whether the customer has the right to direct how and for what purpose the asset is used (control). Reply with JSON only: { "hasControlRights": true or false, "rationale": "brief reason" }.';
const REFLECTIVE_PROMPT_PREFIX = 'Contract/expense text (excerpt):\n';

function parseEmbeddedLeaseResponse(raw: string): { hasEmbeddedLease: boolean; rationale: string } {
  try {
    const trimmed = raw.trim().replace(/^```json?\s*|\s*```$/g, '');
    const p = JSON.parse(trimmed) as { hasEmbeddedLease?: boolean; rationale?: string };
    return {
      hasEmbeddedLease: p.hasEmbeddedLease === true,
      rationale: typeof p.rationale === 'string' ? p.rationale : 'No rationale',
    };
  } catch {
    return { hasEmbeddedLease: false, rationale: 'Unparseable or error' };
  }
}

function keywordScanMatches(text: string): boolean {
  const lower = text.toLowerCase();
  return EMBEDDED_LEASE_KEYWORDS.some((kw) => lower.includes(kw));
}

function principleBasedKeywordMatches(text: string): boolean {
  const lower = text.toLowerCase();
  return PRINCIPLE_BASED_KEYWORDS.some((kw) => lower.includes(kw));
}

function parseReflectiveResponse(raw: string): { hasControlRights: boolean; rationale: string } {
  try {
    const trimmed = raw.trim().replace(/^```json?\s*|\s*```$/g, '');
    const p = JSON.parse(trimmed) as { hasControlRights?: boolean; rationale?: string };
    return {
      hasControlRights: p.hasControlRights === true,
      rationale: typeof p.rationale === 'string' ? p.rationale : 'No rationale',
    };
  } catch {
    return { hasControlRights: false, rationale: 'Unparseable or error' };
  }
}

function pushSubstanceFlag(
  flags: Omit<CreateProfessionalAuditFlagInput, 'tenantId' | 'periodLabel' | 'runId'>[],
  text: string,
  sourceId?: string
): void {
  flags.push({
    category: 'substance_over_form',
    severity: 'medium',
    message: 'Contract or expense line may contain an embedded lease (right to use an identified asset).',
    recommendation: 'Reclassify as lease under ASC 842 / IFRS 16; book ROU asset and lease liability.',
    citationStandard: 'ASC 842-10-15-3',
    citationExcerpt: text.slice(0, 200),
    sourceDocumentId: sourceId,
  });
}

/**
 * Run substance-over-form protocol: semantic LLM assessment of Control of an Identified Asset;
 * falls back to keyword scan when LLM is unavailable or unparseable.
 * Returns flags only; does not create leases.
 */
export async function runSubstanceOverForm(
  input: ProfessionalReviewInput,
  _pool: Pool
): Promise<Omit<CreateProfessionalAuditFlagInput, 'tenantId' | 'periodLabel' | 'runId'>[]> {
  const flags: Omit<CreateProfessionalAuditFlagInput, 'tenantId' | 'periodLabel' | 'runId'>[] = [];
  const textSnippets: { text: string; sourceId?: string; amount?: number }[] = [];

  if (input.trialBalance?.entries) {
    for (const e of input.trialBalance.entries) {
      const name = (e as { accountName?: string }).accountName ?? '';
      const debit = Number((e as { debit?: number }).debit) || 0;
      const credit = Number((e as { credit?: number }).credit) || 0;
      const amount = Math.abs(debit - credit) || Math.max(debit, credit);
      if (EXPENSE_LINE_PATTERNS.test(name)) {
        textSnippets.push({ text: name, amount });
      }
    }
  }

  if (input.contracts) {
    for (const c of input.contracts) {
      const topDesc = (c as { description?: string }).description ?? '';
      const pobDesc = (c as { performanceObligations?: Array<{ description?: string }> }).performanceObligations
        ?.map((p) => p.description ?? '')
        .join(' ') ?? '';
      const text = [topDesc, pobDesc].filter(Boolean).join(' ');
      if (text) textSnippets.push({ text, sourceId: (c as { id?: string }).id });
    }
  }

  const toTextArray = (v: string | string[] | undefined): string[] =>
    v == null ? [] : Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [v];
  for (const text of toTextArray(input.contractText)) {
    if (text.trim()) textSnippets.push({ text: text.trim() });
  }
  for (const text of toTextArray(input.leaseDocuments)) {
    if (text.trim()) textSnippets.push({ text: text.trim() });
  }

  for (const { text, sourceId, amount } of textSnippets) {
    const llmResult = await callLLMWithFallback({
      system: SUBSTANCE_OVER_FORM_SYSTEM,
      prompt: `Text to assess:\n${text.slice(0, 2000)}`,
      maxTokens: 300,
      parse: parseEmbeddedLeaseResponse,
      fallback: { hasEmbeddedLease: false, rationale: 'Unparseable or error' },
    });
    if (llmResult.hasEmbeddedLease) {
      pushSubstanceFlag(flags, text, sourceId);
    } else {
      // Fallback: keyword scan when LLM says no or fails
      if (keywordScanMatches(text)) {
        pushSubstanceFlag(flags, text, sourceId);
      } else if (principleBasedKeywordMatches(text)) {
        // Principle-based gate: "exclusive use", "designated capacity", etc. — run reflective "right to control" check
        const reflective = await callLLMWithFallback({
          system: REFLECTIVE_SYSTEM,
          prompt: REFLECTIVE_PROMPT_PREFIX + text.slice(0, 2000),
          maxTokens: 300,
          parse: parseReflectiveResponse,
          fallback: { hasControlRights: false, rationale: 'Unparseable or error' },
        });
        if (reflective.hasControlRights) {
          pushSubstanceFlag(flags, text, sourceId);
        }
      } else if (
        amount != null &&
        amount >= EMBEDDED_LEASE_MATERIALITY &&
        EXPENSE_LINE_PATTERNS.test(text)
      ) {
        // Deterministic fallback: high-value service-type line may contain embedded lease; flag for review
        pushSubstanceFlag(flags, text, sourceId);
      }
    }
  }

  return flags;
}
