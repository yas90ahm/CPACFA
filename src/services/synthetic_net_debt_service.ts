/**
 * Synthetic net debt for DCF/LBO: lease liability from register + optional CPA embedded-lease flag.
 * CFA-only: uses lease register; Integrated: also considers CPA substance_over_form flags.
 */

import type { Pool } from 'pg';
import { getLeasePosition } from './lease_service.js';
import { getFlags, getFlagsForContext } from './risk_context_store.js';
import { ENABLE_CPA_MODULE } from '../lib/capability_flags.js';

export interface SyntheticNetDebtInput {
  tenantId: string;
  pool: Pool | null;
  periodLabel?: string;
  /** Reported net debt (debt - cash) from balance sheet; optional. */
  reportedNetDebt?: number;
}

export interface SyntheticNetDebtResult {
  reportedNetDebt: number;
  leaseLiability: number;
  /** When true, CPA flagged embedded lease; consider adding estimated liability. */
  hasEmbeddedLeaseFlag: boolean;
  /** suggestedNetDebt = reportedNetDebt + leaseLiability (no numeric embedded-lease amount from flags). */
  suggestedNetDebt: number;
}

/**
 * Compute suggested net debt for valuation: reported net debt + lease liability from register.
 * When Integration is on and CPA flagged substance_over_form, hasEmbeddedLeaseFlag is true (caller may add estimate).
 */
export async function getSyntheticNetDebt(input: SyntheticNetDebtInput): Promise<SyntheticNetDebtResult> {
  const reported = input.reportedNetDebt ?? 0;
  let leaseLiability = 0;
  if (input.pool && input.periodLabel) {
    try {
      const position = await getLeasePosition(input.tenantId, input.pool, input.periodLabel);
      leaseLiability = position.totalLeaseLiability ?? 0;
    } catch {
      // no lease data
    }
  }
  let hasEmbeddedLeaseFlag = false;
  if (ENABLE_CPA_MODULE) {
    const flags = input.pool
      ? await getFlagsForContext(input.pool, input.tenantId, input.periodLabel)
      : getFlags(input.tenantId, input.periodLabel);
    hasEmbeddedLeaseFlag = flags.some((f) => f.category === 'substance_over_form');
  }
  const suggestedNetDebt = reported + leaseLiability;
  let professionalDisclaimer: string | undefined;
  if (input.pool && input.periodLabel) {
    const missing = await getQualitativeEvidenceMissing(input.pool, input.tenantId, input.periodLabel);
    if (missing) professionalDisclaimer = PROFESSIONAL_DISCLAIMER;
  }
  return {
    reportedNetDebt: reported,
    leaseLiability,
    hasEmbeddedLeaseFlag,
    suggestedNetDebt,
    ...(professionalDisclaimer && { professionalDisclaimer }),
  };
}
