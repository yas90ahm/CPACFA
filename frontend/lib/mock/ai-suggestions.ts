export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface AIMappingSuggestion {
  id: string;
  accountCode: string;
  accountName: string;
  suggestedReportingLineId: string;
  suggestedReportingLineName: string;
  confidence: ConfidenceLevel;
  reasoning: string;
}

export const mockAISuggestions: AIMappingSuggestion[] = [
  {
    id: 'ai-1',
    accountCode: '6200',
    accountName: 'Office Supplies',
    suggestedReportingLineId: 'opex-gen',
    suggestedReportingLineName: 'Operating Expenses — General',
    confidence: 'High',
    reasoning: 'Account name and type indicate general operating expense classification.',
  },
  {
    id: 'ai-2',
    accountCode: '6800',
    accountName: 'Shipping',
    suggestedReportingLineId: 'cogs-oh',
    suggestedReportingLineName: 'COGS — Overhead',
    confidence: 'Medium',
    reasoning: 'Shipping often classified as COGS for product companies; could also be Operating Expenses — General.',
  },
  {
    id: 'ai-3',
    accountCode: '7350',
    accountName: 'Miscellaneous Expense',
    suggestedReportingLineId: 'opex-gen',
    suggestedReportingLineName: 'Operating Expenses — General',
    confidence: 'Low',
    reasoning: 'Generic account; recommend manual review for proper classification.',
  },
];
