/**
 * Freshness Interlock: CFA valuation cannot run when underlying financial data
 * has been updated after the last Professional Review (CPA).
 * Shared by DCF, LBO, and any CFA-level tool that uses tenant period financial data.
 *
 * Global policy (CFA-level tools):
 * - DCF: POST /dcf, POST /dcf/calculate — use assertFreshnessForValuation when periodLabel present.
 * - LBO: POST /, POST /calculate — use assertFreshnessForValuation when periodLabel present.
 * - Comps: When an endpoint accepts periodLabel and uses tenant period TB/FS for target or
 *   comparables, it must call assertFreshnessForValuation(pool, tenantId, periodLabel).
 * - Portfolio: When an endpoint uses tenant TB/FS for the given period (e.g. to derive
 *   metrics), it must call assertFreshnessForValuation(pool, tenantId, periodLabel).
 * No analytic output may be generated from stale or unverified data.
 */

import type { Pool } from 'pg';
import { getLatestReviewRunAt } from '../../db/repositories/professional_audit_flags_repository.js';
import { getLatestUpdatedAt } from '../../db/repositories/period_financial_data_state_repository.js';

const PROFESSIONAL_REVIEW_REQUIRED_MESSAGE =
  'CFA valuation cannot proceed until CPA Professional Review is finalized for this data state.';

const DATA_STATE_MISMATCH_MESSAGE =
  'Data State Mismatch: The underlying financial data has been updated since the last Professional Review. A new CPA Review is required to validate the current state before valuation can proceed.';

export type FreshnessResult =
  | { allowed: true }
  | { allowed: false; status: 403 | 412; code: string; message: string };

/**
 * Asserts that valuation can proceed: (1) a Professional Review exists for the period,
 * (2) no financial data update occurred after that review.
 * Use in DCF, LBO, and any CFA route that accepts periodLabel and uses tenant period financial data.
 */
export async function assertFreshnessForValuation(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<FreshnessResult> {
  const reviewCompletedAt = await getLatestReviewRunAt(pool, tenantId, periodLabel);
  if (reviewCompletedAt == null) {
    return {
      allowed: false,
      status: 403,
      code: 'PROFESSIONAL_REVIEW_REQUIRED',
      message: PROFESSIONAL_REVIEW_REQUIRED_MESSAGE,
    };
  }

  const dataUpdatedAt = await getLatestUpdatedAt(pool, tenantId, periodLabel);
  if (dataUpdatedAt != null && new Date(dataUpdatedAt) > new Date(reviewCompletedAt)) {
    return {
      allowed: false,
      status: 412,
      code: 'DATA_STATE_MISMATCH',
      message: DATA_STATE_MISMATCH_MESSAGE,
    };
  }

  return { allowed: true };
}
