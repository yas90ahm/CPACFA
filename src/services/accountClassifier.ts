/**
 * Account classifier — maps Trial Balance accounts to Asset/Liability/Equity/Revenue/Expense
 * Used for Balance Sheet and P&L split. Codification: ASC 210, IAS 1.
 */

import type { AccountType, CodificationRef, TrialBalanceEntry } from '../types/financial.js';
// QUARANTINED — Agentic account classifier not in MVP architecture
// import { classifyAccountsAgentic } from './agentic_account_classifier.js';
import {
  ASSET_REF,
  LIABILITY_REF,
  EQUITY_REF,
  REVENUE_REF,
  EXPENSE_REF,
} from '../constants/codification.js';

/**
 * Compound overrides: multi-word phrases with domain-specific meanings.
 * Checked first, longest match wins. These override both suffix and keyword rules.
 */
const COMPOUND_OVERRIDES: [string, AccountType][] = [
  // Contra-asset accounts — still on BS as asset
  ['accumulated depreciation', 'ASSET'],
  ['accumulated amortization', 'ASSET'],
  ['allowance for doubtful', 'ASSET'],
  ['allowance for', 'ASSET'],
  // Deferred/unearned items — liability despite containing "revenue"/"income"
  ['deferred tax asset', 'ASSET'],
  ['deferred tax', 'LIABILITY'],
  ['deferred revenue', 'LIABILITY'],
  ['unearned revenue', 'LIABILITY'],
  ['deferred income', 'LIABILITY'],
  ['unearned income', 'LIABILITY'],
  ['deferred rent', 'LIABILITY'],
  // Accrued liabilities
  ['accrued expenses', 'LIABILITY'],
  ['accrued liabilities', 'LIABILITY'],
  ['accrued payroll', 'LIABILITY'],
  // Expense phrases that contain "income" or "tax"
  ['income tax expense', 'EXPENSE'],
  ['income tax', 'EXPENSE'],
  ['tax expense', 'EXPENSE'],
  ['interest expense', 'EXPENSE'],
  // Revenue phrases that contain "income"
  ['fee income', 'REVENUE'],
  ['interest income', 'REVENUE'],
  ['other income', 'REVENUE'],
  // Equity
  ['retained earnings', 'EQUITY'],
  ['retained earning', 'EQUITY'],
  ['common stock', 'EQUITY'],
  ['preferred stock', 'EQUITY'],
  ['additional paid-in capital', 'EQUITY'],
  ['treasury stock', 'EQUITY'],
  ['net income', 'EQUITY'],
  // Specific asset / liability
  ['accounts receivable', 'ASSET'],
  ['account receivable', 'ASSET'],
  ['notes receivable', 'ASSET'],
  ['accounts payable', 'LIABILITY'],
  ['account payable', 'LIABILITY'],
  ['notes payable', 'LIABILITY'],
  // Gains / losses
  ['gain on', 'REVENUE'],
  ['loss on', 'EXPENSE'],
  // COGS
  ['cost of goods sold', 'EXPENSE'],
  ['cost of goods', 'EXPENSE'],
  ['cost of good', 'EXPENSE'],
  ['cost of revenue', 'EXPENSE'],
  ['cost of sales', 'EXPENSE'],
];

// Sort by length descending so longest match wins
const SORTED_COMPOUND_OVERRIDES = [...COMPOUND_OVERRIDES].sort((a, b) => b[0].length - a[0].length);

/**
 * Suffix overrides: when the last word of an account name is one of these,
 * it overrides the first-match keyword scan. This fixes misclassifications like
 * "Professional Liability Expense" → EXPENSE (not LIABILITY).
 */
const SUFFIX_OVERRIDES: Record<string, AccountType> = {
  // Expense
  'expense': 'EXPENSE',
  'expenses': 'EXPENSE',
  'cost': 'EXPENSE',
  'costs': 'EXPENSE',
  // Revenue
  'revenue': 'REVENUE',
  'revenues': 'REVENUE',
  'income': 'REVENUE',
  'sales': 'REVENUE',
  // Asset
  'receivable': 'ASSET',
  'receivables': 'ASSET',
  // Liability
  'payable': 'LIABILITY',
  'payables': 'LIABILITY',
};

/**
 * Fallback keyword rules: first match wins.
 * Only used when neither compound nor suffix rules match.
 */
const DEFAULT_KEYWORDS: [RegExp | string, AccountType][] = [
  ['cash', 'ASSET'],
  ['receivable', 'ASSET'],
  ['inventory', 'ASSET'],
  ['prepaid', 'ASSET'],
  ['property', 'ASSET'],
  ['equipment', 'ASSET'],
  ['goodwill', 'ASSET'],
  ['intangible', 'ASSET'],
  ['asset', 'ASSET'],
  ['payable', 'LIABILITY'],
  ['accrued', 'LIABILITY'],
  ['debt', 'LIABILITY'],
  ['loan', 'LIABILITY'],
  ['liability', 'LIABILITY'],
  ['equity', 'EQUITY'],
  ['capital', 'EQUITY'],
  ['revenue', 'REVENUE'],
  ['sales', 'REVENUE'],
  ['income', 'REVENUE'],
  ['expense', 'EXPENSE'],
  ['cogs', 'EXPENSE'],
  ['salary', 'EXPENSE'],
  ['salaries', 'EXPENSE'],
  ['wage', 'EXPENSE'],
  ['wages', 'EXPENSE'],
  ['rent', 'EXPENSE'],
  ['depreciation', 'EXPENSE'],
  ['amortization', 'EXPENSE'],
  ['insurance', 'EXPENSE'],
  ['marketing', 'EXPENSE'],
  ['advertising', 'EXPENSE'],
  ['utilities', 'EXPENSE'],
  ['travel', 'EXPENSE'],
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

/**
 * Returns accountType and the matched keyword (or 'default') for rationale.
 *
 * Classification order (first match wins within each tier):
 *   1. Compound overrides — domain-specific multi-word phrases (longest match first)
 *   2. Suffix override — last word of the account name
 *   3. Fallback keyword scan — first-match keyword scan
 */
function classifyAccountNameWithKeyword(name: string): { accountType: AccountType; matchedKeyword: string } {
  const lower = name.toLowerCase().trim();

  // 1. Compound overrides (longest match wins)
  for (const [phrase, type] of SORTED_COMPOUND_OVERRIDES) {
    if (lower.includes(phrase)) {
      return { accountType: type, matchedKeyword: phrase };
    }
  }

  // 2. Suffix override — check last word(s)
  const words = lower.split(/[\s&,/\-]+/).filter(Boolean);
  if (words.length > 0) {
    const lastWord = words[words.length - 1];
    if (SUFFIX_OVERRIDES[lastWord]) {
      return { accountType: SUFFIX_OVERRIDES[lastWord], matchedKeyword: `suffix:${lastWord}` };
    }
    // Also check second-to-last for patterns like "Operating Expenses - Other"
    if (words.length >= 2) {
      const secondLast = words[words.length - 2];
      if (SUFFIX_OVERRIDES[secondLast]) {
        return { accountType: SUFFIX_OVERRIDES[secondLast], matchedKeyword: `suffix:${secondLast}` };
      }
    }
  }

  // 3. Fallback keyword scan (first match)
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
    if (entry.accountType) {
      return {
        ...entry,
        codificationRef: getCodificationRef(entry.accountType),
        classificationSource: 'deterministic' as const,
        classificationRationale: 'CoA template or prior classification applied.',
      };
    }
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
  // QUARANTINED — Agentic account classifier not in MVP architecture
  // const names = entries.map((e) => e.accountName);
  // const agentic = await classifyAccountsAgentic(names);
  const suggestedOverrides: { index: number; accountType: AccountType }[] = [];
  // if (agentic) {
  //   for (let idx = 0; idx < deterministic.length; idx++) {
  //     const det = deterministic[idx];
  //     const ag = agentic[idx];
  //     if (ag && det && ag !== det.accountType) {
  //       suggestedOverrides.push({ index: idx, accountType: ag });
  //     }
  //   }
  // }
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
  if (entries.every((e) => e.accountType)) return entries.map((e) => ({ ...e, codificationRef: e.codificationRef ?? getCodificationRef(e.accountType!) }));
  // QUARANTINED — Agentic account classifier not in MVP architecture
  // const names = entries.map((e) => e.accountName);
  // const agentic = await classifyAccountsAgentic(names);
  return entries.map((entry, idx) => {
    const accountType = entry.accountType ?? /* agentic?.[idx] ?? */ classifyAccountName(entry.accountName);
    const codificationRef = getCodificationRef(accountType);
    return {
      ...entry,
      accountType,
      codificationRef,
    };
  });
}
