/**
 * Accounting standards registry — ASPE (Canada Private), IFRS (International / Canada Public).
 */

export {
  getStandardsRegistry,
  requiresLeaseLiabilityCalculation,
  usesSimplifiedDepreciation,
  ASPE_REGISTRY,
  IFRS_REGISTRY,
  FRS102_REGISTRY,
  US_GAAP_REGISTRY,
} from './standards_registry.js';
export type {
  AccountingStandard,
  StandardPrinciple,
  StandardsRegistryEntry,
} from './standards_registry.js';
export {
  getLeaseTopicStandard,
  getRevenueTopicStandard,
  getEpsTopicStandard,
  getFxTopicStandard,
  resolveLeaseStandard,
} from './topic_standard_map.js';
export type {
  LeaseTopicStandard,
  RevenueTopicStandard,
  EpsTopicStandard,
  FxTopicStandard,
} from './topic_standard_map.js';
