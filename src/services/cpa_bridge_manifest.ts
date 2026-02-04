/**
 * CPA Bridge Manifest — Strict mapping from agent recommendation "Standard" to deterministic services.
 * Agent output must map to one of these keys; the decision handler validates and executes the corresponding service.
 */

export type BridgeStandardKey = 'Lease' | 'Revenue' | 'FixedAsset' | 'Tax';

export interface BridgeEntry {
  /** Display name for audit (e.g. "ASC 842 Lease") */
  standardName: string;
  /** Required parameter keys; missing any yields "Incomplete Judgment: Missing X for Y" */
  required: string[];
  /** Optional parameter keys (e.g. start_date for FixedAsset) */
  optional?: string[];
}

export const CPA_BRIDGE_MANIFEST: Record<BridgeStandardKey, BridgeEntry> = {
  Lease: {
    standardName: 'ASC 842 / IFRS 16 Lease',
    required: ['term', 'rate', 'payment', 'standard'],
    optional: ['paymentFrequency', 'economicLifeMonths', 'fairValueOfAsset'],
  },
  Revenue: {
    standardName: 'ASC 606 / IFRS 15 Revenue',
    required: ['amount', 'periods', 'start_date'],
    optional: [],
  },
  FixedAsset: {
    standardName: 'ASC 360 Fixed Asset',
    required: ['cost', 'life', 'method'],
    optional: ['start_date', 'salvageValue'],
  },
  Tax: {
    standardName: 'ASC 740 / IAS 12 Deferred Tax',
    required: ['temp_diff', 'rate'],
    optional: ['isDeductibleTemp', 'reportDate'],
  },
};

/** Service module paths (for documentation / handler imports). */
export const BRIDGE_SERVICE_PATHS: Record<BridgeStandardKey, string> = {
  Lease: 'src/services/lease_service.ts',
  Revenue: 'src/services/revenue_recognition_service.ts',
  FixedAsset: 'src/services/fixed_asset_service.ts',
  Tax: 'src/services/deferred_tax_service.ts',
};

export function isBridgeStandardKey(key: string): key is BridgeStandardKey {
  return key === 'Lease' || key === 'Revenue' || key === 'FixedAsset' || key === 'Tax';
}

export function getRequiredParams(standard: BridgeStandardKey): string[] {
  return [...CPA_BRIDGE_MANIFEST[standard].required];
}

export function getStandardName(standard: BridgeStandardKey): string {
  return CPA_BRIDGE_MANIFEST[standard].standardName;
}
