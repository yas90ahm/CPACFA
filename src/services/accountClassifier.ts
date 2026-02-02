/**
 * Account classifier — maps Trial Balance accounts to Asset/Liability/Equity/Revenue/Expense
 * Used for Balance Sheet and P&L split. Codification: ASC 210, IAS 1.
 */

import type { AccountType, CodificationRef, TrialBalanceEntry } from '../types/financial.js';
import { classifyAccountsAgentic } from './agentic_account_classifier.js';
import {
  ASSET_REF,
  LIABILITY_REF,
  EQUITY_REF,
  REVENUE_REF,
  EXPENSE_REF,
} from '../constants/codification.js';

/**
 * Default rules: keyword → AccountType (can be overridden by config/CoA).
 * Order matters: more specific phrases (e.g. "interest expense", "tax expense", "fee income", "interest income")
 * must appear before broader ones ("expense", "income") so that "Interest expense" classifies as EXPENSE
 * and "Interest income" / "Fee income" as REVENUE.
 */
const DEFAULT_KEYWORDS: [RegExp | string, AccountType][] = [
  ['cash', 'ASSET'],
  ['account receivable', 'ASSET'],
  ['receivable', 'ASSET'],
  ['inventory', 'ASSET'],
  ['prepaid', 'ASSET'],
  ['property', 'ASSET'],
  ['equipment', 'ASSET'],
  ['asset', 'ASSET'],
  ['account payable', 'LIABILITY'],
  ['payable', 'LIABILITY'],
  ['accrued', 'LIABILITY'],
  ['debt', 'LIABILITY'],
  ['loan', 'LIABILITY'],
  ['liability', 'LIABILITY'],
  ['equity', 'EQUITY'],
  ['capital', 'EQUITY'],
  ['retained earning', 'EQUITY'],
  ['common stock', 'EQUITY'],
  ['revenue', 'REVENUE'],
  ['sales', 'REVENUE'],
  ['fee income', 'REVENUE'],
  ['interest income', 'REVENUE'],
  ['income', 'REVENUE'],
  ['expense', 'EXPENSE'],
  ['cost of good', 'EXPENSE'],
  ['cogs', 'EXPENSE'],
  ['salary', 'EXPENSE'],
  ['wage', 'EXPENSE'],
  ['rent', 'EXPENSE'],
  ['depreciation', 'EXPENSE'],
  ['interest expense', 'EXPENSE'],
  ['tax expense', 'EXPENSE'],
];

function getCodificationRef(type: AccountType) {
  switch (type) {
    case 'ASSET':
      return ASSET_REF;
    case 'LIABILITY':
      return LIABILITY_REF;
    case 'EQUITY':
      return EQUITY_REF;
    case 'REVENUE':
      return REVENUE_REF;
    case 'EXPENSE':
      return EXPENSE_REF;
    default:
      return ASSET_REF;
  }
}

export function codificationRefForType(type: AccountType): CodificationRef {
  return getCodificationRef(type);
}

function classifyAccountName(name: string): AccountType {
  return classifyAccountNameWithKeyword(name).accountType;
}

/** Returns accountType and the matched keyword (or 'default') for rationale. */
function classifyAccountNameWithKeyword(name: string): { accountType: AccountType; matchedKeyword: string } {
  const lower = name.toLowerCase();
  for (const [keyword, type] of DEFAULT_KEYWORDS) {
    if (typeof keyword === 'string' && lower.includes(keyword)) return { accountType: type, matchedKeyword: keyword };
    if (keyword instanceof RegExp && keyword.test(lower)) return { accountType: type, matchedKeyword: String(keyword) };
  }
  return { accountType: 'ASSET', matchedKeyword: 'default' };
}

/**
 * Classify a single account name into AccountType and codification ref (ASC 210, IAS 1).
 * Use when you need to map one GL account to Asset/Liability/Equity/Revenue/Expense.
 */
export function classifyAccount(accountName: string): {
  accountType: AccountType;
  codificationRef: CodificationRef;
} {
  const accountType = classifyAccountName(accountName);
  return {
    accountType,
    codificationRef: getCodificationRef(accountType),
  };
}

/**
 * Deterministic classification only (no LLM). Used for statement build so totals are never driven by agentic output.
 * Statement totals are always derived from deterministic rules and/or user-confirmed overrides.
 */
export function classifyTrialBalanceDeterministic(entries: TrialBalanceEntry[]): TrialBalanceEntry[] {
  return entries.map((entry) => {
    const { accountType, matchedKeyword } = classifyAccountNameWithKeyword(entry.accountName);
    const codificationRef = getCodificationRef(accountType);
    const citation = codificationRef.citation;
    const classificationRationale = `Keyword match: "${matchedKeyword}" in account name (${citation}).`;
    return {
      ...entry,
      accountType,
      codificationRef,
      classificationSource: 'deterministic' as const,
      classificationRationale,
    };
  });
}

/**
 * Agentic suggestion path: returns deterministic result plus suggested overrides where LLM differs.
 * Do not use for statement build; use classifyTrialBalanceDeterministic + user-confirmed overrides only.
 */
export async function getClassificationSuggestions(entries: TrialBalanceEntry[]): Promise<{
  deterministic: TrialBalanceEntry[];
  suggestedOverrides: { index: number; accountType: AccountType }[];
  diffCount: number;
}> {
  const deterministic = classifyTrialBalanceDeterministic(entries);
  const names = entries.map((e) => e.accountName);
  const agentic = await classifyAccountsAgentic(names);
  const suggestedOverrides: { index: number; accountType: AccountType }[] = [];
  if (agentic) {
    for (let idx = 0; idx < deterministic.length; idx++) {
      const det = deterministic[idx];
      const ag = agentic[idx];
      if (ag && det && ag !== det.accountType) {
        suggestedOverrides.push({ index: idx, accountType: ag });
      }
    }
  }
  return {
    deterministic,
    suggestedOverrides,
    diffCount: suggestedOverrides.length,
  };
}

/**
 * Apply user-confirmed classification overrides to deterministic base.
 * Use the returned entries for a subsequent statement build (deterministic + user overrides only).
 */
export function applyUserClassificationOverrides(
  entries: TrialBalanceEntry[],
  overrides: { index: number; accountType: AccountType; rationale?: string }[]
): TrialBalanceEntry[] {
  const base = classifyTrialBalanceDeterministic(entries);
  const overrideByIndex = new Map(overrides.map((o) => [o.index, o]));
  return base.map((entry, idx) => {
    const ov = overrideByIndex.get(idx);
    if (!ov) return entry;
    return {
      ...entry,
      accountType: ov.accountType,
      codificationRef: getCodificationRef(ov.accountType),
      classificationSource: 'user_confirmed' as const,
      classificationRationale: ov.rationale ?? 'User confirmed classification.',
    };
  });
}

/**
 * Classify each TB entry using agentic result when available (legacy/suggestion path).
 * For statement build, use classifyTrialBalanceDeterministic or applyUserClassificationOverrides instead.
 */
export async function classifyTrialBalance(entries: TrialBalanceEntry[]): Promise<TrialBalanceEntry[]> {
  const names = entries.map((e) => e.accountName);
  const agentic = await classifyAccountsAgentic(names);
  return entries.map((entry, idx) => {
    const accountType = agentic?.[idx] ?? classifyAccountName(entry.accountName);
    const codificationRef = getCodificationRef(accountType);
    return {
      ...entry,
      accountType,
      codificationRef,
    };
  });
}
