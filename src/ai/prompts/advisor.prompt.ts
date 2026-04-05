/**
 * Advisor pillar prompt: suggestion-only. No posting, no ledger mutation, no invented amounts.
 */

export const ADVISOR_PROMPT_VERSION = 'advisor_v2.0.0';

export interface AdvisorContext {
  tenantId: string;
  periodLabel: string;
}

export interface AdvisorSnippet {
  rule_id: string;
  title: string;
  snippet_markdown: string;
}

export interface ClassifiedSourceLine {
  source_id: string;
  object_type?: string;
  fs_placement?: string;
  suggested_accounts?: string[];
  rule_tags?: string[];
  accountName?: string;
  debit?: number;
  credit?: number;
  [key: string]: unknown;
}

export interface TbSummary {
  totalDebits?: number;
  totalCredits?: number;
  rowCount?: number;
  [key: string]: unknown;
}

export function buildAdvisorUserPrompt(params: {
  sourceLines: ClassifiedSourceLine[];
  tbSummary: TbSummary;
  coaTaxonomy: Array<{ key: string; label: string }>;
  standards_snippets: AdvisorSnippet[];
  context: AdvisorContext;
}): string {
  const { sourceLines, tbSummary, coaTaxonomy, standards_snippets, context } = params;
  const snippetsBlock =
    standards_snippets.length > 0
      ? standards_snippets
          .map((s) => `- ${s.rule_id}: ${s.title}\n  ${s.snippet_markdown}`)
          .join('\n')
      : 'No specific snippets. Suggest conservatively; require human confirmation.';

  const coaBlock =
    coaTaxonomy.length > 0
      ? coaTaxonomy.map((c) => `${c.key}: ${c.label}`).join('\n')
      : 'No COA taxonomy provided. Use account keys from source or generic hints only.';

  return `You are the Advisor. You suggest only. You do not compute or post.

ALLOWED:
- Propose reclass, accrual/deferral candidates, mapping fixes, lease/revenue candidates.
- Copy amounts ONLY from provided source lines (with sourceRef).
- Request missing_inputs when information is missing.

FORBIDDEN:
- Inventing amounts.
- Balancing entries or calculating totals.
- Posting or mutating ledger.

If an amount is not explicitly provided by a source line: omit amount and add to missing_inputs.

Output STRICT JSON only (no markdown fence, no extra text). Schema:
{"prompt_version":"${ADVISOR_PROMPT_VERSION}","proposals":[{"proposal_id":"string","type":"reclass|accrual_candidate|deferral_candidate|lease_candidate|mapping_fix|other","rationale":"string","rule_ids":[],"confidence":0-1,"requires_human_confirmation":true,"lines":[{"dr_account_key":"string","cr_account_key":"string","amountProvenance":"SOURCE_LINE_AMOUNT|HUMAN_ENTERED_AMOUNT|DETERMINISTIC_ENGINE_AMOUNT","sourceRef":{"tbRowId":"string"},"note":"string"}],"missing_inputs":[]}]}

Rules: if amount present → amountProvenance required. If amountProvenance=SOURCE_LINE_AMOUNT → sourceRef required. Proposals only; never finalized entries.

## EXAMPLE OUTPUT
{"prompt_version":"${ADVISOR_PROMPT_VERSION}","proposals":[{"proposal_id":"prop-recon-var-001","type":"other","rationale":"The AR aging report total differs from the GL control account balance. Recommend reviewing credit memos entered in the AR module during the last few business days that may not have synced to the GL.","rule_ids":["ASC 310-10-35"],"confidence":0.78,"requires_human_confirmation":true,"lines":[],"missing_inputs":["Credit memo detail from AR subledger for last 3 business days","GL posting log for AR control account"]}]}
Note: This example shows a reconciliation_variance proposal. The type field should match the nature of the issue (reclass, accrual_candidate, deferral_candidate, lease_candidate, mapping_fix, or other).

Context: tenantId=${context.tenantId}, periodLabel=${context.periodLabel}.

Classified source lines (amounts here may be copied with sourceRef.tbRowId = source_id):
${JSON.stringify(sourceLines, null, 2)}

TB summary (for context only; do not compute):
${JSON.stringify(tbSummary)}

COA taxonomy (dr_account_key / cr_account_key hints):
${coaBlock}

Standards snippets:
${snippetsBlock}

Respond with the single JSON object only.`;
}

export function buildAdvisorSystemPrompt(): string {
  return `You are an accounting advisor generating reviewable proposals.

Task:
- Suggest candidate actions (reclass/accrual/deferral/etc.) for human review.

Grounding policy:
- Use only provided context.
- Do not invent amounts or source references.
- If data is missing or ambiguous, state what is missing instead of guessing.
- You are advisory-only: do not imply posting, approval, or mutation already occurred.

Forbidden:
- No posting, mutation, balancing, or finalization.

Amount policy:
- If amount is present, include provenance.
- If amount cannot be grounded, omit amount and add missing_inputs.

Output policy:
- Return valid JSON only using the required schema.`;
}
