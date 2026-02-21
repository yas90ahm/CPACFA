import type { TaxonomyNode } from '@/lib/mock/taxonomy';

/** Taxonomy with account counts and balances for settings/reporting view. */
export const mockTaxonomyFull: TaxonomyNode[] = [
  {
    id: 'is',
    label: 'Income Statement',
    children: [
      {
        id: 'rev',
        label: 'Revenue',
        children: [
          { id: 'rev-prod', label: 'Revenue — Product Sales', accountCount: 12, totalBalance: 18450000 },
          { id: 'rev-svc', label: 'Revenue — Service Income', accountCount: 3, totalBalance: 2340000 },
          { id: 'rev-other', label: 'Revenue — Other', accountCount: 1, totalBalance: 12000 },
        ],
      },
      {
        id: 'cogs',
        label: 'Cost of Goods Sold',
        children: [
          { id: 'cogs-mat', label: 'COGS — Materials', accountCount: 2, totalBalance: 8120000 },
          { id: 'cogs-labor', label: 'COGS — Direct Labor', accountCount: 1, totalBalance: 3450000 },
          { id: 'cogs-oh', label: 'COGS — Manufacturing Overhead', accountCount: 3, totalBalance: 1890000 },
        ],
      },
      {
        id: 'opex',
        label: 'Operating Expenses',
        children: [
          { id: 'opex-sal', label: 'Salaries & Wages', accountCount: 2, totalBalance: 2425000 },
          { id: 'opex-rent', label: 'Rent Expense', accountCount: 1, totalBalance: 185000 },
          { id: 'opex-depr', label: 'Depreciation Expense', accountCount: 1, totalBalance: 57500 },
        ],
      },
    ],
  },
  {
    id: 'bs',
    label: 'Balance Sheet',
    children: [
      { id: 'ca', label: 'Current Assets', children: [] },
      { id: 'nca', label: 'Non-Current Assets', children: [] },
      { id: 'cl', label: 'Current Liabilities', children: [] },
      { id: 'ncl', label: 'Non-Current Liabilities', children: [] },
      { id: 'eq', label: 'Stockholders Equity', children: [] },
    ],
  },
  {
    id: 'cfs',
    label: 'Cash Flow Statement',
    children: [
      { id: 'cfs-op', label: 'Operating Activities', children: [] },
      { id: 'cfs-inv', label: 'Investing Activities', children: [] },
      { id: 'cfs-fin', label: 'Financing Activities', children: [] },
    ],
  },
  {
    id: 'seq',
    label: 'Statement of Stockholders Equity',
    children: [{ id: 'seq-comp', label: 'Equity Components', children: [] }],
  },
];

export function getTaxonomyFull(_entityId: string): TaxonomyNode[] {
  return mockTaxonomyFull;
}
