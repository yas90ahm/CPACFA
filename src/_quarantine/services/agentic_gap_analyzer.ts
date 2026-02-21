/**
 * Agentic anomaly and gap analyzer (LLM-driven).
 * Also suggests journal entry proposals to fix trial balance imbalance (HITL ingest).
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { DataGap } from '../agents/cpa_brain.js';

/** Suggested correcting line to fix trial balance imbalance (debits = credits). */
export interface JournalEntryProposal {
  accountName: string;
  debit?: number;
  credit?: number;
  memo?: string;
}

const SYSTEM = [
  'You are a CPA-grade reviewer.',
  'Given ledger summaries and metadata, propose missing-information gaps.',
  'Return ONLY JSON array of gap objects with fields:',
  '{ type, title, description, urgency, suggestion }.',
  'type must be one of: missing_liability, missing_asset, missing_identity, missing_transactions, agentic_anomaly.',
  'urgency must be high or medium.',
].join(' ');

const SYSTEM_IMBALANCE = [
  'You are a CPA-grade reviewer. Given an out-of-balance trial balance:',
  'imbalanceAmount (debits - credits) and a list of unmapped or problematic rows.',
  'Propose one or more journal entry lines that would correct the imbalance so Sum(Debits) = Sum(Credits).',
  'Return ONLY a JSON array of objects with fields: accountName (string), debit (number, optional), credit (number, optional), memo (string, optional).',
  'Exactly one of debit or credit must be set per line; total of proposed debits minus credits should equal the imbalance (sign-aware).',
].join(' ');

export async function analyzeGapsAgentic(input: {
  ledgerSummary: string;
  metadata: { taxId?: string; businessNumber?: string; transactionCount?: number };
}): Promise<DataGap[]> {
  const prompt = [
    `ledgerSummary=${input.ledgerSummary}`,
    `metadata=${JSON.stringify(input.metadata)}`,
    'Return JSON only.',
  ].join('\n');
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 500,
    parse: (raw) =>
      parseGaps(raw).map((g) => ({
        id: `gap-agentic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: g.type,
        title: g.title,
        description: g.description,
        urgency: g.urgency,
        suggestion: g.suggestion,
      })),
    fallback: [],
  });
}

/**
 * Analyze imbalance and unmapped rows; return suggested journal entries to fix trial balance.
 * Used when ingest is imbalanced and data is staged in HITL.
 */
export async function suggestJournalEntriesForImbalance(input: {
  imbalanceAmount: number;
  totalDebits: number;
  totalCredits: number;
  unmappedRows: Array<{ accountName: string; debit?: number; credit?: number }>;
}): Promise<JournalEntryProposal[]> {
  const prompt = [
    `imbalanceAmount=${input.imbalanceAmount} (totalDebits - totalCredits = ${input.totalDebits - input.totalCredits})`,
    `totalDebits=${input.totalDebits}, totalCredits=${input.totalCredits}`,
    `unmappedOrProblematicRows=${JSON.stringify(input.unmappedRows.slice(0, 50))}`,
    'Return ONLY a JSON array of journal entry proposals: [{ accountName, debit?, credit?, memo? }].',
  ].join('\n');
  return callLLMWithFallback({
    system: SYSTEM_IMBALANCE,
    prompt,
    maxTokens: 600,
    parse: (raw) => parseJournalProposals(raw),
    fallback: [],
  });
}

function parseJournalProposals(raw: string): JournalEntryProposal[] {
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(slice) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is JournalEntryProposal =>
        x != null &&
        typeof x === 'object' &&
        typeof (x as JournalEntryProposal).accountName === 'string'
    ) as JournalEntryProposal[];
  } catch {
    return [];
  }
}

function parseGaps(raw: string): Array<Omit<DataGap, 'id'>> {
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(slice) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as Array<Omit<DataGap, 'id'>>;
  } catch {
    return [];
  }
}
