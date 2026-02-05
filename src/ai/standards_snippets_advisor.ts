/**
 * Guidance snippets for Advisor (suggestion-only; no GAAP math).
 */

import type { AdvisorSnippet } from './prompts/advisor.prompt.js';

const DEFAULTS: AdvisorSnippet[] = [
  {
    rule_id: 'reclass_hint',
    title: 'Reclassification hint',
    snippet_markdown: 'Reclassification moves amounts between line items; use only amounts from source lines with sourceRef.',
  },
  {
    rule_id: 'accrual_candidate',
    title: 'Accrual candidate',
    snippet_markdown: 'Flag as accrual_candidate when expense/revenue recognized in period; do not compute amounts.',
  },
  {
    rule_id: 'deferral_candidate',
    title: 'Deferral candidate',
    snippet_markdown: 'Flag as deferral_candidate when prepaid or unearned; do not compute amounts.',
  },
  {
    rule_id: 'lease_candidate',
    title: 'Lease candidate',
    snippet_markdown: 'Flag as lease_candidate for review; amounts from deterministic engine or human only.',
  },
  {
    rule_id: 'mapping_fix',
    title: 'Mapping fix',
    snippet_markdown: 'Suggest mapping_fix when account key does not match COA; copy amount from source with sourceRef.',
  },
  {
    rule_id: 'missing_inputs',
    title: 'Missing inputs',
    snippet_markdown: 'When information is missing, list in missing_inputs; do not guess or invent amounts.',
  },
];

export function getDefaultSnippetsForAdvisor(): AdvisorSnippet[] {
  return [...DEFAULTS];
}
