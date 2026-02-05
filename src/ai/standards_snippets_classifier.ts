/**
 * Guidance snippets for Classifier (hints only, not GAAP text). No DB table.
 */

import type { ClassifierSnippet } from './prompts/classifier.prompt.js';

const DEFAULTS: ClassifierSnippet[] = [
  {
    rule_id: 'expense_in_period',
    title: 'Expense in period',
    snippet_markdown: 'Expense recognized in period incurred.',
  },
  {
    rule_id: 'prepaid_asset',
    title: 'Prepaid indicates asset',
    snippet_markdown: 'Prepaid amounts suggest asset classification.',
  },
  {
    rule_id: 'lease_candidate',
    title: 'Lease classification candidate',
    snippet_markdown: 'Lease terms suggest lease classification candidate; flag for human review.',
  },
  {
    rule_id: 'revenue_performance',
    title: 'Revenue performance obligation',
    snippet_markdown: 'Revenue requires performance obligation assessment.',
  },
  {
    rule_id: 'unknown_review',
    title: 'Unknown for human review',
    snippet_markdown: 'Unknown classification should be flagged for human review.',
  },
  {
    rule_id: 'equity_balance',
    title: 'Equity balance',
    snippet_markdown: 'Equity accounts reflect residual interest.',
  },
  {
    rule_id: 'liability_current',
    title: 'Current liability',
    snippet_markdown: 'Short-term obligations suggest bs.liability.current.',
  },
  {
    rule_id: 'asset_current',
    title: 'Current asset',
    snippet_markdown: 'Cash and near-cash suggest bs.asset.current.',
  },
];

export function getDefaultSnippetsForClassifier(): ClassifierSnippet[] {
  return [...DEFAULTS];
}
