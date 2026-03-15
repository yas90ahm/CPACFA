/**
 * Account Intelligence Service — deterministic pre-classifier for ERP accounts.
 * Runs BEFORE the AI classifier to flag junk, test, suspense, contra, intercompany,
 * personal expense, balance-mismatch, zero-activity, duplicate, orphan, and
 * misclassified accounts. All detection is rule-based: no AI, no cost, instant results.
 *
 * Enhanced with full AccountFlag/AccountAnalysis interfaces for the GL Quality Gate.
 */

import type { Pool } from 'pg';
import { from, minus as decMinus, plus as decPlus } from '../utils/decimal.js';

/* ── Public interfaces ─────────────────────────────────────────── */

export interface AccountFlag {
  type: 'junk' | 'test' | 'inactive' | 'suspense' | 'duplicate' | 'misclassified' |
        'personal_expense' | 'contra_undetected' | 'intercompany' | 'orphan' | 'zero_balance';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  suggestedAction: 'exclude' | 'investigate' | 'merge' | 'reclassify' | 'flag_for_review';
  autoExcludable: boolean;
  source?: 'deterministic' | 'ai';
}

export interface AccountAnalysis {
  accountCode: string;
  accountName: string;
  balance: { debit: string; credit: string; net: string };
  flags: AccountFlag[];
  cleanName?: string;
  duplicateOf?: string;
  suggestedContraOf?: string;
}

/** Legacy interface kept for backward compatibility with existing callers. */
export interface AccountInput {
  code: string;
  name: string;
  type?: string; // asset, liability, equity, revenue, expense (from ERP)
  debitBalance: number;
  creditBalance: number;
}

/** Legacy flag type kept for backward compatibility. */
export type LegacyAccountFlag =
  | 'junk_account'
  | 'test_account'
  | 'inactive'
  | 'suspense_clearing'
  | 'duplicate_candidate'
  | 'misclassified_type'
  | 'contra_undetected'
  | 'balance_direction_mismatch'
  | 'industry_specific'
  | 'intercompany'
  | 'zero_balance_zero_activity';

/** Legacy intelligence result kept for backward compatibility. */
export interface AccountIntelligence {
  accountCode: string;
  accountName: string;
  flags: LegacyAccountFlag[];
  suggestedAction: 'map' | 'exclude' | 'investigate' | 'merge';
  suggestedMapping?: string; // fs_taxonomy_line id
  confidence: number;
  reasoning: string;
}

/* ── Pattern constants ─────────────────────────────────────────── */

const JUNK_PATTERNS: RegExp[] = [
  /\btest\s*account\b/i,
  /\bdo\s*not\s*use\b/i,
  /\bdon['']?t\s*use\b/i,
  /\bdelete\b/i,
  /\bobsolete\b/i,
  /\binactive\b/i,
  /\bdeprecated\b/i,
  /\bsample\b/i,
  /\bdummy\b/i,
  /\btemporary\b/i,
  /^zzz/i,
  /^xxx/i,
  /\bold[\s-]+do\s*not\s*use\b/i,
  /\bplaceholder\b/i,
  /\bnot\s*in\s*use\b/i,
];

const TEST_CODE_PATTERNS: RegExp[] = [
  /^0{4,}/,
  /^9{4,}/,
];

const SUSPENSE_PATTERNS: RegExp[] = [
  /\bsuspense\b/i,
  /\bclearing\b/i,
  /\bholding\b/i,
  /\bwash\b/i,
  /\bbridge\b/i,
  /\bplug\b/i,
  /\bcontrol\s*account\b/i,
  /\ballocation\s*pool\b/i,
];

const INTERCOMPANY_PATTERNS: RegExp[] = [
  /\bintercompany\b/i,
  /\binterco\b/i,
  /\bdue\s+to\s+(parent|sub|affiliate)\b/i,
  /\bdue\s+from\s+(parent|sub|affiliate)\b/i,
  /\bdue\s+to\b/i,
  /\bdue\s+from\b/i,
  /\belimination\b/i,
  /\bi\/c\b/i,
  /\baffiliate\b/i,
];

const PERSONAL_EXPENSE_PATTERNS: RegExp[] = [
  /\bowner['']?s?\s*(car|vehicle|home|mortgage)\b/i,
  /\bpersonal\s*(loan|credit\s*card)\b/i,
  /\b\w+['']s\s*expense\b/i,
];

interface ContraMapping {
  pattern: RegExp;
  contraOf: string;
}

const CONTRA_MAPPINGS: ContraMapping[] = [
  { pattern: /\baccum(?:ulated)?\s*dep/i, contraOf: 'Property, Plant & Equipment' },
  { pattern: /\baccum(?:ulated)?\s*amort/i, contraOf: 'Intangible Assets' },
  { pattern: /\ballowance\s*(?:for\s*)?(?:doubtful|bad\s*debt)/i, contraOf: 'Accounts Receivable' },
  { pattern: /\bsales\s*(?:returns|discounts)\b/i, contraOf: 'Revenue' },
  { pattern: /\btreasury\s*stock\b/i, contraOf: 'Stockholders Equity' },
  { pattern: /\bpurchase\s*returns\b/i, contraOf: 'Cost of Goods Sold' },
  { pattern: /\bvaluation\s*allowance\b/i, contraOf: 'Deferred Tax Assets' },
];

/** Abbreviation expansions for duplicate detection. */
const ABBREVIATION_MAP: Record<string, string> = {
  'ap': 'accounts payable',
  'ar': 'accounts receivable',
  'cogs': 'cost goods sold',
  'sga': 'selling general administrative',
  'ppe': 'property plant equipment',
  'd&a': 'depreciation amortization',
  'da': 'depreciation amortization',
  'wip': 'work in process',
  'acct': 'account',
  'exp': 'expense',
  'rev': 'revenue',
  'inv': 'inventory',
  'dep': 'depreciation',
  'amort': 'amortization',
  'accum': 'accumulated',
  'prepd': 'prepaid',
  'int': 'interest',
  'ins': 'insurance',
  'maint': 'maintenance',
};

/* ── Legacy pattern constants (for backward compat) ────────────── */

interface LegacyContraMapping {
  pattern: RegExp;
  fsLineId: string;
}

const LEGACY_CONTRA_MAPPINGS: LegacyContraMapping[] = [
  { pattern: /\baccum(?:ulated)?\s*dep/i, fsLineId: 'fs_asset_ppe_accum_dep' },
  { pattern: /\baccum(?:ulated)?\s*amort/i, fsLineId: 'fs_asset_intangible_amort' },
  { pattern: /\ballowance\s*(?:for\s*)?(?:doubtful|bad\s*debt)/i, fsLineId: 'fs_asset_ar_allowance' },
  { pattern: /\bsales\s*(?:returns|discounts)\b/i, fsLineId: 'fs_revenue_contra' },
  { pattern: /\btreasury\s*stock\b/i, fsLineId: 'fs_equity_treasury' },
];

interface IndustryMapping {
  pattern: RegExp;
  fsLineId: string;
  industry: string;
}

const INDUSTRY_MAPPINGS: IndustryMapping[] = [
  { pattern: /\bw\.?i\.?p\.?\b|\bwork\s*in\s*process\b/i, fsLineId: 'fs_asset_inventory', industry: 'manufacturing' },
  { pattern: /\braw\s*materials?\b/i, fsLineId: 'fs_asset_inventory', industry: 'manufacturing' },
  { pattern: /\bfinished\s*goods?\b/i, fsLineId: 'fs_asset_inventory', industry: 'manufacturing' },
  { pattern: /\bstd\s*cost\s*variance\b|\bstandard\s*cost\s*var/i, fsLineId: 'fs_cogs', industry: 'manufacturing' },
  { pattern: /\barr\b|\bannual\s*recurring\b/i, fsLineId: 'fs_revenue', industry: 'saas' },
  { pattern: /\bdeferred\s*commission\b/i, fsLineId: 'fs_asset_other_current', industry: 'saas' },
  { pattern: /\bdeferred\s*revenue\b/i, fsLineId: 'fs_liability_deferred_rev_current', industry: 'saas' },
  { pattern: /\bpatient\s*revenue\b/i, fsLineId: 'fs_revenue', industry: 'healthcare' },
];

/* ── Detection helpers (enhanced) ──────────────────────────────── */

function detectJunkFlags(name: string, code: string, net: number): AccountFlag[] {
  const flags: AccountFlag[] = [];

  for (const p of JUNK_PATTERNS) {
    if (p.test(name)) {
      const hasBalance = Math.abs(net) > 0.004;
      flags.push({
        type: 'junk',
        severity: hasBalance ? 'critical' : 'warning',
        message: `Account name "${name}" matches junk pattern: ${p.source}`,
        suggestedAction: hasBalance ? 'investigate' : 'exclude',
        autoExcludable: !hasBalance,
        source: 'deterministic',
      });
      break;
    }
  }

  for (const p of TEST_CODE_PATTERNS) {
    if (p.test(code)) {
      const hasBalance = Math.abs(net) > 0.004;
      flags.push({
        type: 'test',
        severity: hasBalance ? 'critical' : 'warning',
        message: `Account code "${code}" matches test pattern (leading zeros or nines)`,
        suggestedAction: hasBalance ? 'investigate' : 'exclude',
        autoExcludable: !hasBalance,
        source: 'deterministic',
      });
      break;
    }
  }

  return flags;
}

function detectSuspenseFlags(name: string, net: number): AccountFlag[] {
  for (const p of SUSPENSE_PATTERNS) {
    if (p.test(name)) {
      const hasBalance = Math.abs(net) > 0.004;
      return [{
        type: 'suspense',
        severity: hasBalance ? 'critical' : 'info',
        message: `Account "${name}" is a suspense/clearing account${hasBalance ? ' with open balance' : ''}`,
        suggestedAction: hasBalance ? 'investigate' : 'flag_for_review',
        autoExcludable: false,
        source: 'deterministic',
      }];
    }
  }
  return [];
}

function detectIntercompanyFlags(name: string): AccountFlag[] {
  for (const p of INTERCOMPANY_PATTERNS) {
    if (p.test(name)) {
      return [{
        type: 'intercompany',
        severity: 'warning',
        message: `Account "${name}" appears to be an intercompany account requiring elimination`,
        suggestedAction: 'investigate',
        autoExcludable: false,
        source: 'deterministic',
      }];
    }
  }
  return [];
}

function detectContraFlags(name: string): { flags: AccountFlag[]; contraOf?: string } {
  for (const m of CONTRA_MAPPINGS) {
    if (m.pattern.test(name)) {
      return {
        flags: [{
          type: 'contra_undetected',
          severity: 'info',
          message: `Account "${name}" appears to be a contra account for ${m.contraOf}`,
          suggestedAction: 'reclassify',
          autoExcludable: false,
          source: 'deterministic',
        }],
        contraOf: m.contraOf,
      };
    }
  }
  return { flags: [] };
}

function detectPersonalExpenseFlags(name: string): AccountFlag[] {
  for (const p of PERSONAL_EXPENSE_PATTERNS) {
    if (p.test(name)) {
      return [{
        type: 'personal_expense',
        severity: 'critical',
        message: `Account "${name}" appears to be a personal expense not belonging on corporate financials`,
        suggestedAction: 'investigate',
        autoExcludable: false,
        source: 'deterministic',
      }];
    }
  }
  return [];
}

function detectBalanceMismatchFlags(
  name: string,
  accountType: string | undefined,
  net: number,
  isContra: boolean,
): AccountFlag[] {
  if (!accountType || isContra) return [];
  if (Math.abs(net) <= 100) return []; // Threshold: net > 100

  const type = accountType.toLowerCase();

  // Asset with credit balance (not contra)
  if ((type === 'asset' || type === 'current_asset' || type === 'non_current_asset') && net < -100) {
    return [{
      type: 'misclassified',
      severity: 'warning',
      message: `Asset account "${name}" has a credit (negative) net balance of ${net.toFixed(2)}`,
      suggestedAction: 'investigate',
      autoExcludable: false,
      source: 'deterministic',
    }];
  }

  // Revenue with debit balance
  if (type === 'revenue' && net > 100) {
    return [{
      type: 'misclassified',
      severity: 'warning',
      message: `Revenue account "${name}" has a debit (positive) net balance of ${net.toFixed(2)}`,
      suggestedAction: 'investigate',
      autoExcludable: false,
      source: 'deterministic',
    }];
  }

  // Liability with debit balance
  if ((type === 'liability' || type === 'current_liability' || type === 'non_current_liability') && net > 100) {
    return [{
      type: 'misclassified',
      severity: 'warning',
      message: `Liability account "${name}" has a debit (positive) net balance of ${net.toFixed(2)}`,
      suggestedAction: 'investigate',
      autoExcludable: false,
      source: 'deterministic',
    }];
  }

  return [];
}

function detectZeroBalanceFlags(
  debit: number,
  credit: number,
  net: number,
): AccountFlag[] {
  const totalActivity = Math.abs(debit) + Math.abs(credit);
  if (totalActivity < 0.005 && Math.abs(net) < 0.005) {
    return [{
      type: 'zero_balance',
      severity: 'info',
      message: 'Account has zero balance and zero activity',
      suggestedAction: 'exclude',
      autoExcludable: true,
      source: 'deterministic',
    }];
  }
  return [];
}

function detectInactiveFlags(
  debit: number,
  credit: number,
  net: number,
  priorDebit: number | undefined,
  priorCredit: number | undefined,
  priorNet: number | undefined,
): AccountFlag[] {
  const totalActivity = Math.abs(debit) + Math.abs(credit);
  if (totalActivity > 0.004 || Math.abs(net) > 0.004) return [];

  // Current period is zero; check prior period
  if (priorDebit !== undefined && priorCredit !== undefined && priorNet !== undefined) {
    const priorActivity = Math.abs(priorDebit) + Math.abs(priorCredit);
    if (priorActivity < 0.005 && Math.abs(priorNet) < 0.005) {
      return [{
        type: 'inactive',
        severity: 'info',
        message: 'Account has zero balance and zero activity in both current and prior period',
        suggestedAction: 'exclude',
        autoExcludable: true,
        source: 'deterministic',
      }];
    }
  }

  return [];
}

/* ── Name normalization and duplicate detection ────────────────── */

/**
 * Normalize a name for duplicate comparison.
 * Strips punctuation, articles, common noise words, expands abbreviations.
 */
function normalizeName(name: string): string {
  let normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, '')
    .trim();

  // Expand abbreviations
  const words = normalized.split(/\s+/);
  const expanded = words.map((w) => ABBREVIATION_MAP[w] ?? w);
  normalized = expanded.join(' ');

  // Remove common noise words
  normalized = normalized
    .replace(/\b(account|acct|expense|exp|payable|receivable|the|and|of|in|for|a|an)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Simple similarity ratio: proportion of shared character bigrams.
 */
function bigramSimilarity(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.substring(i, i + 2));
  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.substring(i, i + 2));

  let shared = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) shared++;
  }
  const total = bigramsA.size + bigramsB.size;
  return total > 0 ? (2 * shared) / total : 0;
}

interface DuplicateEntry {
  code: string;
  normalizedName: string;
}

function detectDuplicatesEnhanced(
  accounts: Array<{ code: string; name: string }>,
): Map<string, string[]> {
  const entries: DuplicateEntry[] = accounts.map((a) => ({
    code: a.code,
    normalizedName: normalizeName(a.name),
  }));

  const normalizedMap = new Map<string, string[]>();
  for (const e of entries) {
    if (!e.normalizedName || e.normalizedName.length <= 3) continue;
    const group = normalizedMap.get(e.normalizedName) ?? [];
    group.push(e.code);
    normalizedMap.set(e.normalizedName, group);
  }

  const duplicates = new Map<string, string[]>();

  // Exact normalized name match
  for (const [, codes] of normalizedMap) {
    if (codes.length > 1) {
      for (const code of codes) {
        duplicates.set(code, codes.filter((c) => c !== code));
      }
    }
  }

  // Bigram similarity for near-matches
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]!;
      const b = entries[j]!;
      if (!a.normalizedName || !b.normalizedName) continue;
      if (a.normalizedName.length <= 3 || b.normalizedName.length <= 3) continue;
      if (a.normalizedName === b.normalizedName) continue; // already caught
      if (bigramSimilarity(a.normalizedName, b.normalizedName) > 0.85) {
        if (!duplicates.has(a.code)) duplicates.set(a.code, []);
        if (!duplicates.has(b.code)) duplicates.set(b.code, []);
        duplicates.get(a.code)!.push(b.code);
        duplicates.get(b.code)!.push(a.code);
      }
    }
  }

  return duplicates;
}

/* ── Orphan detection ──────────────────────────────────────────── */

function detectOrphanFlags(
  code: string,
  name: string,
  coaCodes: Set<string> | undefined,
): AccountFlag[] {
  if (!coaCodes) return [];
  if (!coaCodes.has(code)) {
    return [{
      type: 'orphan',
      severity: 'warning',
      message: `Account "${name}" (${code}) is in GL but not in chart of accounts master`,
      suggestedAction: 'investigate',
      autoExcludable: false,
      source: 'deterministic',
    }];
  }
  return [];
}

/* ── Main analysis function (new enhanced interface) ───────────── */

/**
 * Analyze accounts for quality issues deterministically.
 * Returns analysis results for ALL accounts (including clean ones).
 */
export async function analyzeAccounts(
  _pool: Pool,
  _tenantId: string,
  accounts: Array<{ code: string; name: string; type?: string; debit: string; credit: string }>,
  priorPeriodAccounts?: Array<{ code: string; name: string; debit: string; credit: string }>,
  chartOfAccounts?: Array<{ code: string }>,
): Promise<AccountAnalysis[]> {
  const results: AccountAnalysis[] = [];

  // Build prior period lookup
  const priorMap = new Map<string, { debit: number; credit: number; net: number }>();
  if (priorPeriodAccounts) {
    for (const a of priorPeriodAccounts) {
      const d = from(a.debit || '0').toNumber();
      const c = from(a.credit || '0').toNumber();
      priorMap.set(a.code, { debit: d, credit: c, net: decMinus(d, c) });
    }
  }

  // Build COA code set
  const coaCodes = chartOfAccounts ? new Set(chartOfAccounts.map((a) => a.code)) : undefined;

  // Pre-compute duplicates
  const duplicateMap = detectDuplicatesEnhanced(accounts);

  for (const account of accounts) {
    const debit = from(account.debit || '0').toNumber();
    const credit = from(account.credit || '0').toNumber();
    const net = decMinus(debit, credit);
    const name = account.name;
    const code = account.code;
    const flags: AccountFlag[] = [];
    let suggestedContraOf: string | undefined;
    let duplicateOf: string | undefined;

    // 1. Junk/Test accounts
    flags.push(...detectJunkFlags(name, code, net));

    // 2. Suspense/Clearing
    flags.push(...detectSuspenseFlags(name, net));

    // 3. Contra detection
    const contraResult = detectContraFlags(name);
    flags.push(...contraResult.flags);
    if (contraResult.contraOf) suggestedContraOf = contraResult.contraOf;

    // 4. Personal expenses
    flags.push(...detectPersonalExpenseFlags(name));

    // 5. Intercompany
    flags.push(...detectIntercompanyFlags(name));

    // 6. Balance direction mismatch
    const isContra = contraResult.flags.length > 0;
    flags.push(...detectBalanceMismatchFlags(name, account.type, net, isContra));

    // 7. Zero balance + zero activity
    flags.push(...detectZeroBalanceFlags(debit, credit, net));

    // 8. Inactive (zero in both current and prior)
    const prior = priorMap.get(code);
    flags.push(...detectInactiveFlags(
      debit, credit, net,
      prior?.debit, prior?.credit, prior?.net,
    ));

    // 9. Duplicate detection
    if (duplicateMap.has(code)) {
      const dupes = duplicateMap.get(code)!;
      duplicateOf = dupes[0];
      flags.push({
        type: 'duplicate',
        severity: 'warning',
        message: `Account name is very similar to account(s): ${dupes.join(', ')}`,
        suggestedAction: 'merge',
        autoExcludable: false,
        source: 'deterministic',
      });
    }

    // 10. Orphan accounts
    flags.push(...detectOrphanFlags(code, name, coaCodes));

    const cleanName = normalizeName(name) || undefined;

    results.push({
      accountCode: code,
      accountName: name,
      balance: {
        debit: from(debit).toFixed(2),
        credit: from(credit).toFixed(2),
        net: from(net).toFixed(2),
      },
      flags,
      cleanName,
      duplicateOf,
      suggestedContraOf,
    });
  }

  return results;
}

/* ── Quality Grade ─────────────────────────────────────────────── */

export function computeQualityGrade(analyses: AccountAnalysis[]): {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  critical: number;
  warning: number;
  info: number;
  autoExcludable: number;
  requiresInvestigation: number;
} {
  let critical = 0;
  let warning = 0;
  let info = 0;
  let autoExcludable = 0;
  let requiresInvestigation = 0;

  for (const analysis of analyses) {
    for (const flag of analysis.flags) {
      if (flag.severity === 'critical') critical++;
      else if (flag.severity === 'warning') warning++;
      else info++;

      if (flag.autoExcludable) autoExcludable++;
      if (flag.suggestedAction === 'investigate') requiresInvestigation++;
    }
  }

  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (critical === 0 && warning <= 2) {
    grade = 'A';
  } else if (critical === 0 && warning <= 5) {
    grade = 'B';
  } else if (critical <= 2 || warning <= 10) {
    grade = 'C';
  } else if (critical <= 5) {
    grade = 'D';
  } else {
    grade = 'F';
  }

  return { grade, critical, warning, info, autoExcludable, requiresInvestigation };
}

/* ── Identify accounts needing AI analysis ─────────────────────── */

export function needsAIAnalysis(account: AccountAnalysis): boolean {
  const name = account.accountName.toLowerCase();
  return (
    /^(misc|other|general|sundry)/i.test(name) ||
    name.length < 4 ||
    account.flags.some((f) => f.suggestedAction === 'investigate') ||
    (account.flags.length === 0 && from(account.balance.net).abs().greaterThan(50000))
  );
}

/* ── Legacy analysis function (backward compatibility) ─────────── */

/**
 * Legacy overload: accepts AccountInput[], returns AccountIntelligence[].
 * Called by existing code paths.
 */
export async function analyzeAccountsLegacy(
  _pool: Pool,
  _tenantId: string,
  accounts: AccountInput[],
  priorPeriodAccounts?: AccountInput[],
): Promise<AccountIntelligence[]> {
  const results: AccountIntelligence[] = [];
  const priorMap = new Map<string, AccountInput>();
  if (priorPeriodAccounts) {
    for (const a of priorPeriodAccounts) {
      priorMap.set(a.code, a);
    }
  }

  // Pre-compute duplicates across entire account set
  const duplicateMap = detectDuplicatesEnhanced(accounts.map((a) => ({ code: a.code, name: a.name })));

  for (const account of accounts) {
    const flags: LegacyAccountFlag[] = [];
    let suggestedMapping: string | undefined;
    let confidence = 0;

    // 1. Junk/Test detection
    for (const p of JUNK_PATTERNS) {
      if (p.test(account.name)) {
        flags.push('junk_account');
        confidence = 0.95;
        break;
      }
    }
    for (const p of TEST_CODE_PATTERNS) {
      if (p.test(account.code)) {
        flags.push('test_account');
        confidence = Math.max(confidence, 0.85);
        break;
      }
    }
    if (!flags.includes('junk_account') && /\b(inactive|obsolete|deprecated)\b/i.test(account.name)) {
      flags.push('inactive');
      confidence = Math.max(confidence, 0.80);
    }

    // 2. Suspense/Clearing
    for (const p of SUSPENSE_PATTERNS) {
      if (p.test(account.name)) {
        flags.push('suspense_clearing');
        confidence = Math.max(confidence, 0.90);
        break;
      }
    }

    // 3. Intercompany
    for (const p of INTERCOMPANY_PATTERNS) {
      if (p.test(account.name)) {
        flags.push('intercompany');
        confidence = Math.max(confidence, 0.85);
        break;
      }
    }

    // 4. Contra detection
    for (const m of LEGACY_CONTRA_MAPPINGS) {
      if (m.pattern.test(account.name)) {
        flags.push('contra_undetected');
        suggestedMapping = m.fsLineId;
        confidence = Math.max(confidence, 0.90);
        break;
      }
    }

    // 5. Industry-specific
    for (const m of INDUSTRY_MAPPINGS) {
      if (m.pattern.test(account.name)) {
        flags.push('industry_specific');
        if (!suggestedMapping) suggestedMapping = m.fsLineId;
        confidence = Math.max(confidence, 0.80);
        break;
      }
    }

    // 6. Balance direction mismatch (skip if contra was detected)
    if (!flags.includes('contra_undetected') && account.type) {
      const net = account.debitBalance - account.creditBalance;
      const type = account.type.toLowerCase();
      if (
        ((type === 'asset' || type === 'current_asset' || type === 'non_current_asset') && net < -0.004) ||
        (type === 'revenue' && net > 0.004) ||
        ((type === 'liability' || type === 'current_liability' || type === 'non_current_liability') && net > 0.004)
      ) {
        flags.push('balance_direction_mismatch');
        confidence = Math.max(confidence, 0.75);
      }
    }

    // 7. Zero balance + zero activity
    const priorAccount = priorMap.get(account.code);
    const netBalance = Math.abs(account.debitBalance - account.creditBalance);
    const isZero = netBalance < 0.005 && account.debitBalance < 0.005 && account.creditBalance < 0.005;
    if (isZero) {
      if (!priorAccount) {
        flags.push('zero_balance_zero_activity');
        confidence = Math.max(confidence, 0.70);
      } else {
        const priorNet = Math.abs(priorAccount.debitBalance - priorAccount.creditBalance);
        if (priorNet < 0.005) {
          flags.push('zero_balance_zero_activity');
          confidence = Math.max(confidence, 0.70);
        }
      }
    }

    // 8. Duplicate detection
    if (duplicateMap.has(account.code)) {
      flags.push('duplicate_candidate');
      confidence = Math.max(confidence, 0.70);
    }

    // Skip accounts with no flags
    if (flags.length === 0) continue;

    // Determine suggested action based on flag priority
    let suggestedAction: AccountIntelligence['suggestedAction'] = 'map';
    if (flags.includes('junk_account') || flags.includes('test_account') || flags.includes('inactive')) {
      suggestedAction = 'exclude';
    } else if (flags.includes('suspense_clearing') || flags.includes('balance_direction_mismatch')) {
      suggestedAction = 'investigate';
    } else if (flags.includes('duplicate_candidate')) {
      suggestedAction = 'merge';
    }

    const reasoning = generateReasoning(flags, account);

    results.push({
      accountCode: account.code,
      accountName: account.name,
      flags,
      suggestedAction,
      suggestedMapping,
      confidence,
      reasoning,
    });
  }

  return results;
}

/* ── Legacy reasoning generator ───────────────────────────────── */

function generateReasoning(flags: LegacyAccountFlag[], account: AccountInput): string {
  const parts: string[] = [];

  if (flags.includes('junk_account')) {
    parts.push(`Account name "${account.name}" matches junk/test patterns (do not use, delete me, etc.)`);
  }
  if (flags.includes('test_account')) {
    parts.push(`Account code "${account.code}" matches test account pattern (leading zeros or nines)`);
  }
  if (flags.includes('inactive')) {
    parts.push(`Account name contains inactive/obsolete/deprecated keywords`);
  }
  if (flags.includes('suspense_clearing')) {
    parts.push(`Account is a suspense or clearing account that should be zeroed at close`);
  }
  if (flags.includes('intercompany')) {
    parts.push(`Account appears to be an intercompany account requiring elimination`);
  }
  if (flags.includes('contra_undetected')) {
    parts.push(`Account appears to be a contra account based on name pattern`);
  }
  if (flags.includes('balance_direction_mismatch')) {
    const net = account.debitBalance - account.creditBalance;
    parts.push(`Balance direction (net ${net >= 0 ? 'debit' : 'credit'} $${Math.abs(net).toFixed(2)}) is opposite to expected for account type "${account.type}"`);
  }
  if (flags.includes('industry_specific')) {
    parts.push(`Account matches an industry-specific pattern and may need specialized mapping`);
  }
  if (flags.includes('zero_balance_zero_activity')) {
    parts.push(`Account has zero balance and zero activity; consider excluding from statements`);
  }
  if (flags.includes('duplicate_candidate')) {
    parts.push(`Account name is very similar to another account in the chart; potential duplicate`);
  }

  return parts.length > 0 ? parts.join('. ') + '.' : 'No flags detected.';
}
