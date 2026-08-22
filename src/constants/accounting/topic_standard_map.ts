/**
 * Topic-to-standard mapping: AccountingStandard → topic-level codification.
 * Enables callers to pass only AccountingStandard; app resolves to asc842/ifrs16 etc. internally.
 */

import type { AccountingStandard } from './standards_registry.js';

/** Framework-native topic standards. Never alias ASPE or FRS 102 to ASC. */
export type LeaseTopicStandard = 'asc842' | 'ifrs16' | 'aspe3065' | 'frs102_20';

/** Topic-level standard for revenue (ASC 606 vs IFRS 15). */
export type RevenueTopicStandard = 'asc606' | 'ifrs15' | 'aspe3400' | 'frs102_23';

/** Topic-level standard for EPS (ASC 260 vs IAS 33). */
export type EpsTopicStandard = 'asc260' | 'ias33' | 'not_applicable_private_enterprise';

/** Topic-level standard for FX (ASC 830 vs IAS 21). */
export type FxTopicStandard = 'asc830' | 'ias21' | 'aspe1651' | 'frs102_30';

const LEASE_MAP: Record<AccountingStandard, LeaseTopicStandard> = {
  US_GAAP: 'asc842',
  IFRS: 'ifrs16',
  ASPE: 'aspe3065',
  FRS102: 'frs102_20',
};

const REVENUE_MAP: Record<AccountingStandard, RevenueTopicStandard> = {
  US_GAAP: 'asc606',
  IFRS: 'ifrs15',
  ASPE: 'aspe3400',
  FRS102: 'frs102_23',
};

const EPS_MAP: Record<AccountingStandard, EpsTopicStandard> = {
  US_GAAP: 'asc260',
  IFRS: 'ias33',
  ASPE: 'not_applicable_private_enterprise',
  FRS102: 'not_applicable_private_enterprise',
};

const FX_MAP: Record<AccountingStandard, FxTopicStandard> = {
  US_GAAP: 'asc830',
  IFRS: 'ias21',
  ASPE: 'aspe1651',
  FRS102: 'frs102_30',
};

/** Resolve AccountingStandard to its native lease topic standard. */
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
