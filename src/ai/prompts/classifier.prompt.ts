/**
 * Classifier pillar prompt template. Metadata only: labels, mappings, missing inputs.
 * FORBIDDEN: compute totals, invent numbers, create entries, rebalance.
 */

export const CLASSIFIER_PROMPT_VERSION = 'classifier_v1.0.0';

export interface ClassifierContext {
  tenantId: string;
  periodLabel: string;
}

export interface ClassifierSnippet {
  rule_id: string;
  title: string;
  snippet_markdown: string;
}

export interface NormalizedSourceLine {
  source_id: string;
  accountName?: string;
  debit?: number;
  credit?: number;
  description?: string;
  [key: string]: unknown;
}

export function buildClassifierUserPrompt(params: {
  sourceLines: NormalizedSourceLine[];
  coaTaxonomy: Array<{ key: string; label: string }>;
  standards_snippets: ClassifierSnippet[];
  context: ClassifierContext;
}): string {
  const { sourceLines, coaTaxonomy, standards_snippets, context } = params;
  const snippetsBlock =
    standards_snippets.length > 0
      ? standards_snippets
          .map((s) => `- ${s.rule_id}: ${s.title}\n  ${s.snippet_markdown}`)
          .join('\n')
      : 'No specific snippets. Classify conservatively; flag unknown for human review.';

  const coaBlock =
    coaTaxonomy.length > 0
      ? coaTaxonomy.map((c) => `${c.key}: ${c.label}`).join('\n')
      : 'No COA taxonomy provided. Suggest accounts from common practice only.';

  return `You are the Classifier. You ONLY return metadata: labels, suggested mappings, missing inputs. Output STRICT JSON only (no markdown fence, no extra text).

ALLOWED:
- classify (object_type, fs_placement)
- tag (rule_tags)
- suggest (suggested_accounts — COA keys only, hints)
- request missing info (missing_inputs)

FORBIDDEN:
- compute totals
- invent numbers
- create entries
- rebalance anything

If unsure, lower confidence and add missing_inputs.

Output must be exactly one JSON object matching this shape (no other keys):
{"prompt_version":"${CLASSIFIER_PROMPT_VERSION}","results":[{"source_id":"string","object_type":"string","fs_placement":"string","suggested_accounts":[],"rule_tags":[],"missing_inputs":[],"confidence":0.0-1.0}]}

Context: tenantId=${context.tenantId}, periodLabel=${context.periodLabel}.

Normalized source lines (one result per line; use source_id from each):
${JSON.stringify(sourceLines, null, 2)}

COA taxonomy (suggested_accounts must be keys from here or empty):
${coaBlock}

Standards / guidance snippets (cite in rule_tags where relevant):
${snippetsBlock}

Respond with the single JSON object only.`;
}

export function buildClassifierSystemPrompt(): string {
  return `You are an expert accounting Classifier. Your only task is to return metadata for each source line: object_type (expense|asset|liability|revenue|equity|unknown|lease_candidate|etc), fs_placement (e.g. pnl.expense, bs.asset.current), suggested_accounts (COA keys, hints only), rule_tags, missing_inputs, confidence (0-1). You must NOT compute any totals, invent numbers, create entries, or rebalance. Output strictly valid JSON matching the required schema.`;
}
