/**
 * Agentic onboarding: CoA mapping suggestions and first-close guide.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { runInBoundaryScope, enterAdvisoryContext, exitAdvisoryContext } from '../lib/ai_boundary.js';
import { assertNoNumericAmountsInAgentOutput } from '../llm/guardrails.js';
import { classifyAccount } from './accountClassifier.js';
import type { AccountType } from '../types/financial.js';

export interface CoAMappingItem {
  accountCode: string;
  suggestedType: AccountType;
  reason?: string;
}

export interface CoAMappingResult {
  mappings: CoAMappingItem[];
}

const COA_SYSTEM = [
  'You are a CPA and chart of accounts specialist. Given a list of account codes and names,',
  'suggest the standard type for each: ASSET, LIABILITY, EQUITY, REVENUE, or EXPENSE. Optionally give a short reason.',
  'Respond with a JSON array only: [ { "accountCode": "string", "suggestedType": "ASSET"|"LIABILITY"|"EQUITY"|"REVENUE"|"EXPENSE", "reason": "optional string" }, ... ].',
  'Use only these keys. One entry per account. Be concise.',
].join(' ');

const FIRST_CLOSE_STEPS: { order: number; label: string; description?: string }[] = [
  { order: 1, label: 'Upload trial balance', description: 'Import TB for the period.' },
  { order: 2, label: 'Run bank reconciliation', description: 'Match bank statement to GL cash.' },
  { order: 3, label: 'Review accruals and deferrals', description: 'Post period-end accruals.' },
  { order: 4, label: 'Complete disclosure checklist', description: 'Review and evidence disclosures.' },
  { order: 5, label: 'Lock period', description: 'Close period when all items are complete.' },
];

const FIRST_CLOSE_SYSTEM = [
  'You are a CPA close specialist. Given optional entity name and fiscal year end,',
  'return a short ordered list of steps for a first month-end close (5-7 steps).',
  'Respond with a JSON array only: [ { "order": 1, "label": "string", "description": "optional string" }, ... ].',
  'Use only these keys. Be concise and actionable.',
].join(' ');

function fallbackCoAMapping(accounts: { code: string; name: string }[]): CoAMappingItem[] {
  return accounts.map((a) => {
    const { accountType } = classifyAccount(a.name);
    return { accountCode: a.code, suggestedType: accountType };
  });
}

/**
 * Suggest CoA mapping (account code -> ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE). Fallback: rule-based classifier.
 */
export async function suggestCoAMappingAgentic(
  accounts: { code: string; name: string }[]
): Promise<CoAMappingResult> {
  if (!accounts?.length) return { mappings: [] };

  const prompt = `Accounts:\n${accounts.map((a) => `${a.code}: ${a.name}`).join('\n')}\n\nRespond with JSON array of mappings (accountCode, suggestedType, reason optional).`;
  const fallback: CoAMappingResult = { mappings: fallbackCoAMapping(accounts) };

  return runInBoundaryScope(async () => {
    enterAdvisoryContext();
    try {
      const raw = await callLLMWithFallback({
        system: COA_SYSTEM,
        prompt,
        maxTokens: 1024,
        parse: (r) => r?.trim() ?? '[]',
        fallback: '[]',
      });

      if (!raw || raw === '[]') return fallback;
      try {
        const cleaned = raw.replace(/```json?\s*|\s*```/g, '').trim();
        const parsed = JSON.parse(cleaned) as unknown;
        if (!Array.isArray(parsed)) return fallback;

        // Apply numeric guardrail on parsed LLM output
        assertNoNumericAmountsInAgentOutput(parsed, 'agentic_onboarding_coa_mapping');

        const validTypes: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
        const mappings: CoAMappingItem[] = [];
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue;
          const o = item as Record<string, unknown>;
          const code = typeof o.accountCode === 'string' ? o.accountCode : undefined;
          const type = validTypes.includes(o.suggestedType as AccountType) ? (o.suggestedType as AccountType) : undefined;
          if (code != null && type != null) {
            mappings.push({
              accountCode: code,
              suggestedType: type,
              reason: typeof o.reason === 'string' ? o.reason.slice(0, 200) : undefined,
            });
          }
        }
        if (mappings.length === 0) return fallback;
        return { mappings };
      } catch {
        return fallback;
      }
    } finally {
      exitAdvisoryContext();
    }
  });
}

export interface FirstCloseStep {
  order: number;
  label: string;
  description?: string;
}

export interface FirstCloseGuideResult {
  steps: FirstCloseStep[];
}

/**
 * Get first-close guide (ordered steps or narrative). Fallback: fixed list.
 */
export async function getFirstCloseGuideAgentic(params?: {
  entityName?: string;
  fiscalYearEnd?: string;
}): Promise<FirstCloseGuideResult> {
  const prompt = params?.entityName
    ? `Entity: ${params.entityName}.${params.fiscalYearEnd ? ` Fiscal year end: ${params.fiscalYearEnd}.` : ''}\n\nReturn JSON array of steps for first month-end close.`
    : 'Return JSON array of 5-7 steps for a typical first month-end close.';
  const fallback: FirstCloseGuideResult = { steps: FIRST_CLOSE_STEPS };

  return runInBoundaryScope(async () => {
    enterAdvisoryContext();
    try {
      const raw = await callLLMWithFallback({
        system: FIRST_CLOSE_SYSTEM,
        prompt,
        maxTokens: 512,
        parse: (r) => r?.trim() ?? '[]',
        fallback: '[]',
      });

      if (!raw || raw === '[]') return fallback;
      try {
        const cleaned = raw.replace(/```json?\s*|\s*```/g, '').trim();
        const parsed = JSON.parse(cleaned) as unknown;
        if (!Array.isArray(parsed)) return fallback;

        // Apply numeric guardrail on parsed LLM output
        assertNoNumericAmountsInAgentOutput(parsed, 'agentic_onboarding_first_close_guide');

        const steps: FirstCloseStep[] = [];
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue;
          const o = item as Record<string, unknown>;
          const order = typeof o.order === 'number' ? o.order : steps.length + 1;
          const label = typeof o.label === 'string' ? o.label : '';
          if (label) {
            steps.push({
              order,
              label,
              description: typeof o.description === 'string' ? o.description.slice(0, 300) : undefined,
            });
          }
        }
        if (steps.length === 0) return fallback;
        steps.sort((a, b) => a.order - b.order);
        return { steps };
      } catch {
        return fallback;
      }
    } finally {
      exitAdvisoryContext();
    }
  });
}
