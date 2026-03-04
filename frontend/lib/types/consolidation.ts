export interface ConsolidationEntity {
  id: string;
  name: string;
  parentId?: string;
  currency: string;
  standard?: string;
}

export interface EntityBalance {
  entityId: string;
  lines: { accountName: string; amount: number; side: 'debit' | 'credit' }[];
}

export interface EliminationRule {
  id: string;
  name: string;
  debitAccount: string;
  creditAccount: string;
  amountType: 'balance' | 'fixed' | 'formula';
  amount?: number;
  formula?: string;
}

export interface ConsolidationInput {
  entities: ConsolidationEntity[];
  entityBalances: EntityBalance[];
  eliminationRules: EliminationRule[];
  reportingCurrency: string;
  fxRates?: Record<string, number>;
  periodLabel: string;
  nciPercentByEntity?: Record<string, number>;
  materiality?: number;
}

export interface ConsolidatedLine {
  accountName: string;
  amount: number;
  side: 'debit' | 'credit';
  source: 'entity' | 'elimination';
}

export interface ConsolidationResult {
  periodLabel: string;
  reportingCurrency: string;
  consolidatedLines: ConsolidatedLine[];
  eliminationsApplied: { ruleId: string; amount: number }[];
  eliminationJournalEntries: { debitAccount: string; creditAccount: string; amount: number; ruleId: string }[];
  nciShareOfEquity?: number;
  nciShareOfNetIncome?: number;
  balances: boolean;
  roundingGapExceedsMateriality?: boolean;
  roundingGap?: number;
  aggregateRoundingExceedsMateriality?: boolean;
}
