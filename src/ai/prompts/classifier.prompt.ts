/**
 * Classifier pillar prompt template. Metadata only: labels, mappings, missing inputs.
 * FORBIDDEN: compute totals, invent numbers, create entries, rebalance.
 */

import type { XBRLSearchResult } from '../../services/xbrl_search_service.js';
import { buildXBRLContext } from './xbrl_context.js';

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

export interface AccountIntelligenceFlag {
  accountCode: string;
  flags: string[];
  suggestedMapping?: string;
  suggestedAction: string;
  reasoning: string;
}

export function buildClassifierUserPrompt(params: {
  sourceLines: NormalizedSourceLine[];
  coaTaxonomy: Array<{ key: string; label: string; xbrlElement?: string; xbrlLabel?: string }>;
  standards_snippets: ClassifierSnippet[];
  context: ClassifierContext;
  accountIntelligence?: AccountIntelligenceFlag[];
  priorPeriodMappings?: Array<{ accountCode: string; fsLineId: string }>;
  xbrlSearchResults?: Record<string, XBRLSearchResult[]>;
}): string {
  const { sourceLines, coaTaxonomy, standards_snippets, context, accountIntelligence, priorPeriodMappings, xbrlSearchResults } = params;
  const snippetsBlock =
    standards_snippets.length > 0
      ? standards_snippets
          .map((s) => `- ${s.rule_id}: ${s.title}\n  ${s.snippet_markdown}`)
          .join('\n')
      : 'No specific snippets. Classify conservatively; flag unknown for human review.';

  const coaBlock =
    coaTaxonomy.length > 0
      ? coaTaxonomy.map((c) => {
          const xbrl = c.xbrlElement ? ` [XBRL: ${c.xbrlElement} — ${c.xbrlLabel ?? ''}]` : '';
          return `${c.key}: ${c.label}${xbrl}`;
        }).join('\n')
      : 'No COA taxonomy provided. Suggest accounts from common practice only.';

  const intelligenceBlock =
    accountIntelligence && accountIntelligence.length > 0
      ? '\n\nAccount Intelligence Flags (pre-detected patterns — factor these into your classification):\n' +
        accountIntelligence.map((a) =>
          `- ${a.accountCode}: flags=[${a.flags.join(',')}] action=${a.suggestedAction}${a.suggestedMapping ? ` suggested=${a.suggestedMapping}` : ''} reason="${a.reasoning}"`
        ).join('\n')
      : '';

  const priorMappingBlock =
    priorPeriodMappings && priorPeriodMappings.length > 0
      ? '\n\nPrior Period Mappings (use as strong signals for consistency):\n' +
        priorPeriodMappings.map((m) => `- ${m.accountCode} -> ${m.fsLineId}`).join('\n')
      : '';

  const xbrlBlock =
    xbrlSearchResults && Object.keys(xbrlSearchResults).length > 0
      ? '\n\nXBRL US GAAP Taxonomy Matches (use to select the correct XBRL element for each account):\n' +
        Object.entries(xbrlSearchResults).map(([sourceId, results]) =>
          `Account ${sourceId}:\n${buildXBRLContext(results)}`
        ).join('\n\n')
      : '';

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

## EXAMPLE OUTPUTS

### Normal account
Input: "Account 4010 - Product Revenue"
{"prompt_version":"${CLASSIFIER_PROMPT_VERSION}","results":[{"source_id":"4010","object_type":"revenue","fs_placement":"pnl.revenue","suggested_accounts":["fs_revenue"],"rule_tags":["ASC 606"],"missing_inputs":[],"confidence":0.95}]}

### Contra account
Input: "Account 1520 - Accumulated Depreciation - Equipment"
{"prompt_version":"${CLASSIFIER_PROMPT_VERSION}","results":[{"source_id":"1520","object_type":"contra_asset","fs_placement":"bs.asset.noncurrent","suggested_accounts":["fs_asset_ppe_accum_dep"],"rule_tags":["ASC 360-10-35-4"],"missing_inputs":[],"confidence":0.90}]}

### Ambiguous account
Input: "Account 9999 - Miscellaneous"
{"prompt_version":"${CLASSIFIER_PROMPT_VERSION}","results":[{"source_id":"9999","object_type":"expense","fs_placement":"pnl.opex","suggested_accounts":["fs_opex_other"],"rule_tags":[],"missing_inputs":["Account description is generic. Manual review strongly recommended to confirm classification."],"confidence":0.35}]}

Context: tenantId=${context.tenantId}, periodLabel=${context.periodLabel}.

Normalized source lines (one result per line; use source_id from each):
${JSON.stringify(sourceLines, null, 2)}

COA taxonomy (suggested_accounts must be keys from here or empty; XBRL elements shown for reference):
${coaBlock}
${intelligenceBlock}
${priorMappingBlock}
${xbrlBlock}

Standards / guidance snippets (cite in rule_tags where relevant):
${snippetsBlock}

Respond with the single JSON object only.`;
}

export function buildClassifierSystemPrompt(): string {
  return `You are an expert accounting Classifier. Your only task is to return metadata for each source line: object_type (expense|asset|liability|revenue|equity|unknown|lease_candidate|etc), fs_placement (e.g. pnl.expense, bs.asset.current), suggested_accounts (COA keys, hints only), rule_tags, missing_inputs, confidence (0-1). You must NOT compute any totals, invent numbers, create entries, or rebalance. Output strictly valid JSON matching the required schema.`;
}
