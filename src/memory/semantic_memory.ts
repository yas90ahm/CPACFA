/**
 * Semantic Memory — Main API: storage, retrieval, and consistency checks.
 * - Storage: major decisions, user corrections, justifications (vectorized).
 * - Retrieval: "Have I seen this vendor before? How did we categorize it last time?"
 * - Consistency: if agent logic contradicts a previous user correction, return a prompt to ask the user.
 */

import type {
  SemanticMemoryEntry,
  SemanticMemoryHit,
  ConsistencyCheckResult,
  StoreUserCorrectionInput,
  StoreJustificationInput,
  StoreDecisionInput,
} from './types.js';
import { embed } from './embedding.js';
import { upsert as storeUpsert, query as storeQuery, findUserCorrectionsByVendor } from './store.js';

/** Build searchable text for an entry (used for embedding). */
function entryText(entry: { text?: string; payload: SemanticMemoryEntry['payload'] }): string {
  if (entry.text) return entry.text;
  const p = entry.payload;
  if (p.type === 'user_correction') {
    const v = p.vendorCategory;
    return `User categorized ${v.vendor} as ${v.category}${v.accountCode ? ` (${v.accountCode})` : ''}${v.period ? ` in ${v.period}` : ''}.`;
  }
  if (p.type === 'justification') {
    const j = p.justification;
    return `Justification: ${j.questionOrTopic} -> ${j.conclusion}${j.citation ? ` (${j.citation})` : ''}.`;
  }
  if (p.type === 'decision') {
    const d = p.decision;
    return `Decision: ${d.context} -> ${d.choice}${d.reason ? ` (${d.reason})` : ''}.`;
  }
  return '';
}

/**
 * Store a user correction (e.g. "Stripe" -> "Software").
 * Vectorized and stored for retrieval and consistency checks.
 */
export async function storeUserCorrection(input: StoreUserCorrectionInput): Promise<SemanticMemoryEntry> {
  const text =
    input.note ??
    `User categorized ${input.vendor} as ${input.category}${input.accountCode ? ` (${input.accountCode})` : ''}${input.period ? ` in ${input.period}` : ''}.`;
  const embedding = await embed(text);
  const payload = {
    type: 'user_correction' as const,
    vendorCategory: {
      vendor: input.vendor,
      category: input.category,
      accountCode: input.accountCode,
      accountName: input.accountName,
      period: input.period,
      citation: input.citation,
    },
  };
  return storeUpsert({
    id: undefined,
    entryType: 'user_correction',
    text,
    embedding,
    payload,
    storedAt: new Date().toISOString(),
  });
}

/**
 * Store a justification (rule applied, conclusion).
 */
export async function storeJustification(input: StoreJustificationInput): Promise<SemanticMemoryEntry> {
  const text = `Justification: ${input.questionOrTopic} -> ${input.conclusion}${input.citation ? ` (${input.citation})` : ''}.`;
  const embedding = await embed(text);
  const payload = {
    type: 'justification' as const,
    justification: {
      questionOrTopic: input.questionOrTopic,
      conclusion: input.conclusion,
      citation: input.citation,
      accountCode: input.accountCode,
    },
  };
  return storeUpsert({
    id: undefined,
    entryType: 'justification',
    text,
    embedding,
    payload,
    storedAt: new Date().toISOString(),
  });
}

/**
 * Store a major decision (e.g. classification choice, policy applied).
 */
export async function storeDecision(input: StoreDecisionInput): Promise<SemanticMemoryEntry> {
  const text = `Decision: ${input.context} -> ${input.choice}${input.reason ? ` (${input.reason})` : ''}.`;
  const embedding = await embed(text);
  const payload = {
    type: 'decision' as const,
    decision: {
      context: input.context,
      choice: input.choice,
      reason: input.reason,
      accountCode: input.accountCode,
      period: input.period,
    },
  };
  return storeUpsert({
    id: undefined,
    entryType: 'decision',
    text,
    embedding,
    payload,
    storedAt: new Date().toISOString(),
  });
}

/**
 * Query semantic memory (e.g. "Have I seen this vendor before? How did we categorize it last time?").
 * Returns top-k similar entries with scores.
 */
export async function queryMemory(
  queryText: string,
  options?: {
    topK?: number;
    entryTypes?: Array<SemanticMemoryEntry['entryType']>;
    minScore?: number;
  }
): Promise<SemanticMemoryHit[]> {
  const hits = await storeQuery(queryText, options);
  return hits.map(({ entry, score }) => ({ entry, score }));
}

/**
 * Vendor lookup: "Have I seen this vendor before? How did we categorize it last time?"
 * Returns user corrections and related entries for that vendor.
 */
export async function lookupVendor(vendorName: string, options?: { topK?: number }): Promise<SemanticMemoryHit[]> {
  const byVendor = findUserCorrectionsByVendor(vendorName);
  const byQuery = await queryMemory(`Vendor ${vendorName} categorized as`, {
    topK: options?.topK ?? 5,
    entryTypes: ['user_correction', 'decision'],
    minScore: 0.25,
  });
  const seen = new Set<string>();
  const merged: SemanticMemoryHit[] = [];
  for (const e of byVendor) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      merged.push({ entry: e, score: 1 });
    }
  }
  for (const { entry, score } of byQuery) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      merged.push({ entry, score });
    }
  }
  return merged.slice(0, options?.topK ?? 10);
}

/**
 * Consistency check: if the agent's current logic contradicts a previous user correction, return a prompt to ask the user.
 * Example: agent would categorize "Stripe" as "Merchant Services"; user had previously corrected to "Software".
 * Returns { consistent: false, promptForUser: "Last month you categorized 'Stripe' as 'Software'; should I continue doing that or use the new 'Merchant Services' category?" }
 */
export function checkConsistency(
  vendor: string,
  currentCategory: string,
  options?: { period?: string }
): ConsistencyCheckResult {
  const corrections = findUserCorrectionsByVendor(vendor);
  const previous = corrections
    .map((e) => {
      const p = e.payload as { type: 'user_correction'; vendorCategory: { vendor: string; category: string; period?: string } };
      return {
        vendor: p.vendorCategory.vendor,
        category: p.vendorCategory.category,
        period: p.vendorCategory.period,
        storedAt: e.storedAt,
      };
    })
    .filter((c) => c.category.toLowerCase().trim() !== currentCategory.toLowerCase().trim());

  if (previous.length === 0) {
    return { consistent: true };
  }

  const latest = previous[0];
  const promptForUser =
    latest.period || options?.period
      ? `Last ${latest.period || options?.period} you categorized '${latest.vendor}' as '${latest.category}'; should I continue doing that or use the new '${currentCategory}' category?`
      : `You previously categorized '${latest.vendor}' as '${latest.category}'; should I continue doing that or use the new '${currentCategory}' category?`;

  return {
    consistent: false,
    previousCorrection: {
      vendor: latest.vendor,
      category: latest.category,
      period: latest.period,
      storedAt: latest.storedAt,
    },
    promptForUser,
  };
}

export { getById, listAll, clearStore } from './store.js';
