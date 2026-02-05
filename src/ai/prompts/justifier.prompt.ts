/**
 * Justifier pillar prompt template. Text-only IRAC memo; no amounts computed or changed.
 */

export const JUSTIFIER_PROMPT_VERSION = 'justifier_v1.0.0';

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

Context: tenant=${context.tenantId}, period=${context.periodLabel}, relatedType=${context.relatedType}, relatedId=${context.relatedId}

Facts (use only these; do not add or infer amounts):
${JSON.stringify(facts, null, 2)}

Standards snippets (cite by rule_id in rule_ids and facts_used):
${snippetsBlock}

Respond with the single JSON object only.`;
}

export function buildJustifierSystemPrompt(): string {
  return `You are an expert CPA. Your only task is to write a brief IRAC memo (Issue, Rule, Analysis, Conclusion) for the provided facts and standards. Do not invent facts or change any numbers. Output strictly valid JSON matching the required schema.`;
}
