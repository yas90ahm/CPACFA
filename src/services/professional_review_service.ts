/**
 * Professional review orchestration (Judgment Layer).
 * Runs five protocols, persists flags, returns ProfessionalReviewResponse. Flag-only; no auto-execute.
 */

import type { Pool } from 'pg';
import type {
  ProfessionalReviewInput,
  ProfessionalReviewResponse,
  ProfessionalReviewOverallRisk,
  ReviewFlagSummary,
} from '../types/professional_review.js';
import * as flagsRepo from '../db/repositories/professional_audit_flags_repository.js';
import { appendFlags as riskContextAppendFlags } from './risk_context_store.js';
import { recordObservation } from './audit_ledger_service.js';
// QUARANTINED — Judgment services not in MVP architecture
// import { runSubstanceOverForm } from './judgment_substance_over_form.js';
// import { runRevenueRecognition } from './judgment_revenue_recognition.js';
// import { runGipsEthics } from './judgment_gips_ethics.js';
import { runGoingConcern } from './judgment_going_concern.js';
// import { runFraudSkepticism } from './judgment_fraud_skepticism.js';

/**
 * Run the full professional review: call all five protocols, persist flags, compute overall risk.
 * Returns ProfessionalReviewResponse with goingConcernConclusion and recommendedDisclosure when applicable.
 */
export async function runProfessionalReview(
  input: ProfessionalReviewInput,
  pool: Pool
): Promise<ProfessionalReviewResponse> {
  const { tenantId, periodLabel, runId } = input;
  const created: { id: string; category: string; severity: string; message: string; recommendation: string; citationStandard: string; sourceExcerpt?: string }[] = [];
  let goingConcernConclusion: string | undefined;
  let recommendedDisclosure: string | undefined;

  const persist = async (
    payload: Omit<flagsRepo.CreateProfessionalAuditFlagInput, 'tenantId' | 'periodLabel' | 'runId'>
  ) => {
    const flag = await flagsRepo.create(pool, {
      ...payload,
      tenantId,
      periodLabel,
      runId,
    });
    created.push({
      id: flag.id,
      category: flag.category,
      severity: flag.severity,
      message: flag.message,
      recommendation: flag.recommendation,
      citationStandard: flag.citationStandard,
      sourceExcerpt: flag.citationExcerpt,
    });
  };

  /**
   * QUARANTINED PROTOCOLS (4 of 5)
   *
   * These protocols are architecturally designed but disabled pending policy finalization:
   * - substanceOverForm: Identifies form-over-substance transactions (embedded leases, etc.)
   * - revenueRecognition: ASC 606 multi-element arrangement checks
   * - fraudSkepticism: AU-C 240 journal entry testing for fraud risk signals
   * - gipsEthics: AICPA ET Section 0.300 independence checks
   *
   * Only goingConcern is active (ASU 2014-15 / IAS 1 liquidity & covenant analysis).
   *
   * Impact: Professional review currently only flags going concern risks.
   * overallRisk defaults to 'low' when no flags are produced by other protocols.
   */
  const substanceFlags: Array<{ category: string; severity: string; message: string; recommendation: string; citationStandard: string }> = [];
  const revenueFlags: Array<{ category: string; severity: string; message: string; recommendation: string; citationStandard: string }> = [];
  const gipsFlags: Array<{ category: string; severity: string; message: string; recommendation: string; citationStandard: string }> = [];
  const goingConcernResult = await runGoingConcern(input, pool);
  const fraudFlags: Array<{ category: string; severity: string; message: string; recommendation: string; citationStandard: string }> = [];

  // for (const f of substanceFlags) await persist(f);
  // for (const f of revenueFlags) await persist(f);
  // for (const f of gipsFlags) await persist(f);
  for (const f of goingConcernResult.flags) await persist(f);
  // for (const f of fraudFlags) await persist(f);

  riskContextAppendFlags(
    tenantId,
    runId ?? periodLabel,
    created.map((c) => ({
      category: c.category,
      severity: c.severity,
      message: c.message,
      recommendation: c.recommendation,
      citationStandard: c.citationStandard,
      sourceDocumentId: undefined,
    }))
  );

  for (const c of created) {
    await recordObservation(pool, {
      tenantId,
      periodLabel: periodLabel ?? undefined,
      eventType: 'cpa_observation',
      deterministicFlagSnapshot: {
        category: c.category,
        severity: c.severity,
        message: c.message,
        recommendation: c.recommendation,
        citationStandard: c.citationStandard,
      },
    });
  }

  if (goingConcernResult.goingConcernConclusion) goingConcernConclusion = goingConcernResult.goingConcernConclusion;
  if (goingConcernResult.recommendedDisclosure) recommendedDisclosure = goingConcernResult.recommendedDisclosure;

  const hasHighCam = created.some((c) => c.severity === 'high_cam');
  const hasMedium = created.some((c) => c.severity === 'medium');
  const overallRisk: ProfessionalReviewOverallRisk = hasHighCam
    ? 'high_cam'
    : hasMedium || created.length > 3
      ? 'medium'
      : 'low';

  const flagSummaries: ReviewFlagSummary[] = created.map((c) => ({
    flagId: c.id,
    category: c.category as ReviewFlagSummary['category'],
    severity: c.severity as ReviewFlagSummary['severity'],
    message: c.message,
    recommendation: c.recommendation,
    citationStandard: c.citationStandard,
    sourceExcerpt: c.sourceExcerpt,
  }));

  return {
    runId,
    periodLabel,
    overallRisk,
    flags: flagSummaries,
    goingConcernConclusion,
    recommendedDisclosure,
  };
}
