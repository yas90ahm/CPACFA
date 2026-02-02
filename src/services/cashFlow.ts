/**
 * Cash Flow Statement builder (indirect, minimal estimate).
 * Produces an estimated statement when only TB and P&L are available.
 */

import type { TrialBalanceResult, ProfitAndLoss, CashFlowStatement, TrialBalanceEntry } from '../types/financial.js';

export interface CashTransaction {
  date?: string;
  amount: number;
  description?: string;
  counterparty?: string;
  debit?: number;
  credit?: number;
  category?: CashFlowCategory;
}

export type CashFlowCategory = 'operating' | 'investing' | 'financing';

/**
 * Indirect method cash flow per ASC 230 (Statement of Cash Flows) / IAS 7.
 * Non-cash adjustments (D&A, DTA/DTL, unrealized FX, SBC) follow ASC 230-10-45-28.
 */
export function buildCashFlowStatement(
  trialBalance: TrialBalanceResult,
  profitAndLoss: ProfitAndLoss,
  priorTrialBalance?: TrialBalanceResult
): CashFlowStatement {
  const endingCash = getNetAmount(trialBalance.entries, /cash|bank/i);
  const beginningCash = priorTrialBalance ? getNetAmount(priorTrialBalance.entries, /cash|bank/i) : undefined;
  const netIncome = profitAndLoss.netIncome ?? 0;

  const depreciation = sumPLExpense(profitAndLoss, /depreciation|amort/i);
  // ASC 230-10-45-28: deferred tax (DTA/DTL) — change in balance; reversal sign for operating reconciliation
  const changeDeferredTax = priorTrialBalance
    ? deltaByRegex(priorTrialBalance, trialBalance, /deferred tax|DTA|DTL|tax asset|tax liability/i)
    : undefined;
  // ASC 230-10-45-28: unrealized FX — add back expense (reverse P&L effect)
  const unrealizedFX = sumPLExpense(
    profitAndLoss,
    /foreign exchange|fx|currency|translation|unrealized.*gain|unrealized.*loss/i
  );
  // ASC 230-10-45-28: stock-based compensation — non-cash add-back
  const sbc = sumPLExpense(profitAndLoss, /stock.comp|option|RSU|restricted stock|SBC|share.based/i);

  const changeAR = priorTrialBalance ? deltaByRegex(priorTrialBalance, trialBalance, /receivable/i) : undefined;
  const changeInv = priorTrialBalance ? deltaByRegex(priorTrialBalance, trialBalance, /inventory/i) : undefined;
  const changeAP = priorTrialBalance ? deltaByRegex(priorTrialBalance, trialBalance, /payable/i) : undefined;

  // Operating section: ASC 230 indirect method — Net income, then non-cash adjustments, then working capital
  const operating: CashFlowStatement['operating'] = [
    { label: 'Net income', amount: netIncome },
  ];
  if (depreciation !== 0) operating.push({ label: 'Depreciation & amortization', amount: depreciation });
  if (changeDeferredTax != null && changeDeferredTax !== 0) {
    operating.push({ label: 'Change in deferred tax (net)', amount: -changeDeferredTax });
  }
  if (unrealizedFX !== 0) operating.push({ label: 'Unrealized (gain)/loss on FX', amount: unrealizedFX });
  if (sbc !== 0) operating.push({ label: 'Stock-based compensation', amount: sbc });
  if (changeAR != null) operating.push({ label: 'Change in accounts receivable', amount: -changeAR });
  if (changeInv != null) operating.push({ label: 'Change in inventory', amount: -changeInv });
  if (changeAP != null) operating.push({ label: 'Change in accounts payable', amount: changeAP });

  const investing: CashFlowStatement['investing'] = [];
  const financing: CashFlowStatement['financing'] = [];
  if (priorTrialBalance) {
    const changePPE = deltaByRegex(priorTrialBalance, trialBalance, /property|plant|equipment|fixed asset|capital/i);
    if (changePPE !== 0) {
      investing.push({
        label: changePPE > 0 ? 'Capital expenditures' : 'Proceeds from asset sales',
        amount: -changePPE,
      });
    }
    const changeDebt = deltaByRegex(priorTrialBalance, trialBalance, /loan|note|debt|credit line|mortgage/i);
    if (changeDebt !== 0) {
      financing.push({
        label: changeDebt > 0 ? 'Borrowings' : 'Debt repayments',
        amount: changeDebt,
      });
    }
    const changeEquity = deltaByRegex(priorTrialBalance, trialBalance, /equity|capital|contribution|share/i);
    if (changeEquity !== 0) {
      financing.push({
        label: changeEquity > 0 ? 'Equity issued' : 'Distributions / buybacks',
        amount: changeEquity,
      });
    }
  }

  return {
    operating,
    investing,
    financing,
    netChangeInCash: beginningCash != null && endingCash != null ? endingCash - beginningCash : netIncome,
    beginningCash,
    endingCash,
    estimated: !priorTrialBalance,
    note: priorTrialBalance
      ? 'Indirect cash flow derived from trial balance changes; verify with detailed transaction data.'
      : 'Estimated from trial balance; provide beginning cash and detailed transactions for a full cash flow statement.',
  };
}

/**
 * Build cash flow statement directly from transaction-level data.
 * Uses light classification heuristics; override with explicit tags upstream when available.
 */
export function buildCashFlowFromTransactions(
  transactions: CashTransaction[]
): CashFlowStatement {
  const operating: CashFlowStatement['operating'] = [];
  const investing: CashFlowStatement['investing'] = [];
  const financing: CashFlowStatement['financing'] = [];
  let missingCategory = 0;

  for (const tx of transactions) {
    const category = tx.category ?? 'operating';
    if (!tx.category) missingCategory += 1;
    const line = { label: tx.description ?? 'Transaction', amount: tx.amount };
    if (category === 'investing') investing.push(line);
    else if (category === 'financing') financing.push(line);
    else operating.push(line);
  }

  const sum = (lines: Array<{ amount: number }>) => lines.reduce((s, l) => s + l.amount, 0);
  const netChangeInCash = sum(operating) + sum(investing) + sum(financing);

  return {
    operating,
    investing,
    financing,
    netChangeInCash,
    estimated: false,
    note:
      missingCategory > 0
        ? `Derived from transaction-level cash activity. ${missingCategory} transaction(s) were not classified and defaulted to Operating.`
        : 'Derived from transaction-level cash activity.',
  };
}

function sumPLExpense(pl: ProfitAndLoss, re: RegExp): number {
  return pl.expenses.reduce((s, e) => (re.test(e.label ?? '') ? s + e.amount : s), 0);
}

function getNetAmount(entries: TrialBalanceEntry[], re: RegExp): number | undefined {
  const match = entries.filter((e) => re.test(e.accountName ?? ''));
  if (!match.length) return undefined;
  return match.reduce((s, e) => s + normalizeNet(e), 0);
}

function deltaByRegex(
  prior: TrialBalanceResult,
  current: TrialBalanceResult,
  re: RegExp
): number {
  const priorAmt = getNetAmount(prior.entries, re) ?? 0;
  const currAmt = getNetAmount(current.entries, re) ?? 0;
  return currAmt - priorAmt;
}

function normalizeNet(e: TrialBalanceEntry): number {
  const net = e.debit - e.credit;
  if (e.accountType === 'LIABILITY' || e.accountType === 'EQUITY' || e.accountType === 'REVENUE') {
    return -net;
  }
  return net;
}


