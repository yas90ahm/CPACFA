/**
 * Advisory Interface — Type barrier for AI outputs.
 *
 * AI may ONLY return suggestions or narratives. All AI outputs are branded as
 * AdvisorySuggestion: readonly, no mutation-capable fields, no function refs, no callbacks.
 *
 * This module is the canonical entrypoint for "AI produces advisory-only data".
 * Mutation paths (protocol_bridge, certification, snapshot) must never consume
 * AI output except as display/narrative in advisory storage.
 */

/** Readonly advisory payload — structurally prevents mutation. No functions, no callbacks. */
export type AdvisorySuggestion = readonly Record<string, unknown>;

/** Brand for classifier results — suggestions only, never written to ledger. */
export type ClassifierAdvisory = Readonly<{
  results: ReadonlyArray<Readonly<{
    source_id: string;
    object_type: string;
    fs_placement: string;
    suggested_accounts: readonly string[];
    rule_tags: readonly string[];
    missing_inputs: readonly string[];
    confidence: number;
  }>>;
  prompt_version: string;
}>;

/** Brand for advisor proposals — suggestions only; human must approve before any mutation. */
export type AdvisorAdvisory = Readonly<{
  proposals: ReadonlyArray<Readonly<{
    proposal_id: string;
    type: string;
    rationale: string;
    rule_ids: readonly string[];
    confidence: number;
    requires_human_confirmation: boolean;
    lines: ReadonlyArray<Readonly<{
      dr_account_key: string;
      cr_account_key: string;
      amount?: number;
      amountProvenance: string;
      sourceRef?: Readonly<{ ledgerLineId?: string; tbRowId?: string }>;
      note?: string;
    }>>;
    missing_inputs: readonly string[];
  }>>;
  prompt_version: string;
}>;

/** Brand for justifier memo — narrative only, stored in tenant_justifications (advisory). */
export type JustifierAdvisory = Readonly<{
  memo_markdown: string;
  irac_json?: Readonly<{ issue: string; rule: string; analysis: string; conclusion: string }>;
  rule_ids?: readonly string[];
  facts_used?: readonly string[];
  prompt_version: string;
}>;

/** Brand for shadow auditor findings — advisory; block severity gates but does not mutate. */
export type ShadowAuditorAdvisory = Readonly<{
  severity: 'ok' | 'warn' | 'block';
  findings: ReadonlyArray<Readonly<{
    code: string;
    message: string;
    rule_ids: readonly string[];
    refs: readonly string[];
  }>>;
  confidence: number;
  prompt_version: string;
}>;
