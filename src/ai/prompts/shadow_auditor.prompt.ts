/**
 * Shadow Auditor pillar prompt template. Validation/flagging only; no amounts computed or changed.
 */

export const SHADOW_AUDITOR_PROMPT_VERSION = 'shadow_auditor_v1.0.0';

export interface ShadowAuditorContext {
  tenantId: string;
  periodLabel: string;
  subjectType: 'journal_entry' | 'tb_adjustment';
  subjectId: string;
  materialityThreshold?: number;
  workflowState?: string;
}

export interface ShadowAuditorSnippet {
  rule_id: string;
  title: string;
  snippet_markdown: string;
}

export function buildShadowAuditorUserPrompt(params: {
  transactionPayload: Record<string, unknown>;
  standards_snippets: ShadowAuditorSnippet[];
  context: ShadowAuditorContext;
}): string {
  const { transactionPayload, standards_snippets, context } = params;
  const snippetsBlock =
    standards_snippets.length > 0
      ? standards_snippets
          .map((s) => `- ${s.rule_id}: ${s.title}\n  ${s.snippet_markdown}`)
          .join('\n')
      : 'No specific policy snippets provided. Flag only clear policy violations.';

  const materialityNote =
    context.materialityThreshold != null
      ? `Materiality threshold: ${context.materialityThreshold}.`
      : 'No materiality threshold provided.';

  return `You are the Shadow Auditor. You do not edit. You only flag. Output STRICT JSON only (no markdown fence, no extra text).

RULES:
- Use ONLY the provided transaction payload and standards snippets. Do not invent facts.
- If uncertain, choose "warn" and lower confidence.
- Do NOT compute or change any amounts. Flag policy/compliance issues only.
- Output must be exactly one JSON object matching this shape (no other keys):
{"prompt_version":"${SHADOW_AUDITOR_PROMPT_VERSION}","severity":"ok"|"warn"|"block","confidence":0.0-1.0,"findings":[{"code":"string","message":"string","rule_ids":[],"refs":[]}]}

## EXAMPLE OUTPUTS

### Severity: ok
{"prompt_version":"${SHADOW_AUDITOR_PROMPT_VERSION}","severity":"ok","confidence":0.95,"findings":[{"code":"ROUTINE_DEPRECIATION","message":"Standard monthly depreciation entry of $38,700 to accumulated depreciation. Amount is consistent with prior periods and supported by the fixed asset register.","rule_ids":["ASC 360-10-35-4"],"refs":["fixed_asset_register"]}]}

### Severity: warn
{"prompt_version":"${SHADOW_AUDITOR_PROMPT_VERSION}","severity":"warn","confidence":0.72,"findings":[{"code":"STRUCTURING_RISK","message":"Journal entry #247 posts $49,500 to Consulting Expense. This is $500 below the $50,000 materiality threshold requiring evidence attachment. Pattern is consistent with structuring to avoid evidence requirements.","rule_ids":[],"refs":["JE-247"]}]}

### Severity: block
{"prompt_version":"${SHADOW_AUDITOR_PROMPT_VERSION}","severity":"block","confidence":0.88,"findings":[{"code":"UNSUPPORTED_REVENUE","message":"Journal entry #312 debits Cash and credits Revenue for $125,000 with memo 'Year-end adjustment.' Revenue recognition on the last day of the period without supporting documentation (invoice, contract, BOL) creates significant audit risk under ASC 606.","rule_ids":["ASC 606-10-25-1"],"refs":["JE-312"]}]}

Context: tenantId=${context.tenantId}, periodLabel=${context.periodLabel}, subjectType=${context.subjectType}, subjectId=${context.subjectId}. ${materialityNote}
${context.workflowState ? `Workflow state: ${context.workflowState}.` : ''}

Transaction payload (use only these facts):
${JSON.stringify(transactionPayload, null, 2)}

Standards / policy snippets (cite by rule_id in findings.rule_ids):
${snippetsBlock}

Respond with the single JSON object only.`;
}

export function buildShadowAuditorSystemPrompt(): string {
  return `You are an expert Shadow Auditor. Your only task is to flag potential policy or compliance issues in the provided transaction. You do not edit, compute, or change any amounts. Output strictly valid JSON matching the required schema. Use severity "block" only for clear blocking violations; use "warn" for concerns; use "ok" when nothing to flag.`;
}
