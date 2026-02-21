export interface TaxonomyNode {
  id: string;
  label: string;
  children?: TaxonomyNode[];
  accountCount?: number;
  totalBalance?: number;
}

export const mockTaxonomy: TaxonomyNode[] = [
  {
    id: 'is',
    label: 'Income Statement',
    children: [
      {
        id: 'rev',
        label: 'Revenue',
        children: [
          { id: 'rev-prod', label: 'Revenue — Products' },
          { id: 'rev-svc', label: 'Revenue — Services' },
          { id: 'rev-other', label: 'Revenue — Other' },
        ],
      },
      {
        id: 'cogs',
        label: 'Cost of Goods Sold',
        children: [
          { id: 'cogs-mat', label: 'COGS — Materials' },
          { id: 'cogs-labor', label: 'COGS — Direct Labor' },
          { id: 'cogs-oh', label: 'COGS — Overhead' },
        ],
      },
      {
        id: 'opex',
        label: 'Operating Expenses',
        children: [
          { id: 'opex-sal', label: 'Operating Expenses — Salaries' },
          { id: 'opex-rent', label: 'Operating Expenses — Rent' },
          { id: 'opex-depr', label: 'Operating Expenses — Depreciation' },
          { id: 'opex-gen', label: 'Operating Expenses — General' },
        ],
      },
    ],
  },
  {
    id: 'bs',
    label: 'Balance Sheet',
    children: [
      {
        id: 'ca',
        label: 'Current Assets',
        children: [
          { id: 'cash', label: 'Cash and Cash Equivalents' },
          { id: 'ar', label: 'Accounts Receivable' },
          { id: 'inv', label: 'Inventory' },
          { id: 'prepaid', label: 'Prepaid Expenses' },
        ],
      },
      {
        id: 'nca',
        label: 'Non-Current Assets',
        children: [
          { id: 'ppe', label: 'Property, Plant & Equipment' },
          { id: 'accdep', label: 'Accumulated Depreciation' },
        ],
      },
      {
        id: 'cl',
        label: 'Current Liabilities',
        children: [
          { id: 'ap', label: 'Accounts Payable' },
          { id: 'accrued', label: 'Accrued Expenses' },
          { id: 'curr-debt', label: 'Current Portion — Long-Term Debt' },
        ],
      },
      {
        id: 'ncl',
        label: 'Long-Term Liabilities',
        children: [{ id: 'ltd', label: 'Long-Term Debt' }],
      },
    ],
  },
  {
    id: 'cfs',
    label: 'Cash Flow Statement',
    children: [
      { id: 'cfs-op', label: 'Operating Activities' },
      { id: 'cfs-inv', label: 'Investing Activities' },
      { id: 'cfs-fin', label: 'Financing Activities' },
    ],
  },
  {
    id: 'eq',
    label: 'Stockholders Equity',
    children: [
      { id: 'eq-cs', label: 'Common Stock' },
      { id: 'eq-apic', label: 'Additional Paid-In Capital' },
      { id: 'eq-re', label: 'Retained Earnings' },
    ],
  },
];

export interface FlatLineItem {
  id: string;
  label: string;
  statementLabel: string;
  sectionLabel?: string;
}

function flatten(node: TaxonomyNode, statement: string, section?: string): FlatLineItem[] {
  const out: FlatLineItem[] = [];
  if (node.children?.length) {
    for (const c of node.children) {
      const subSection = node.id !== 'is' && node.id !== 'bs' && node.id !== 'cfs' && node.id !== 'eq' ? node.label : undefined;
      out.push(...flatten(c, statement, subSection ?? section));
    }
  } else {
    out.push({
      id: node.id,
      label: node.label,
      statementLabel: statement,
      sectionLabel: section,
    });
  }
  return out;
}

export const mockTaxonomyFlat: FlatLineItem[] = mockTaxonomy.flatMap((stmt) =>
  flatten(stmt, stmt.label)
);
