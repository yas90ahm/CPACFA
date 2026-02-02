/**
 * Audit Binder and GAAP Consistency types.
 * Line-level deep links to source document and reasoning monologue.
 */

import type {
  BalanceSheet,
  ProfitAndLoss,
  FinancialStatementLine,
  CashFlowStatement,
  EquityChangesStatement,
} from './financial.js';
import type { StoredJustification } from './justification.js';

/** Deep link for a single P&L (or BS) line: source document + reasoning monologue */
export interface LineAuditLink {
  /** Label/account for this line */
  label: string;
  accountCode?: string;
  amount: number;
  /** URL or path to source document (PDF/CSV) */
  sourceDocumentUrl: string;
  /** Human-readable source document name */
  sourceDocumentName?: string;
  /** URL or id to the timestamped reasoning monologue */
  reasoningMonologueUrl: string;
  /** ISO timestamp of the reasoning monologue */
  reasoningMonologueTimestamp: string;
  /** Optional reasoning monologue id for deep link */
  reasoningMonologueId?: string;
}

/** One financial statement bundled with its justification chain and line-level links */
export interface StatementWithJustificationChain {
  statementType: 'balance_sheet' | 'profit_and_loss';
  reportDate?: string;
  statement: BalanceSheet | ProfitAndLoss;
  /** Justifications that support this statement (e.g. IRAC for classification) */
  justificationChain: StoredJustification[];
  /** For every number: deep link to source document and reasoning monologue */
  lineLinks: LineAuditLink[];
}

/** Cash flow or equity line with audit links (same evidence model as BS/P&L) */
export interface CashFlowOrEquityLineLink {
  label: string;
  amount: number;
  sourceDocumentUrl: string;
  sourceDocumentName?: string;
  reasoningMonologueUrl: string;
  reasoningMonologueTimestamp: string;
  reasoningMonologueId?: string;
}

/** Cash flow statement bundle with line-level evidence */
export interface CashFlowBundle {
  statementType: 'cash_flow';
  statement: CashFlowStatement;
  justificationChain: StoredJustification[];
  /** One link per operating/investing/financing line (same source doc + reasoning when no per-line provenance) */
  lineLinks: CashFlowOrEquityLineLink[];
}

/** Statement of changes in equity bundle with line-level evidence */
export interface EquityChangesBundle {
  statementType: 'equity_changes';
  statement: EquityChangesStatement;
  justificationChain: StoredJustification[];
  lineLinks: CashFlowOrEquityLineLink[];
}

/** Clean Ledger row for CSV export (CPA-verified trial balance) */
export interface CleanLedgerRow {
  account_code?: string;
  account_name: string;
  debit: number;
  credit: number;
  account_type?: string;
}

/** Full Audit Binder: all statements + justification chains + line links */
export interface AuditBinder {
  entityName: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  /** Balance Sheet with its chain and line links */
  balanceSheetBundle?: StatementWithJustificationChain;
  /** P&L with its chain and line links */
  profitAndLossBundle?: StatementWithJustificationChain;
  /** Cash flow with line-level evidence (Stage 3) */
  cashFlowBundle?: CashFlowBundle;
  /** Statement of changes in equity with line-level evidence (Stage 3) */
  equityChangesBundle?: EquityChangesBundle;
  /** Shared justification chain (e.g. from chat) */
  justifications: StoredJustification[];
  /** CPA-verified Clean Ledger (trial balance) for CSV export when available */
  cleanLedger?: CleanLedgerRow[];
}

/** Single accounting policy change during the fiscal year (GAAP consistency) */
export interface AccountingPolicyChange {
  id: string;
  /** ISO date when the change was recorded */
  effectiveDate: string;
  /** Description of the policy (e.g. "Revenue recognition - ASC 606") */
  policyArea: string;
  /** What changed (e.g. "Switched from point-in-time to over-time recognition") */
  changeDescription: string;
  /** Optional citation (e.g. ASC 250-10-45) */
  citation?: string;
  /** Event type from compliance audit (e.g. accounting_policy_change) */
  eventType?: string;
  /** Reasoning or memo */
  reasoning?: string;
}

/** GAAP Consistency Report: flags any accounting policy changes during the fiscal year */
export interface GAAPConsistencyReport {
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  /** Policy changes detected in the period */
  policyChanges: AccountingPolicyChange[];
  /** Whether any changes were flagged (for quick scan) */
  hasChanges: boolean;
  /** Optional summary text */
  summary?: string;
}
