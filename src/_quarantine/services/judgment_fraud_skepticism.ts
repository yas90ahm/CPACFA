/**
 * Fraud and skepticism protocol: wire perform_audit_check and skepticism layer; revenue concentration.
 * Flag-only; no auto-execute.
 */

import type { Pool } from 'pg';
import type { ProfessionalReviewInput } from '../types/professional_review.js';
import type { CreateProfessionalAuditFlagInput } from '../db/repositories/professional_audit_flags_repository.js';
import { perform_audit_check } from './analysis_agent.js';
import type { AuditEntry } from '../types/analysis.js';

/**
 * Run fraud/skepticism protocol: map audit check and skepticism results to professional flags.
 * Returns flags only.
 */
export async function runFraudSkepticism(
  input: ProfessionalReviewInput,
  _pool: Pool
): Promise<Omit<CreateProfessionalAuditFlagInput, 'tenantId' | 'periodLabel' | 'runId'>[]> {
  const flags: Omit<CreateProfessionalAuditFlagInput, 'tenantId' | 'periodLabel' | 'runId'>[] = [];

  if (input.trialBalance?.entries?.length) {
    const entries: AuditEntry[] = input.trialBalance.entries.map((e, i) => {
      const debit = (e as { debit?: number }).debit ?? 0;
      const credit = (e as { credit?: number }).credit ?? 0;
      return {
        label: (e as { accountName?: string }).accountName ?? `Line ${i + 1}`,
        amount: debit + credit,
      };
    });
    if (entries.length >= 10) {
      const auditResult = perform_audit_check(entries);
      for (const f of auditResult.flags ?? []) {
        flags.push({
          category: 'fraud_skepticism',
          severity: f.severity === 'high' ? 'high_cam' : 'medium',
          message: f.message ?? f.type,
          recommendation: 'Perform substantive testing and review for potential material misstatement.',
          citationStandard: 'AU-C 240',
          citationExcerpt: f.detail,
        });
      }
    }
  }

  const revLast5 = input.revenueInLast5BusinessDays;
  const totalQ = input.totalQuarterlyRevenue;
  if (
    typeof revLast5 === 'number' &&
    typeof totalQ === 'number' &&
    totalQ > 0 &&
    revLast5 / totalQ > 0.25
  ) {
    flags.push({
      category: 'fraud_skepticism',
      severity: 'medium',
      message:
        'Revenue concentration in final 5 business days exceeds 25% of quarterly revenue — consider channel stuffing risk.',
      recommendation: 'Perform substantive testing on late-quarter revenue; assess cutoff and channel stuffing risk.',
      citationStandard: 'AU-C 240',
      citationExcerpt: `Revenue in last 5 business days: ${revLast5}; quarterly revenue: ${totalQ}; share: ${((revLast5 / totalQ) * 100).toFixed(1)}%.`,
    });
  }

  return flags;
}
