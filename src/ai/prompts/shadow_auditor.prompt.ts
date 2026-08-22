/**
 * Shadow Auditor pillar prompt template. Validation/flagging only; no amounts computed or changed.
 */

export const SHADOW_AUDITOR_PROMPT_VERSION = 'shadow_auditor_v3.0.0';

export interface ShadowAuditorContext {
  tenantId: string;
  periodLabel: string;
  subjectType: 'journal_entry' | 'tb_adjustment';
  subjectId: string;
  materialityThreshold?: number;
  workflowState?: string;
  reportingFramework?: string;
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
{"prompt_version":"${SHADOW_AUDITOR_PROMPT_VERSION}","severity":"ok","confidence":0.95,"findings":[{"code":"SUPPORTED_ENTRY","message":"The entry is balanced and the supplied support satisfies the cited internal policy.","rule_ids":["provenance_required"],"refs":["fixed_asset_register"]}]}

### Severity: warn
{"prompt_version":"${SHADOW_AUDITOR_PROMPT_VERSION}","severity":"warn","confidence":0.72,"findings":[{"code":"STRUCTURING_RISK","message":"Journal entry posts to Consulting Expense at an amount just below the materiality threshold requiring evidence attachment. Pattern across multiple periods is consistent with structuring to avoid documentation requirements.","rule_ids":[],"refs":["JE-247"]}]}

### Severity: block
{"prompt_version":"${SHADOW_AUDITOR_PROMPT_VERSION}","severity":"block","confidence":0.88,"findings":[{"code":"UNSUPPORTED_ENTRY","message":"The period-end entry has no supporting documentation and therefore fails the supplied documentation policy.","rule_ids":["documentation_unusual"],"refs":["JE-312"]}]}

Context: tenantId=${context.tenantId}, periodLabel=${context.periodLabel}, subjectType=${context.subjectType}, subjectId=${context.subjectId}. ${materialityNote}
Reporting framework: ${context.reportingFramework ?? 'not supplied; do not infer one'}.
${context.workflowState ? `Workflow state: ${context.workflowState}.` : ''}

Transaction payload (use only these facts):
${JSON.stringify(transactionPayload, null, 2)}

Standards / policy snippets (cite by rule_id in findings.rule_ids):
${snippetsBlock}

Respond with the single JSON object only.`;
}

export function buildShadowAuditorSystemPrompt(): string {
  return `You are a Shadow Auditor for financial close controls.

Task:
- Identify policy/compliance risks in the provided payload.
- Return severity: ok, warn, or block.

Grounding policy:
- Use only provided payload and standards snippets.
- Do not invent facts or citations.
- Never substitute one reporting framework for another. If the framework is absent or no authoritative snippet is supplied, apply only the supplied internal control policies.
- Do not compute, change, or rebalance amounts.
- You are advisory-only: do not imply posting, approval, or mutation already occurred.

Decision policy:
- block only for clear, high-confidence control violations.
- warn for uncertainty or moderate risk.
- ok when no actionable risk is identified.

Output policy:
- Return valid JSON only using the required schema.`;
}
