/**
 * Accounting standards registry — core principles by framework.
 * ASPE (Canada Private), IFRS (International / Canada Public).
 */

export type AccountingStandard = 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP';

export interface StandardPrinciple {
  id: string;
  title: string;
  description: string;
  citation?: string;
}

export interface StandardsRegistryEntry {
  standard: AccountingStandard;
  name: string;
  scope: string;
  revenueRecognition: StandardPrinciple[];
  assetMeasurement: StandardPrinciple[];
  leaseAccounting: StandardPrinciple[];
  depreciation: StandardPrinciple[];
}

/** ASPE — Canadian Accounting Standards for Private Enterprises */
export const ASPE_REGISTRY: StandardsRegistryEntry = {
  standard: 'ASPE',
  name: 'Accounting Standards for Private Enterprises',
  scope: 'Canada — Private entities. Simplified, cost-effective reporting.',
  revenueRecognition: [
    {
      id: 'aspe-revenue-1',
      title: 'Simplified revenue recognition',
      description: 'Revenue is generally recognized when earned and realized or realizable. Less prescriptive than IFRS 15; allows practical expedients for private entities.',
      citation: 'ASPE 3400 Revenue',
    },
    {
      id: 'aspe-revenue-2',
      title: 'Contract-based revenue (optional)',
      description: 'Private entities may apply a simplified approach to multiple-element arrangements.',
      citation: 'ASPE 3400.10–.15',
    },
  ],
  assetMeasurement: [
    {
      id: 'aspe-asset-1',
      title: 'Historical cost for assets',
      description: 'Property, plant and equipment and most other assets are carried at cost. Revaluation to fair value is not required.',
      citation: 'ASPE 3061 Property, Plant and Equipment',
    },
    {
      id: 'aspe-asset-2',
      title: 'Cost model',
      description: 'Subsequent measurement at cost less accumulated depreciation and impairment. No fair value through OCI or P&L for PPE.',
      citation: 'ASPE 3061.09',
    },
  ],
  leaseAccounting: [
    {
      id: 'aspe-lease-1',
      title: 'Operating vs finance lease classification',
      description: 'Lessees classify leases as operating or finance. Operating leases are off-balance-sheet (rent expense). No single-model capitalization like IFRS 16.',
      citation: 'ASPE 3065 Leases',
    },
    {
      id: 'aspe-lease-2',
      title: 'Simplified lease disclosure',
      description: 'Fewer disclosure requirements than IFRS 16 for lessees.',
      citation: 'ASPE 3065.21–.24',
    },
  ],
  depreciation: [
    {
      id: 'aspe-dep-1',
      title: 'Simplified depreciation logic',
      description: 'Straight-line is common; other methods (declining balance, units of production) permitted. Management chooses method and useful life; no mandatory component approach.',
      citation: 'ASPE 3061.09–.12',
    },
    {
      id: 'aspe-dep-2',
      title: 'No component depreciation required',
      description: 'Components of an asset may be depreciated as a single unit; component-level depreciation is optional.',
      citation: 'ASPE 3061',
    },
  ],
};

/** IFRS — International Financial Reporting Standards (Canada Public / International) */
export const IFRS_REGISTRY: StandardsRegistryEntry = {
  standard: 'IFRS',
  name: 'International Financial Reporting Standards',
  scope: 'International / Canada — Publicly accountable and other entities adopting IFRS.',
  revenueRecognition: [
    {
      id: 'ifrs-revenue-1',
      title: 'Contract-based revenue (IFRS 15)',
      description: 'Revenue from contracts with customers: identify contract, performance obligations, transaction price, allocate and recognize when control transfers.',
      citation: 'IFRS 15 Revenue from Contracts with Customers',
    },
    {
      id: 'ifrs-revenue-2',
      title: 'Five-step model',
      description: 'Identify contract, identify performance obligations, determine transaction price, allocate price, recognize revenue when (or as) obligation is satisfied.',
      citation: 'IFRS 15.31–.45',
    },
  ],
  assetMeasurement: [
    {
      id: 'ifrs-asset-1',
      title: 'Fair value accounting permitted',
      description: 'IAS 40 allows fair value model for investment property. IAS 16 allows revaluation model for PPE. Fair value through OCI or P&L where applicable.',
      citation: 'IAS 16 Property, Plant and Equipment; IAS 40 Investment Property',
    },
    {
      id: 'ifrs-asset-2',
      title: 'Cost or revaluation model (PPE)',
      description: 'After initial recognition, PPE measured at cost less depreciation and impairment, or revalued to fair value (revaluation model).',
      citation: 'IAS 16.29–.31',
    },
  ],
  leaseAccounting: [
    {
      id: 'ifrs-lease-1',
      title: 'Strict lease capitalization (IFRS 16)',
      description: 'At commencement, lessee recognizes a right-of-use asset and a lease liability. Lease liability = PV of lease payments. Single lessee model; most leases on balance sheet.',
      citation: 'IFRS 16 Leases',
    },
    {
      id: 'ifrs-lease-2',
      title: 'Lease liability calculation',
      description: 'Lease liability measured at present value of lease payments (discount rate: lessee’s incremental borrowing rate or lessor’s implicit rate if readily determinable).',
      citation: 'IFRS 16.26–.27',
    },
  ],
  depreciation: [
    {
      id: 'ifrs-dep-1',
      title: 'Component depreciation (IAS 16)',
      description: 'Each significant part of an item of PPE is depreciated separately. Components with different useful lives or consumption patterns must be identified.',
      citation: 'IAS 16.43–.44',
    },
    {
      id: 'ifrs-dep-2',
      title: 'Depreciation method and useful life',
      description: 'Method (straight-line, diminishing balance, units of production) and useful life reviewed at least annually. Reflect pattern of consumption.',
      citation: 'IAS 16.60–.62',
    },
  ],
};

/** UK GAAP — FRS 102 (agentic: full principles and notes content) */
export const FRS102_REGISTRY: StandardsRegistryEntry = {
  standard: 'FRS102',
  name: 'UK GAAP — FRS 102',
  scope: 'United Kingdom — UK GAAP for SMEs and other eligible entities (FRS 102 The Financial Reporting Standard applicable in the UK and Republic of Ireland).',
  revenueRecognition: [
    {
      id: 'frs102-revenue-1',
      title: 'Revenue from contracts with customers',
      description: 'Revenue is recognised when (or as) the entity satisfies a performance obligation by transferring a promised good or service to the customer. Amount recognised is the consideration to which the entity expects to be entitled. FRS 102 Section 23 aligns with the principles of IFRS 15 for SMEs.',
      citation: 'FRS 102 Section 23 Revenue',
    },
    {
      id: 'frs102-revenue-2',
      title: 'Practical expedients for SMEs',
      description: 'Simplified approaches are permitted for contract costs, contract modifications and other areas where full IFRS 15 would be disproportionate for smaller entities.',
      citation: 'FRS 102 Section 23.3–.11',
    },
  ],
  assetMeasurement: [
    {
      id: 'frs102-asset-1',
      title: 'Historical cost and optional revaluation',
      description: 'Property, plant and equipment are initially measured at cost. Subsequent measurement: cost model (default) or revaluation model for entire class of PPE. Revaluation must be carried out with sufficient regularity.',
      citation: 'FRS 102 Section 17 Property, Plant and Equipment',
    },
    {
      id: 'frs102-asset-2',
      title: 'Fair value in business combinations',
      description: 'Assets acquired in a business combination are measured at fair value at acquisition date. Goodwill is not amortised but tested for impairment annually (or when indicated).',
      citation: 'FRS 102 Section 19 Business Combinations and Goodwill',
    },
  ],
  leaseAccounting: [
    {
      id: 'frs102-lease-1',
      title: 'Operating vs finance lease classification',
      description: 'Lessees classify leases as operating or finance leases using the risks-and-rewards test. Operating leases: rent expense over term; no right-of-use asset or lease liability on balance sheet for most SME lessees.',
      citation: 'FRS 102 Section 20 Leases',
    },
    {
      id: 'frs102-lease-2',
      title: 'Disclosure of commitments',
      description: 'Lessees disclose future minimum lease payments under non-cancellable operating leases (analysis by period).',
      citation: 'FRS 102 Section 20.14–.15',
    },
  ],
  depreciation: [
    {
      id: 'frs102-dep-1',
      title: 'Systematic allocation over useful life',
      description: 'Depreciation is allocated systematically over the asset’s useful life. Residual value and useful life are reviewed at least at each reporting date. Common methods: straight-line, diminishing balance, units of production.',
      citation: 'FRS 102 Section 17.15–.19',
    },
    {
      id: 'frs102-dep-2',
      title: 'Component approach optional',
      description: 'Components of an item of PPE with different useful lives may be depreciated separately; otherwise the item is depreciated as a single unit.',
      citation: 'FRS 102 Section 17.16',
    },
  ],
};

/** US GAAP — ASC (FASB Codification) */
export const US_GAAP_REGISTRY: StandardsRegistryEntry = {
  standard: 'US_GAAP',
  name: 'US GAAP',
  scope: 'United States — Generally Accepted Accounting Principles.',
  revenueRecognition: [
    {
      id: 'us-gaap-revenue-1',
      title: 'Revenue from contracts with customers (ASC 606)',
      description: 'Revenue is recognized when (or as) the entity satisfies a performance obligation by transferring a promised good or service to the customer. Amount recognized is the consideration to which the entity expects to be entitled. Five-step model: identify contract, performance obligations, transaction price, allocate price, recognize when obligation is satisfied.',
      citation: 'ASC 606 Revenue from Contracts with Customers',
    },
    {
      id: 'us-gaap-revenue-2',
      title: 'Five-step model',
      description: 'Identify the contract(s), identify performance obligations, determine transaction price, allocate price to obligations, recognize revenue when (or as) each performance obligation is satisfied.',
      citation: 'ASC 606-10-25',
    },
  ],
  assetMeasurement: [
    {
      id: 'us-gaap-asset-1',
      title: 'Property, plant and equipment at cost',
      description: 'PP&E is measured at cost at acquisition. Subsequent measurement: cost less accumulated depreciation and impairment. Revaluation is not permitted under US GAAP.',
      citation: 'ASC 360 Property, Plant and Equipment',
    },
    {
      id: 'us-gaap-asset-2',
      title: 'Impairment and held-for-sale',
      description: 'Long-lived assets are reviewed for impairment when events or changes indicate carrying amount may not be recoverable. Assets held for sale are measured at the lower of carrying amount or fair value less cost to sell.',
      citation: 'ASC 360-10-35',
    },
  ],
  leaseAccounting: [
    {
      id: 'us-gaap-lease-1',
      title: 'Lessee model (ASC 842)',
      description: 'At commencement, a lessee recognizes a right-of-use asset and a lease liability. Lease liability equals the present value of lease payments. Operating and finance leases are both on balance sheet; classification affects expense pattern.',
      citation: 'ASC 842 Leases',
    },
    {
      id: 'us-gaap-lease-2',
      title: 'Lease classification and measurement',
      description: 'Lessees classify leases as operating or finance (e.g. ownership transfer, purchase option reasonably certain, term is major part of economic life, or PV of payments is substantially all of fair value). Lease liability and ROU asset measured at commencement using discount rate (lessee IBR or lessor implicit rate if readily determinable).',
      citation: 'ASC 842-20-25',
    },
  ],
  depreciation: [
    {
      id: 'us-gaap-dep-1',
      title: 'Systematic allocation over useful life',
      description: 'Depreciation is allocated over the asset’s useful life using a method that reflects the pattern in which the asset’s future economic benefits are expected to be consumed. Straight-line, declining balance, and units-of-production are common.',
      citation: 'ASC 360-10-35',
    },
    {
      id: 'us-gaap-dep-2',
      title: 'Component depreciation',
      description: 'Significant parts of an asset with different useful lives or consumption patterns may be depreciated separately.',
      citation: 'ASC 360-10-35-17',
    },
  ],
};

const REGISTRY: Record<AccountingStandard, StandardsRegistryEntry> = {
  ASPE: ASPE_REGISTRY,
  IFRS: IFRS_REGISTRY,
  FRS102: FRS102_REGISTRY,
  US_GAAP: US_GAAP_REGISTRY,
};

/** Get the full registry entry for a standard. */
export function getStandardsRegistry(standard: AccountingStandard): StandardsRegistryEntry {
  return REGISTRY[standard];
}

/** Check if the standard requires lease liability calculation (IFRS 16 / ASC 842). */
export function requiresLeaseLiabilityCalculation(standard: AccountingStandard): boolean {
  return standard === 'IFRS' || standard === 'US_GAAP';
}

/** Check if the standard uses simplified depreciation (ASPE-style). */
export function usesSimplifiedDepreciation(standard: AccountingStandard): boolean {
  return standard === 'ASPE';
}
