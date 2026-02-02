/**
 * Multi-entity and consolidation: entity layer, eliminations, reporting currency.
 */

export interface Entity {
  id: string;
  name: string;
  /** Optional parent for consolidation */
  parentId?: string;
  /** Reporting currency (e.g. USD, CAD) */
  currency: string;
  /** Standard for this entity (ASPE, IFRS, etc.) */
  standard?: string;
}

export interface EntityTrialBalanceRow {
  entityId: string;
  accountCode?: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface EntityStatementInput {
  entityId: string;
  trialBalance: EntityTrialBalanceRow[];
  periodLabel: string;
}

export interface EliminationRule {
  id: string;
  name: string;
  /** Debit account (e.g. IC receivable elimination) */
  debitAccount: string;
  creditAccount: string;
  /** How to compute amount: "balance" (from TB), "fixed", "formula" */
  amountType: 'balance' | 'fixed' | 'formula';
  amount?: number;
  formula?: string; // e.g. "entity_A_IC_receivable"
}

export interface ConsolidationInput {
  entities: Entity[];
  /** Per-entity TB or statement outputs */
  entityBalances: { entityId: string; lines: { accountName: string; amount: number; side: 'debit' | 'credit' }[] }[];
  eliminationRules: EliminationRule[];
  reportingCurrency: string;
  /** FX rates: entity currency -> reporting (e.g. CAD -> 0.74 for USD) */
  fxRates?: Record<string, number>;
  periodLabel: string;
  /** NCI percentage per subsidiary entity (e.g. { sub_id: 0.2 } = 20% NCI) */
  nciPercentByEntity?: Record<string, number>;
  /** Materiality for rounding gap check; when |debit - credit| > this, roundingGapExceedsMateriality is set. */
  materiality?: number;
  /** When provided, entity balances are run through GAAP reconciliation (e.g. LIFO-to-FIFO for US_GAAP to IFRS); adjustments and lifoInventoryFlag are attached to the result. */
  gaapReconciliation?: { standardFrom: 'US_GAAP'; standardTo: 'IFRS' };
}

/** Elimination journal entry for disclosure */
export interface EliminationJournalEntry {
  debitAccount: string;
  creditAccount: string;
  amount: number;
  ruleId: string;
}

export interface ConsolidationResult {
  periodLabel: string;
  reportingCurrency: string;
  consolidatedLines: { accountName: string; amount: number; side: 'debit' | 'credit'; source: 'entity' | 'elimination' }[];
  eliminationsApplied: { ruleId: string; amount: number }[];
  /** Elimination journal entries (one per rule) for disclosure */
  eliminationJournalEntries: EliminationJournalEntry[];
  /** NCI share of subsidiary equity (when nciPercentByEntity provided) */
  nciShareOfEquity?: number;
  /** NCI share of subsidiary net income (when nciPercentByEntity provided) */
  nciShareOfNetIncome?: number;
  balances: boolean;
  /** True when |totalDebit - totalCredit| exceeds materiality (rounding gap). */
  roundingGapExceedsMateriality?: boolean;
  /** Debit minus credit when rounding gap exceeds materiality. */
  roundingGap?: number;
  /** True when sum of per-entity |debit - credit| gaps exceeds materiality (salami). */
  aggregateRoundingExceedsMateriality?: boolean;
  /** GAAP-to-IFRS adjustments (e.g. LIFO inventory) when gaapReconciliation requested on consolidation. */
  gaapAdjustments?: { reason: string; accountName: string; gaapAmount: number; ifrsAmount: number; citation?: string }[];
  /** True when US_GAAP→IFRS and inventory/LIFO line detected. */
  lifoInventoryFlag?: boolean;
}
