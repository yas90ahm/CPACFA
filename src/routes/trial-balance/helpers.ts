/**
 * Shared helpers for trial-balance routes (ingest, parser).
 */

import type { FinancialStatementsOutput } from '../../types/financial.js';

export function normalizeStandard(value?: string): 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP' | undefined {
  if (!value) return undefined;
  const v = value.toUpperCase();
  if (v === 'ASPE' || v === 'IFRS' || v === 'FRS102' || v === 'US_GAAP') return v;
  return undefined;
}

export function parseTransactions(
  raw?: string
): Array<{
  date?: string;
  amount: number;
  description?: string;
  counterparty?: string;
  debit?: number;
  credit?: number;
}> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed
      .map((t: { date?: unknown; amount?: unknown; description?: unknown; counterparty?: unknown; debit?: unknown; credit?: unknown }) => ({
        date: typeof t?.date === 'string' ? t.date : undefined,
        amount: Number(t?.amount) || 0,
        description: typeof t?.description === 'string' ? t.description : undefined,
        counterparty: typeof t?.counterparty === 'string' ? t.counterparty : undefined,
        debit: t?.debit != null ? Number(t.debit) : undefined,
        credit: t?.credit != null ? Number(t.credit) : undefined,
      }))
      .filter((t) => t.amount !== 0);
  } catch {
    return undefined;
  }
}

export function attachLineProvenance(
  statements: FinancialStatementsOutput,
  options: {
    sourceDocumentId: string;
    sourceDocumentName: string;
    reasoningChainId: string;
    reasoningChainTimestamp: string;
  }
): void {
  const apply = (lines: Array<{ label: string; amount: number; sourceDocumentId?: string; sourceDocumentUrl?: string; reasoningMonologueId?: string; reasoningMonologueTimestamp?: string }>) => {
    lines.forEach((line) => {
      line.sourceDocumentId = options.sourceDocumentId;
      line.sourceDocumentUrl = `/api/audit/source-document/${options.sourceDocumentId}`;
      line.reasoningMonologueId = options.reasoningChainId;
      line.reasoningMonologueTimestamp = options.reasoningChainTimestamp;
    });
  };
  apply(statements.balanceSheet.assets);
  apply(statements.balanceSheet.liabilities);
  apply(statements.balanceSheet.equity);
  apply(statements.profitAndLoss.revenue);
  apply(statements.profitAndLoss.expenses);
}

export function attachCategories(
  transactions: Array<{ date?: string; amount: number; description?: string }>,
  categories: Array<'operating' | 'investing' | 'financing'>
): Array<{ date?: string; amount: number; description?: string; category?: 'operating' | 'investing' | 'financing' }> {
  return transactions.map((t, i) => ({ ...t, category: categories[i] ?? 'operating' }));
}
