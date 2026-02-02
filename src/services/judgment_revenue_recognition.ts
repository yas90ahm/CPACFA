/**
 * Multi-element revenue protocol (implied POBs): LLM-based distinction between
 * Performance Obligation (ASC 606) and Marketing Incentive. Flag-only; no auto-execute.
 */

import type { Pool } from 'pg';
import type { ProfessionalReviewInput } from '../types/professional_review.js';
import type { CreateProfessionalAuditFlagInput } from '../db/repositories/professional_audit_flags_repository.js';
import { callLLMWithFallback } from '../llm/callWithFallback.js';

const IMPLIED_PROMISE_KEYWORDS = [
  'free implementation',
  'training',
  'customization',
  'support',
  'warranty',
  'setup',
  'onboarding',
];

const REVENUE_CLASSIFICATION_SYSTEM = `You are an expert in ASC 606 revenue recognition. Classify each contract phrase as either:
- performance_obligation: A distinct good or service that is part of the contract (e.g. implementation, training, customization, support that constitutes a separate promise to deliver).
- marketing_incentive: A one-off discount, coupon, promotional gift, or incentive that does NOT constitute a separate promise to deliver a distinct good or service (e.g. simple discount, rebate, free trial that is marketing only).

Reply with a single JSON object only: { "classification": "performance_obligation" or "marketing_incentive", "rationale": "brief reason" }.`;

function parseClassificationResponse(raw: string): { classification: 'performance_obligation' | 'marketing_incentive'; rationale: string } {
  try {
    const trimmed = raw.trim().replace(/^```json?\s*|\s*```$/g, '');
    const p = JSON.parse(trimmed) as { classification?: string; rationale?: string };
    const classification =
      p.classification === 'marketing_incentive' ? 'marketing_incentive' : 'performance_obligation';
    return {
      classification,
      rationale: typeof p.rationale === 'string' ? p.rationale : 'No rationale',
    };
  } catch {
    return { classification: 'performance_obligation', rationale: 'Unparseable; treat as POB (conservative).' };
  }
}

/**
 * Run multi-element revenue protocol: LLM classifies candidate phrases as Performance Obligation
 * vs Marketing Incentive; only flags when POB and not already in POBs. Falls back to keyword-only flag when LLM fails.
 */
export async function runRevenueRecognition(
  input: ProfessionalReviewInput,
  _pool: Pool
): Promise<Omit<CreateProfessionalAuditFlagInput, 'tenantId' | 'periodLabel' | 'runId'>[]> {
  const flags: Omit<CreateProfessionalAuditFlagInput, 'tenantId' | 'periodLabel' | 'runId'>[] = [];

  if (!input.contracts?.length) return flags;

  for (const contract of input.contracts) {
    const pobs = contract.performanceObligations ?? [];
    const pobNames = pobs.map((p) => (p.name ?? '').toLowerCase());
    const pobDesc = pobs.map((p) => (p.description ?? '').toLowerCase()).join(' ');
    const contractDesc = (contract as { description?: string }).description ?? '';
    const narrative = `${(contract as { contractNumber?: string }).contractNumber ?? ''} ${contractDesc} ${pobDesc}`.toLowerCase();

    for (const kw of IMPLIED_PROMISE_KEYWORDS) {
      if (!narrative.includes(kw)) continue;
      const covered = pobNames.some((n) => n.includes(kw)) || pobDesc.includes(kw);
      if (covered) continue;

      const llmResult = await callLLMWithFallback({
        system: REVENUE_CLASSIFICATION_SYSTEM,
        prompt: `Contract excerpt:\n${narrative.slice(0, 1500)}\n\nPhrase to classify: "${kw}"`,
        maxTokens: 200,
        parse: parseClassificationResponse,
        fallback: { classification: 'performance_obligation' as const, rationale: 'LLM fallback; treat as POB.' },
      });

      if (llmResult.classification === 'marketing_incentive') {
        continue;
      }
      // performance_obligation (or fallback): flag as implied promise not in POBs
      flags.push({
        category: 'revenue_recognition',
        severity: 'medium',
        message: `Implied promise not in POBs: "${kw}". Contract may bundle distinct goods/services.`,
        recommendation: `Add POB for "${kw}"; estimate SSP and reallocate transaction price.`,
        citationStandard: 'ASC 606-10-25-16',
        citationExcerpt: kw,
      });
    }
  }

  return flags;
}
