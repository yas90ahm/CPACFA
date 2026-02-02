/**
 * Topic-to-standard mapping: AccountingStandard → topic-level codification.
 * Enables callers to pass only AccountingStandard; app resolves to asc842/ifrs16 etc. internally.
 */

import type { AccountingStandard } from './standards_registry.js';

/** Topic-level standard for leases (ASC 842 vs IFRS 16). */
export type LeaseTopicStandard = 'asc842' | 'ifrs16';

/** Topic-level standard for revenue (ASC 606 vs IFRS 15). */
export type RevenueTopicStandard = 'asc606' | 'ifrs15';

/** Topic-level standard for EPS (ASC 260 vs IAS 33). */
export type EpsTopicStandard = 'asc260' | 'ias33';

/** Topic-level standard for FX (ASC 830 vs IAS 21). */
export type FxTopicStandard = 'asc830' | 'ias21';

const LEASE_MAP: Record<AccountingStandard, LeaseTopicStandard> = {
  US_GAAP: 'asc842',
  IFRS: 'ifrs16',
  ASPE: 'asc842',   // operating/finance classification; no single-model ROU
  FRS102: 'asc842',  // operating/finance; same classification logic
};

const REVENUE_MAP: Record<AccountingStandard, RevenueTopicStandard> = {
  US_GAAP: 'asc606',
  IFRS: 'ifrs15',
  ASPE: 'asc606',   // contract-based optional; asc606-style for SMEs
  FRS102: 'asc606', // FRS 102 Section 23 aligns with IFRS 15 principles
};

const EPS_MAP: Record<AccountingStandard, EpsTopicStandard> = {
  US_GAAP: 'asc260',
  IFRS: 'ias33',
  ASPE: 'asc260',
  FRS102: 'asc260',
};

const FX_MAP: Record<AccountingStandard, FxTopicStandard> = {
  US_GAAP: 'asc830',
  IFRS: 'ias21',
  ASPE: 'asc830',
  FRS102: 'asc830',
};

/** Resolve AccountingStandard to lease topic standard (asc842 | ifrs16). */
export function getLeaseTopicStandard(accountingStandard: AccountingStandard): LeaseTopicStandard {
  return LEASE_MAP[accountingStandard];
}

/** Resolve AccountingStandard to revenue topic standard (asc606 | ifrs15). */
export function getRevenueTopicStandard(accountingStandard: AccountingStandard): RevenueTopicStandard {
  return REVENUE_MAP[accountingStandard];
}

/** Resolve AccountingStandard to EPS topic standard (asc260 | ias33). */
export function getEpsTopicStandard(accountingStandard: AccountingStandard): EpsTopicStandard {
  return EPS_MAP[accountingStandard];
}

/** Resolve AccountingStandard to FX topic standard (asc830 | ias21). */
export function getFxTopicStandard(accountingStandard: AccountingStandard): FxTopicStandard {
  return FX_MAP[accountingStandard];
}

/**
 * Resolve lease standard: prefer explicit topic-level standard; otherwise derive from AccountingStandard.
 */
export function resolveLeaseStandard(
  topicStandard?: LeaseTopicStandard,
  accountingStandard?: AccountingStandard
): LeaseTopicStandard | undefined {
  if (topicStandard) return topicStandard;
  if (accountingStandard) return getLeaseTopicStandard(accountingStandard);
  return undefined;
}
