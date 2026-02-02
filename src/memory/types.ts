/**
 * Semantic Memory — Types for vectorized storage and retrieval.
 * Stores major decisions, user corrections, and justifications for consistency.
 */

/** Type of memory entry (what to store and how to treat it). */
export type MemoryEntryType = 'decision' | 'user_correction' | 'justification';

/** Metadata for vendor/category consistency (e.g. "Stripe" -> "Software"). */
export interface VendorCategoryMeta {
  vendor: string;
  category: string;
  accountCode?: string;
  accountName?: string;
  period?: string;
  /** Optional citation (e.g. ASC 606). */
  citation?: string;
}

/** Metadata for a justification (rule applied, conclusion). */
export interface JustificationMeta {
  questionOrTopic: string;
  conclusion: string;
  citation?: string;
  accountCode?: string;
}

/** Metadata for a major decision (e.g. classification choice, policy applied). */
export interface DecisionMeta {
  context: string;
  choice: string;
  reason?: string;
  accountCode?: string;
  period?: string;
}

/** Payload by entry type. */
export type MemoryPayload =
  | { type: 'user_correction'; vendorCategory: VendorCategoryMeta }
  | { type: 'justification'; justification: JustificationMeta }
  | { type: 'decision'; decision: DecisionMeta };

/**
 * A single semantic memory entry: vectorized text + metadata.
 * Stored in the vector DB and used for retrieval and consistency checks.
 */
export interface SemanticMemoryEntry {
  id: string;
  /** Entry type for filtering and consistency rules. */
  entryType: MemoryEntryType;
  /** Text that was vectorized (e.g. "User categorized Stripe as Software"). */
  text: string;
  /** Embedding vector (from embedding provider). */
  embedding: number[];
  /** Structured payload for consistency (vendor/category, justification, decision). */
  payload: MemoryPayload;
  /** When stored (ISO). */
  storedAt: string;
}

/** Input to store a user correction (vendor -> category). */
export interface StoreUserCorrectionInput {
  vendor: string;
  category: string;
  accountCode?: string;
  accountName?: string;
  period?: string;
  citation?: string;
  /** Optional note (e.g. "User explicitly chose Software over Merchant Services"). */
  note?: string;
}

/** Input to store a justification. */
export interface StoreJustificationInput {
  questionOrTopic: string;
  conclusion: string;
  citation?: string;
  accountCode?: string;
}

/** Input to store a major decision. */
export interface StoreDecisionInput {
  context: string;
  choice: string;
  reason?: string;
  accountCode?: string;
  period?: string;
}

/** Result of a semantic memory query (e.g. "Have I seen this vendor before?"). */
export interface SemanticMemoryHit {
  entry: SemanticMemoryEntry;
  score: number;
}

/** Result of consistency check: should the agent pause and ask the user? */
export interface ConsistencyCheckResult {
  /** True if no conflicting user correction, or user already confirmed. */
  consistent: boolean;
  /** Previous user correction that conflicts with current agent logic. */
  previousCorrection?: {
    vendor: string;
    category: string;
    period?: string;
    storedAt: string;
  };
  /** Prompt to show the user when inconsistent (e.g. "Last month you categorized 'Stripe' as 'Software'; should I continue doing that or use the new 'Merchant Services' category?"). */
  promptForUser?: string;
}
