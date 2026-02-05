/**
 * Policy snippets for Shadow Auditor (internal policy, not full GAAP).
 */

import type { ShadowAuditorSnippet } from './prompts/shadow_auditor.prompt.js';

const DEFAULTS: ShadowAuditorSnippet[] = [
  {
    rule_id: 'provenance_required',
    title: 'Provenance required',
    snippet_markdown: 'Every non-zero amount must have valid amountProvenance (ledger_exact | engine_calculation | human_entered).',
  },
  {
    rule_id: 'no_ai_math',
    title: 'No AI math',
    snippet_markdown: 'Amounts are as provided; the system does not compute or change amounts in this gate.',
  },
  {
    rule_id: 'reclass_source_ref',
    title: 'Reclass requires source ref',
    snippet_markdown: 'Reclassifications should reference a source document or line item where applicable.',
  },
  {
    rule_id: 'required_actor',
    title: 'Actor required',
    snippet_markdown: 'Posting or applying adjustments requires an identified actor (user or system).',
  },
  {
    rule_id: 'required_period',
    title: 'Period label required',
    snippet_markdown: 'Period label must be present for audit trail and period lock checks.',
  },
  {
    rule_id: 'documentation_unusual',
    title: 'Documentation for unusual entries',
    snippet_markdown: 'Unusual or one-off entries should have supporting documentation or memo.',
  },
  {
    rule_id: 'related_party_flag',
    title: 'Related-party flag',
    snippet_markdown: 'Related-party or designated restricted accounts should be flagged for review (warn).',
  },
  {
    rule_id: 'large_one_off_flag',
    title: 'Large one-off flag',
    snippet_markdown: 'Unusually large single-line entries may be flagged for review (warn); do not compute amounts.',
  },
  {
    rule_id: 'block_missing_required_fields',
    title: 'Block if missing required fields',
    snippet_markdown: 'Block if critical fields are missing: actor, periodLabel, or balanced lines for JE.',
  },
  {
    rule_id: 'negative_amounts_block',
    title: 'Negative amounts block',
    snippet_markdown: 'Debit and credit must be non-negative per double-entry convention.',
  },
  {
    rule_id: 'zero_line_warn',
    title: 'Zero line warn',
    snippet_markdown: 'Lines with zero debit and zero credit may be flagged as no movement (warn).',
  },
  {
    rule_id: 'materiality_threshold',
    title: 'Materiality threshold',
    snippet_markdown: 'When materiality threshold is provided, lines exceeding it may be flagged (warn).',
  },
];

export function getDefaultSnippetsForShadowAuditor(): ShadowAuditorSnippet[] {
  return [...DEFAULTS];
}
