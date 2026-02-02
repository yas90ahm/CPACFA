/**
 * Notes and Accounting Policies generator (standard-specific).
 */

import type { NotesAndPolicies } from '../types/financial.js';
import { getStandardsRegistry } from '../constants/accounting/index.js';
import type { AccountingStandard } from '../constants/accounting/index.js';

export function buildNotesAndPolicies(standard: AccountingStandard): NotesAndPolicies {
  const registry = getStandardsRegistry(standard);
  const notes = [
    ...registry.revenueRecognition.map((p) => ({
      title: `Revenue Recognition — ${p.title}`,
      content: p.description,
      citation: p.citation,
    })),
    ...registry.assetMeasurement.map((p) => ({
      title: `Asset Measurement — ${p.title}`,
      content: p.description,
      citation: p.citation,
    })),
    ...registry.leaseAccounting.map((p) => ({
      title: `Lease Accounting — ${p.title}`,
      content: p.description,
      citation: p.citation,
    })),
    ...registry.depreciation.map((p) => ({
      title: `Depreciation — ${p.title}`,
      content: p.description,
      citation: p.citation,
    })),
  ];

  return {
    standard,
    notes: notes.length
      ? notes
      : [
          {
            title: 'Accounting Policies',
            content: 'Accounting policy content is not configured for this standard yet.',
          },
        ],
  };
}

