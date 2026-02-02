/**
 * Going-concern protocol: synthesize covenant breach and liquidity; draft conclusion and disclosure.
 * Flag-only; no auto-execute.
 */

import type { Pool } from 'pg';
import type { ProfessionalReviewInput } from '../types/professional_review.js';
import type { CreateProfessionalAuditFlagInput } from '../db/repositories/professional_audit_flags_repository.js';

const CURRENT_RATIO_THRESHOLD = 1.0;
const RUNWAY_MONTHS_THRESHOLD = 12;

export interface GoingConcernProtocolResult {
  flags: Omit<CreateProfessionalAuditFlagInput, 'tenantId' | 'periodLabel' | 'runId'>[];
  goingConcernConclusion?: string;
  recommendedDisclosure?: string;
}

/**
 * Run going-concern protocol: deterministic floor (covenant breach, current ratio, runway).
 * Returns flags and optional conclusion/disclosure text.
 */
export async function runGoingConcern(
  input: ProfessionalReviewInput,
  _pool: Pool
): Promise<GoingConcernProtocolResult> {
  const flags: Omit<CreateProfessionalAuditFlagInput, 'tenantId' | 'periodLabel' | 'runId'>[] = [];
  let goingConcernConclusion: string | undefined;
  let recommendedDisclosure: string | undefined;

  const covenant = input.covenantResult;
  const liquidity = input.liquidityMetrics;
  const breach =
    covenant?.debtToEbitdaBreach === true || covenant?.interestCoverageBreach === true;
  const weakLiquidity =
    (liquidity?.currentRatio != null && liquidity.currentRatio < CURRENT_RATIO_THRESHOLD) ||
    (liquidity?.runwayMonths != null &&
      liquidity.runwayMonths < RUNWAY_MONTHS_THRESHOLD &&
      liquidity.runwayMonths < 999);

  if (breach || weakLiquidity) {
    flags.push({
      category: 'going_concern',
      severity: 'high_cam',
      message: breach
        ? 'Debt covenant breach or interest coverage below minimum.'
        : 'Liquidity or runway below threshold (current ratio < 1 or runway < 12 months).',
      recommendation:
        'Assess going concern; consider disclosure of material uncertainties in the financial notes.',
      citationStandard: 'ASC 205-40 / IAS 1.25',
    });
    goingConcernConclusion =
      'Management has assessed going concern. Covenant breach and/or liquidity constraints indicate material uncertainty; disclosure of these conditions in the notes is recommended.';
    recommendedDisclosure =
      'There is material uncertainty related to events or conditions that may cast significant doubt on the entity\'s ability to continue as a going concern. Management is actively addressing covenant compliance and liquidity.';
  }

  const prior = input.priorLiquidityMetrics;
  const currentBurn = liquidity?.burnRate;
  const priorBurn = prior?.burnRate;
  const runwayUnder12 =
    liquidity?.runwayMonths != null &&
    liquidity.runwayMonths < RUNWAY_MONTHS_THRESHOLD &&
    liquidity.runwayMonths < 999;
  const acceleratingBurn =
    runwayUnder12 &&
    prior != null &&
    typeof currentBurn === 'number' &&
    typeof priorBurn === 'number' &&
    currentBurn > priorBurn;
  if (acceleratingBurn) {
    flags.push({
      category: 'going_concern',
      severity: 'high_cam',
      message: 'Going concern: runway < 12 months with accelerating burn (current burn higher than prior period).',
      recommendation:
        'Assess going concern; consider disclosure of material uncertainties and deteriorating liquidity in the financial notes.',
      citationStandard: 'ASC 205-40 / IAS 1.25',
    });
  }

  return { flags, goingConcernConclusion, recommendedDisclosure };
}
