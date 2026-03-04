/**
 * Multi-entity consolidation: entity TBs, eliminations, reporting currency.
 */

import type {
  Entity,
  EliminationRule,
  ConsolidationInput,
  ConsolidationResult,
  EliminationJournalEntry,
} from '../types/multi_entity.js';
import { from, round2, sumRound2, minus, absGt } from '../utils/decimal.js';

/**
 * Safe formula DSL: min(a,b), max(a,b), sum(a,b,...), or single account key.
 * Account keys are resolved from balanceByAccount (net balance). No arbitrary code.
 */
function evalFormula(formula: string, balanceByAccount: Map<string, number>): number | undefined {
  const trimmed = formula.trim();

  const matchMin = /^min\s*\(\s*(.+)\s*,\s*(.+)\s*\)$/i.exec(trimmed);
  if (matchMin) {
    const a = resolveFormulaValue(matchMin[1]!.trim(), balanceByAccount);
    const b = resolveFormulaValue(matchMin[2]!.trim(), balanceByAccount);
    if (a != null && b != null) return Math.min(Math.abs(a), Math.abs(b));
  }

  const matchMax = /^max\s*\(\s*(.+)\s*,\s*(.+)\s*\)$/i.exec(trimmed);
  if (matchMax) {
    const a = resolveFormulaValue(matchMax[1]!.trim(), balanceByAccount);
    const b = resolveFormulaValue(matchMax[2]!.trim(), balanceByAccount);
    if (a != null && b != null) return Math.max(Math.abs(a), Math.abs(b));
  }

  const matchSum = /^sum\s*\(\s*(.+)\s*\)$/i.exec(trimmed);
  if (matchSum) {
    const parts = matchSum[1]!.split(',').map((p) => resolveFormulaValue(p.trim(), balanceByAccount));
    if (parts.every((p) => p != null)) return Math.abs((parts as number[]).reduce((s, p) => s + p, 0));
  }

  return resolveFormulaValue(trimmed, balanceByAccount) ?? undefined;
}

function resolveFormulaValue(part: string, balanceByAccount: Map<string, number>): number | undefined {
  const num = Number(part);
  if (!Number.isNaN(num)) return num;
  return balanceByAccount.get(part) ?? undefined;
}

function sumByAccount(entityLines: { accountName: string; amount: number; side: 'debit' | 'credit' }[]): Map<string, { debit: number; credit: number }> {
  const map = new Map<string, { debit: number; credit: number }>();
  for (const line of entityLines) {
    const key = line.accountName.trim();
    let entry = map.get(key);
    if (!entry) {
      entry = { debit: 0, credit: 0 };
      map.set(key, entry);
    }
    if (line.side === 'debit') {
      entry.debit = from(entry.debit).plus(line.amount).toDecimalPlaces(2).toNumber();
    } else {
      entry.credit = from(entry.credit).plus(line.amount).toDecimalPlaces(2).toNumber();
    }
  }
  return map;
}

const DEFAULT_MATERIALITY = 0.01;

export function buildConsolidation(input: ConsolidationInput): ConsolidationResult {
  const {
    entities,
    entityBalances,
    eliminationRules,
    reportingCurrency,
    fxRates,
    periodLabel,
    materiality: inputMateriality,
  } = input;

  const materiality = inputMateriality ?? DEFAULT_MATERIALITY;
  const consolidatedMap = new Map<string, { debit: number; credit: number; source: 'entity' | 'elimination' }>();
  let sumEntityGaps = 0;

  for (let i = 0; i < entityBalances.length; i++) {
    const bal = entityBalances[i]!;
    const entity = entities.find((e) => e.id === bal.entityId);
    const rate = entity && fxRates?.[entity.currency] != null ? fxRates[entity.currency]! : 1;

    const lines = bal.lines.map((l) => ({
      accountName: l.accountName,
      amount: from(l.amount).times(rate).toDecimalPlaces(2).toNumber(),
      side: l.side,
    }));

    const byAccount = sumByAccount(lines);
    let entityDebit = 0;
    let entityCredit = 0;
    for (const [, { debit, credit }] of byAccount) {
      entityDebit += debit;
      entityCredit += credit;
    }
    sumEntityGaps += from(entityDebit).minus(entityCredit).abs().toNumber();

    for (const [accountName, { debit, credit }] of byAccount) {
      let entry = consolidatedMap.get(accountName);
      if (!entry) {
        entry = { debit: 0, credit: 0, source: 'entity' };
        consolidatedMap.set(accountName, entry);
      }
      entry.debit = from(entry.debit).plus(debit).toDecimalPlaces(2).toNumber();
      entry.credit = from(entry.credit).plus(credit).toDecimalPlaces(2).toNumber();
    }
  }

  // Build balance-by-account for elimination "balance" / "formula"
  const balanceByAccount = new Map<string, number>();
  for (const [accountName, entry] of consolidatedMap) {
    balanceByAccount.set(accountName, entry.debit - entry.credit);
  }

  const eliminationsApplied: ConsolidationResult['eliminationsApplied'] = [];
  const eliminationJournalEntries: EliminationJournalEntry[] = [];

  for (const rule of eliminationRules) {
    let amt: number | undefined;
    if (rule.amountType === 'fixed' && rule.amount != null) {
      amt = rule.amount;
    } else if (rule.amountType === 'balance') {
      const balance = balanceByAccount.get(rule.debitAccount) ?? balanceByAccount.get(rule.creditAccount);
      if (balance != null && Math.abs(balance) > 1e-9) amt = Math.abs(balance);
    } else if (rule.amountType === 'formula' && rule.formula) {
      amt = evalFormula(rule.formula, balanceByAccount);
    }

    if (amt != null && amt > 0) {
      let dr = consolidatedMap.get(rule.debitAccount);
      if (!dr) {
        dr = { debit: 0, credit: 0, source: 'elimination' };
        consolidatedMap.set(rule.debitAccount, dr);
      }
      let cr = consolidatedMap.get(rule.creditAccount);
      if (!cr) {
        cr = { debit: 0, credit: 0, source: 'elimination' };
        consolidatedMap.set(rule.creditAccount, cr);
      }

      dr.debit = from(dr.debit).plus(amt).toDecimalPlaces(2).toNumber();
      cr.credit = from(cr.credit).plus(amt).toDecimalPlaces(2).toNumber();

      eliminationsApplied.push({ ruleId: rule.id, amount: amt });
      eliminationJournalEntries.push({
        debitAccount: rule.debitAccount,
        creditAccount: rule.creditAccount,
        amount: amt,
        ruleId: rule.id,
      });
    }
  }

  // NCI computation
  let nciShareOfEquity: number | undefined;
  let nciShareOfNetIncome: number | undefined;

  if (input.nciPercentByEntity && Object.keys(input.nciPercentByEntity).length > 0) {
    let nciEquity = 0;
    let nciIncome = 0;

    for (const [entityId, pct] of Object.entries(input.nciPercentByEntity)) {
      const bal = entityBalances.find((b) => b.entityId === entityId);
      if (bal) {
        const entity = entities.find((e) => e.id === entityId);
        const rate = entity && fxRates?.[entity.currency] != null ? fxRates[entity.currency]! : 1;
        const lines = bal.lines.map((l) => ({
          accountName: l.accountName,
          amount: from(l.amount).times(rate).toDecimalPlaces(2).toNumber(),
          side: l.side as 'debit' | 'credit',
        }));

        const byAcc = sumByAccount(lines);
        const eqDebit = byAcc.get('Equity')?.debit ?? 0;
        const eqCredit = byAcc.get('Equity')?.credit ?? 0;
        const eq = from(eqDebit).minus(eqCredit).toNumber();
        const niCredit = byAcc.get('Net Income')?.credit ?? 0;
        const niDebit = byAcc.get('Net Income')?.debit ?? 0;
        const ni = from(niCredit).minus(niDebit).toNumber();

        nciEquity = from(nciEquity).plus(from(eq).times(pct)).toDecimalPlaces(2).toNumber();
        nciIncome = from(nciIncome).plus(from(ni).times(pct)).toDecimalPlaces(2).toNumber();
      }
    }

    nciShareOfEquity = round2(nciEquity);
    nciShareOfNetIncome = round2(nciIncome);
  }

  // Build consolidated lines
  const consolidatedLines: ConsolidationResult['consolidatedLines'] = [];
  for (const [accountName, entry] of consolidatedMap) {
    if (entry.debit > 0) {
      consolidatedLines.push({ accountName, amount: entry.debit, side: 'debit', source: entry.source });
    }
    if (entry.credit > 0) {
      consolidatedLines.push({ accountName, amount: entry.credit, side: 'credit', source: entry.source });
    }
  }

  const debitValues = [...consolidatedMap.values()].map((e) => e.debit);
  const creditValues = [...consolidatedMap.values()].map((e) => e.credit);
  const totalDebit = sumRound2(debitValues);
  const totalCredit = sumRound2(creditValues);
  const roundingGap = minus(totalDebit, totalCredit);
  const roundingGapExceedsMateriality = absGt(totalDebit, totalCredit, materiality);
  const aggregateRoundingExceedsMateriality = sumEntityGaps > materiality;
  const balances = from(roundingGap).abs().lessThanOrEqualTo(materiality);

  return {
    periodLabel,
    reportingCurrency,
    consolidatedLines,
    eliminationsApplied,
    eliminationJournalEntries,
    nciShareOfEquity,
    nciShareOfNetIncome,
    balances,
    ...(roundingGapExceedsMateriality ? { roundingGapExceedsMateriality: true, roundingGap } : {}),
    ...(aggregateRoundingExceedsMateriality ? { aggregateRoundingExceedsMateriality: true } : {}),
  };
}
