import type { BalanceSheet, CodificationRef, FinancialStatementLine, ProfitAndLoss, TrialBalanceEntry } from '../../types/financial.js';
import type { AccountingStandard } from './standards_registry.js';

export interface PresentationReferences {
  balanceSheet: CodificationRef;
  incomeStatement: CodificationRef;
}

const REFERENCES: Record<AccountingStandard, PresentationReferences> = {
  ASPE: {
    balanceSheet: { framework: 'ASPE', citation: 'ASPE 1521', description: 'Balance Sheet' },
    incomeStatement: { framework: 'ASPE', citation: 'ASPE 1520', description: 'Income Statement' },
  },
  IFRS: {
    balanceSheet: { framework: 'IASB', citation: 'IAS 1.54', description: 'Statement of financial position' },
    incomeStatement: { framework: 'IASB', citation: 'IAS 1.81', description: 'Statement of profit or loss' },
  },
  FRS102: {
    balanceSheet: { framework: 'FRS102', citation: 'FRS 102 Section 4', description: 'Statement of Financial Position' },
    incomeStatement: { framework: 'FRS102', citation: 'FRS 102 Section 5', description: 'Statement of Comprehensive Income and Income Statement' },
  },
  US_GAAP: {
    balanceSheet: { framework: 'FASB', citation: 'ASC 210-10-45', description: 'Balance Sheet—Overall Presentation' },
    incomeStatement: { framework: 'FASB', citation: 'ASC 220-10-45', description: 'Comprehensive Income—Overall Presentation' },
  },
};

export function normalizeAccountingStandard(value: string | undefined): AccountingStandard {
  const normalized = value?.trim().toUpperCase().replace(/[ -]/g, '_');
  if (normalized === 'ASPE') return 'ASPE';
  if (normalized === 'IFRS') return 'IFRS';
  if (normalized === 'FRS102' || normalized === 'FRS_102') return 'FRS102';
  if (normalized === 'GAAP' || normalized === 'US_GAAP') return 'US_GAAP';
  throw new Error(`Unsupported accounting standard: ${value ?? '(missing)'}. A reporting framework must be configured explicitly.`);
}

export function getPresentationReferences(standard: AccountingStandard): PresentationReferences {
  return REFERENCES[standard];
}

function withReference(lines: FinancialStatementLine[] | undefined, reference: CodificationRef): FinancialStatementLine[] | undefined {
  return lines?.map((line) => ({ ...line, codificationRef: reference }));
}

/** Replace legacy default citations so a statement never claims the wrong framework. */
export function applyPresentationReferences(
  standard: AccountingStandard,
  balanceSheet: BalanceSheet,
  profitAndLoss: ProfitAndLoss
): { balanceSheet: BalanceSheet; profitAndLoss: ProfitAndLoss } {
  const refs = getPresentationReferences(standard);
  return {
    balanceSheet: {
      ...balanceSheet,
      codificationRef: refs.balanceSheet,
      assets: withReference(balanceSheet.assets, refs.balanceSheet) ?? [],
      liabilities: withReference(balanceSheet.liabilities, refs.balanceSheet) ?? [],
      equity: withReference(balanceSheet.equity, refs.balanceSheet) ?? [],
      currentAssets: withReference(balanceSheet.currentAssets, refs.balanceSheet),
      noncurrentAssets: withReference(balanceSheet.noncurrentAssets, refs.balanceSheet),
      unclassifiedAssets: withReference(balanceSheet.unclassifiedAssets, refs.balanceSheet),
      currentLiabilities: withReference(balanceSheet.currentLiabilities, refs.balanceSheet),
      noncurrentLiabilities: withReference(balanceSheet.noncurrentLiabilities, refs.balanceSheet),
      unclassifiedLiabilities: withReference(balanceSheet.unclassifiedLiabilities, refs.balanceSheet),
      oci: balanceSheet.oci
        ? { ...balanceSheet.oci, items: withReference(balanceSheet.oci.items, refs.balanceSheet) ?? [] }
        : undefined,
    },
    profitAndLoss: {
      ...profitAndLoss,
      codificationRef: refs.incomeStatement,
      revenue: withReference(profitAndLoss.revenue, refs.incomeStatement) ?? [],
      expenses: withReference(profitAndLoss.expenses, refs.incomeStatement) ?? [],
      cogs: withReference(profitAndLoss.cogs, refs.incomeStatement),
      operatingExpenses: withReference(profitAndLoss.operatingExpenses, refs.incomeStatement),
      otherIncomeExpense: withReference(profitAndLoss.otherIncomeExpense, refs.incomeStatement),
      taxExpense: withReference(profitAndLoss.taxExpense, refs.incomeStatement),
      discontinuedOperations: profitAndLoss.discontinuedOperations
        ? {
            ...profitAndLoss.discontinuedOperations,
            items: withReference(profitAndLoss.discontinuedOperations.items, refs.incomeStatement) ?? [],
          }
        : undefined,
    },
  };
}

export function applyEntryPresentationReferences(
  standard: AccountingStandard,
  entries: TrialBalanceEntry[]
): TrialBalanceEntry[] {
  const refs = getPresentationReferences(standard);
  return entries.map((entry) => ({
    ...entry,
    codificationRef: entry.accountType === 'REVENUE' || entry.accountType === 'EXPENSE'
      ? refs.incomeStatement
      : refs.balanceSheet,
  }));
}
