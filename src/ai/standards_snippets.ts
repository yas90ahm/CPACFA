/**
 * Temporary default standards snippets for Justifier (no full library yet).
 */

import type { StandardsSnippet } from './prompts/justifier.prompt.js';

const DEFAULTS: StandardsSnippet[] = [
  { rule_id: 'no_ai_math', title: 'No AI math', snippet_markdown: 'Amounts are as provided; the AI does not compute or change any numbers.' },
  { rule_id: 'reclassification', title: 'Reclassification principle', snippet_markdown: 'Reclassifications move amounts between line items without changing total equity or net income.' },
  { rule_id: 'accrual', title: 'Accrual concept', snippet_markdown: 'Revenue and expenses are recognized when earned or incurred, not necessarily when cash is received or paid.' },
  { rule_id: 'materiality', title: 'Materiality note', snippet_markdown: 'Items are evaluated for materiality in the context of the financial statements as a whole.' },
  { rule_id: 'documentation', title: 'Documentation requirement', snippet_markdown: 'Supporting documentation and rationale should be retained for audit and review.' },
  { rule_id: 'asc_general', title: 'FASB ASC (General)', snippet_markdown: 'Apply GAAP as set out in the FASB Accounting Standards Codification where topic-specific guidance exists.' },
  { rule_id: 'ias_general', title: 'IAS/IFRS (General)', snippet_markdown: 'Apply IFRS as set out in IAS/IFRS standards where applicable.' },
];

export function getDefaultSnippetsForJustifier(): StandardsSnippet[] {
  return [...DEFAULTS];
}
