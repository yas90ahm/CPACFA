/**
 * Justifier pillar prompt template. Text-only IRAC memo; no amounts computed or changed.
 */

export const JUSTIFIER_PROMPT_VERSION = 'justifier_v2.0.0';

export interface JustifierContext {
  tenantId: string;
  periodLabel: string;
  relatedType: 'hitl_staging' | 'close_adjustment' | 'journal_entry' | 'export';
  relatedId: string;
}

export interface StandardsSnippet {
  rule_id: string;
  title: string;
  snippet_markdown: string;
}

export function buildJustifierUserPrompt(params: {
  facts: Record<string, unknown>;
  standards_snippets: StandardsSnippet[];
  context: JustifierContext;
}): string {
  const { facts, standards_snippets, context } = params;
  const snippetsBlock =
    standards_snippets.length > 0
      ? standards_snippets
          .map((s) => `- ${s.rule_id}: ${s.title}\n  ${s.snippet_markdown}`)
          .join('\n')
      : 'No specific standards provided. Apply GAAP/IFRS principles conservatively.';

  return `You are a CPA justifier. Produce a short IRAC memo for the following. Output STRICT JSON only (no markdown fence, no extra text).

HARD RULES:
- Do NOT invent facts. Use only the "facts" and "standards snippets" below.
- Do NOT compute or change any amounts. Describe treatment only; amounts are as provided.
- If information is missing, say so in analysis and keep the conclusion conservative.
- Output must be exactly one JSON object matching this shape (no other keys):
  {"prompt_version":"${JUSTIFIER_PROMPT_VERSION}","irac":{"issue":"...","rule":"...","analysis":"...","conclusion":"..."},"memo_markdown":"...","rule_ids":["..."],"facts_used":["..."]}

## EXAMPLE OUTPUT
Below is a complete example of the expected IRAC JSON output:
{"prompt_version":"${JUSTIFIER_PROMPT_VERSION}","irac":{"issue":"Whether the reclassification from Operating Expense to Prepaid Expense is appropriate under GAAP.","rule":"ASC 720-15 and ASC 340-10 require that advance payments for goods or services not yet received are recognized as prepaid expenses rather than current-period expenses.","analysis":"The facts show a multi-month insurance premium paid in full. Remaining coverage extends beyond period end. The reclassification from OpEx to Prepaid is consistent with the matching principle and ASC 340-10-25.","conclusion":"The reclassification is appropriate. The prepaid asset should be amortized monthly over the remaining coverage period."},"memo_markdown":"## Issue\\nWhether the reclassification from Operating Expense to Prepaid Expense is appropriate under GAAP.\\n\\n## Rule\\nASC 720-15 and ASC 340-10 require that advance payments for goods or services not yet received are recognized as prepaid expenses rather than current-period expenses.\\n\\n## Analysis\\nThe facts show a multi-month insurance premium paid in full. Remaining coverage extends beyond period end. The reclassification from OpEx to Prepaid is consistent with the matching principle and ASC 340-10-25.\\n\\n## Conclusion\\nThe reclassification is appropriate. The prepaid asset should be amortized monthly over the remaining coverage period.","rule_ids":["ASC 720-15","ASC 340-10-25"],"facts_used":["Multi-month insurance premium paid in full","Remaining coverage extends beyond period end"]}

Context: tenant=${context.tenantId}, period=${context.periodLabel}, relatedType=${context.relatedType}, relatedId=${context.relatedId}

Facts (use only these; do not add or infer amounts):
${JSON.stringify(facts, null, 2)}

Standards snippets (cite by rule_id in rule_ids and facts_used):
${snippetsBlock}

Respond with the single JSON object only.`;
}

export function buildJustifierSystemPrompt(): string {
  return `You are an expert CPA writing an IRAC memo for close-support documentation.

Grounding policy:
- Use only provided facts and standards snippets.
- Do not invent facts, citations, or numbers.
- Do not compute or alter amounts.
- You are advisory-only: do not imply posting, approval, or mutation already occurred.

Output policy:
- Return valid JSON only.
- Follow the exact schema provided by the caller.
- If facts are insufficient, state that in analysis and provide a conservative conclusion.`;
}
