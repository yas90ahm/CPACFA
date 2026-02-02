/**
 * Mandatory "similar precedent" for close steps.
 * After close context loader (1.3), every relevant close step calls this and attaches
 * precedent citations to the response for auditability.
 */

import { retrievePrecedentForEntry } from '../knowledge_base/vector_store/retrieval.js';
import type { RAGQueryResult } from '../knowledge_base/vector_store/types.js';

export type CloseStepName =
  | 'trial_balance_ingest'
  | 'trial_balance_statements'
  | 'prior_period_comparison'
  | 'plan_execute_verify';

export interface PrecedentForCloseStepContext {
  entityId?: string;
  currentPeriodLabel?: string;
  priorPeriodLabel?: string;
  standard?: string;
}

/** Summary of similar precedent for a close step (for API response). */
export interface SimilarPrecedentSummary {
  closeStep: CloseStepName;
  query: string;
  citationCount: number;
  citations: Array<{
    documentTitle: string;
    pageNumber: number;
    standardType: string;
    levelOfAuthority: string;
    citationCode?: string;
    excerpt: string;
  }>;
}

function queryForStep(step: CloseStepName, ctx: PrecedentForCloseStepContext): string {
  const parts: string[] = [];
  switch (step) {
    case 'trial_balance_ingest':
      parts.push('trial balance classification and financial statement generation from uploaded trial balance');
      break;
    case 'trial_balance_statements':
      parts.push('trial balance classification and financial statement generation');
      break;
    case 'prior_period_comparison':
      parts.push('prior period comparison and variance analysis');
      break;
    case 'plan_execute_verify':
      parts.push('plan execute verify balance sheet and income statement reconciliation');
      break;
    default:
      parts.push('period close and financial reporting');
  }
  if (ctx.standard) parts.push(`under ${ctx.standard}`);
  if (ctx.currentPeriodLabel) parts.push(`period ${ctx.currentPeriodLabel}`);
  if (ctx.priorPeriodLabel) parts.push(`prior ${ctx.priorPeriodLabel}`);
  return parts.join(' ');
}

/**
 * Mandatory call: retrieve similar precedent for this close step.
 * Returns a summary suitable for attaching to the close-step response.
 */
export function getPrecedentForCloseStep(
  step: CloseStepName,
  context: PrecedentForCloseStepContext,
  options?: { topK?: number; standardType?: 'GAAP' | 'IFRS' }
): RAGQueryResult {
  const query = queryForStep(step, context);
  return retrievePrecedentForEntry(query, {
    topK: options?.topK ?? 5,
    standardType: options?.standardType,
  });
}

/**
 * Build a short summary of precedent for API responses (auditability).
 */
export function toSimilarPrecedentSummary(
  step: CloseStepName,
  result: RAGQueryResult
): SimilarPrecedentSummary {
  return {
    closeStep: step,
    query: result.query,
    citationCount: result.citations.length,
    citations: result.citations.map((c) => ({
      documentTitle: c.documentTitle,
      pageNumber: c.pageNumber,
      standardType: c.standardType,
      levelOfAuthority: c.levelOfAuthority,
      citationCode: c.citationCode,
      excerpt: c.excerpt.slice(0, 300) + (c.excerpt.length > 300 ? '…' : ''),
    })),
  };
}
