/**
 * Cash Flow Statement builder (indirect, minimal estimate).
 * Produces an estimated statement when only TB and P&L are available.
 * When cfClassificationMap is provided, accounts with explicit cash_flow_class
 * on their mapping rule are placed into the designated section; others fall back
 * to the existing regex-based inference logic.
 */

import type { TrialBalanceResult, ProfitAndLoss, CashFlowStatement, TrialBalanceEntry } from '../types/financial.js';
import type { CashFlowClass } from '../types/coa_mapping.js';
import { from, minus, plus, round2, sumRound2 } from '../utils/decimal.js';

export interface CashTransaction {
  date?: string;
  amount: number;
  description?: string;
  counterparty?: string;
  debit?: number;
  credit?: number;
  category?: CashFlowCategory;
}

export type CashFlowCategory = 'operating' | 'investing' | 'financing' | 'not_applicable';

/**
 * Map from account identifier (accountCode or accountName) to its explicit
 * cash_flow_class from coa_mapping_rules. Null/undefined means use inference.
 */
export type CfClassificationMap = Map<string, CashFlowClass>;

/**
 * Indirect method cash flow per ASC 230 (Statement of Cash Flows) / IAS 7.
 * Non-cash adjustments (D&A, DTA/DTL, unrealized FX, SBC) follow ASC 230-10-45-28.
 *
 * When cfClassificationMap is provided, entries with an explicit classification
 * are separated first and placed into the correct section. Remaining entries
 * fall through to the existing heuristic logic.
 */
export function buildCashFlowStatement(
  trialBalance: TrialBalanceResult,
  profitAndLoss: ProfitAndLoss,
  priorTrialBalance?: TrialBalanceResult,
  cfClassificationMap?: CfClassificationMap
): CashFlowStatement {
  const endingCash = getNetAmount(trialBalance.entries, /cash|bank/i);
  // First close: no prior period → beginning cash is $0 (GAAP: company starts with zero cash)
  const beginningCash = priorTrialBalance ? getNetAmount(priorTrialBalance.entries, /cash|bank/i) : 0;
  const netIncome = profitAndLoss.netIncome ?? 0;

  // --- Explicit cf_classification overrides ---
  // Collect balance-sheet-delta lines that have an explicit cash_flow_class.
  // These bypass the heuristic regex matching below.
  const explicitOperating: CashFlowStatement['operating'] = [];
  const explicitInvesting: CashFlowStatement['investing'] = [];
  const explicitFinancing: CashFlowStatement['financing'] = [];
  const explicitlyClassifiedKeys = new Set<string>();

  if (cfClassificationMap && cfClassificationMap.size > 0 && priorTrialBalance) {
    for (const entry of trialBalance.entries) {
      const key = entry.accountCode ?? entry.accountName;
      const cfClass = cfClassificationMap.get(key);
      if (!cfClass || cfClass === 'not_applicable') continue;

      // Compute delta for this specific account
      const priorEntry = priorTrialBalance.entries.find(
        (pe) => (pe.accountCode ?? pe.accountName) === key
      );
      const currentNet = normalizeNet(entry);
      const priorNet = priorEntry ? normalizeNet(priorEntry) : 0;
      const delta = minus(currentNet, priorNet);
      if (delta === 0) continue;

      const label = entry.accountName ?? key;
      const line = { label, amount: delta };
      if (cfClass === 'operating') explicitOperating.push(line);
      else if (cfClass === 'investing') explicitInvesting.push(line);
      else if (cfClass === 'financing') explicitFinancing.push(line);
      explicitlyClassifiedKeys.add(key);
    }
  }

  // --- Heuristic inference (existing logic) ---
  // Filter out explicitly-classified entries so they are not double-counted.
  const filterExplicit = (entries: TrialBalanceEntry[]): TrialBalanceEntry[] => {
    if (explicitlyClassifiedKeys.size === 0) return entries;
    return entries.filter((e) => !explicitlyClassifiedKeys.has(e.accountCode ?? e.accountName));
  };

  const filteredTB: TrialBalanceResult = {
    ...trialBalance,
    entries: filterExplicit(trialBalance.entries),
  };
  const filteredPriorTB: TrialBalanceResult | undefined = priorTrialBalance
    ? { ...priorTrialBalance, entries: filterExplicit(priorTrialBalance.entries) }
    : undefined;

  const depreciation = sumPLExpense(profitAndLoss, /depreciation|amort/i);
  // ASC 230-10-45-28: deferred tax (DTA/DTL) — change in balance; reversal sign for operating reconciliation
  const changeDeferredTax = filteredPriorTB
    ? deltaByRegex(filteredPriorTB, filteredTB, /deferred tax|DTA|DTL|tax asset|tax liability/i)
    : undefined;
  // ASC 230-10-45-28: unrealized FX — add back expense (reverse P&L effect)
  const unrealizedFX = sumPLExpense(
    profitAndLoss,
    /foreign exchange|fx|currency|translation|unrealized.*gain|unrealized.*loss/i
  );
  // ASC 230-10-45-28: stock-based compensation — non-cash add-back
  const sbc = sumPLExpense(profitAndLoss, /stock.comp|option|RSU|restricted stock|SBC|share.based/i);

  const changeAR = filteredPriorTB ? deltaByRegex(filteredPriorTB, filteredTB, /receivable/i) : undefined;
  const changeInv = filteredPriorTB ? deltaByRegex(filteredPriorTB, filteredTB, /inventory/i) : undefined;
  const changeAP = filteredPriorTB ? deltaByRegex(filteredPriorTB, filteredTB, /payable/i) : undefined;

  // Operating section: ASC 230 indirect method — Net income, then non-cash adjustments, then working capital
  const operating: CashFlowStatement['operating'] = [
    { label: 'Net income', amount: netIncome },
  ];
  if (depreciation !== 0) operating.push({ label: 'Depreciation & amortization', amount: depreciation });
  if (changeDeferredTax != null && changeDeferredTax !== 0) {
    operating.push({ label: 'Change in deferred tax (net)', amount: round2(-changeDeferredTax) });
  }
  if (unrealizedFX !== 0) operating.push({ label: 'Unrealized (gain)/loss on FX', amount: unrealizedFX });
  if (sbc !== 0) operating.push({ label: 'Stock-based compensation', amount: sbc });
  if (changeAR != null) operating.push({ label: 'Change in accounts receivable', amount: -changeAR });
  if (changeInv != null) operating.push({ label: 'Change in inventory', amount: -changeInv });
  if (changeAP != null) operating.push({ label: 'Change in accounts payable', amount: changeAP });
  // Append explicit operating overrides
  operating.push(...explicitOperating);

  const investing: CashFlowStatement['investing'] = [];
  const financing: CashFlowStatement['financing'] = [];
  if (filteredPriorTB) {
    const changePPE = deltaByRegex(filteredPriorTB, filteredTB, /property|plant|equipment|fixed asset|capital/i);
    if (changePPE !== 0) {
      investing.push({
        label: changePPE > 0 ? 'Capital expenditures' : 'Proceeds from asset sales',
        amount: -changePPE,
      });
    }
    const changeDebt = deltaByRegex(filteredPriorTB, filteredTB, /loan|note|debt|credit line|mortgage/i);
    if (changeDebt !== 0) {
      financing.push({
        label: changeDebt > 0 ? 'Borrowings' : 'Debt repayments',
        amount: changeDebt,
      });
    }
    const changeEquity = deltaByRegex(filteredPriorTB, filteredTB, /equity|capital|contribution|share/i);
    if (changeEquity !== 0) {
      financing.push({
        label: changeEquity > 0 ? 'Equity issued' : 'Distributions / buybacks',
        amount: changeEquity,
      });
    }
  }
  // Append explicit investing/financing overrides
  investing.push(...explicitInvesting);
  financing.push(...explicitFinancing);

  return {
    operating,
    investing,
    financing,
    netChangeInCash: beginningCash != null && endingCash != null ? minus(endingCash, beginningCash) : netIncome,
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

  let skippedNA = 0;
  for (const tx of transactions) {
    if (tx.category === 'not_applicable') { skippedNA += 1; continue; }
    const category = tx.category ?? 'operating';
    if (!tx.category) missingCategory += 1;
    const line = { label: tx.description ?? 'Transaction', amount: tx.amount };
    if (category === 'investing') investing.push(line);
    else if (category === 'financing') financing.push(line);
    else operating.push(line);
  }

  const sum = (lines: Array<{ amount: number }>) => sumRound2(lines.map((l) => l.amount));
  const netChangeInCash = plus(plus(sum(operating), sum(investing)), sum(financing));

  return {
    operating,
    investing,
    financing,
    netChangeInCash,
    estimated: false,
    note:
      (missingCategory > 0 || skippedNA > 0)
        ? `Derived from transaction-level cash activity.${missingCategory > 0 ? ` ${missingCategory} transaction(s) were not classified and defaulted to Operating.` : ''}${skippedNA > 0 ? ` ${skippedNA} transaction(s) classified as not_applicable were excluded.` : ''}`
        : 'Derived from transaction-level cash activity.',
  };
}

function sumPLExpense(pl: ProfitAndLoss, re: RegExp): number {
  return sumRound2(pl.expenses.filter((e) => re.test(e.label ?? '')).map((e) => e.amount));
}

function getNetAmount(entries: TrialBalanceEntry[], re: RegExp): number | undefined {
  const match = entries.filter((e) => re.test(e.accountName ?? ''));
  if (!match.length) return undefined;
  return sumRound2(match.map((e) => normalizeNet(e)));
}

function deltaByRegex(
  prior: TrialBalanceResult,
  current: TrialBalanceResult,
  re: RegExp
): number {
  const priorAmt = getNetAmount(prior.entries, re) ?? 0;
  const currAmt = getNetAmount(current.entries, re) ?? 0;
  return minus(currAmt, priorAmt);
}

function normalizeNet(e: TrialBalanceEntry): number {
  const net = minus(e.debit, e.credit);
  if (e.accountType === 'LIABILITY' || e.accountType === 'EQUITY' || e.accountType === 'REVENUE') {
    return round2(-net);
  }
  return net;
}


