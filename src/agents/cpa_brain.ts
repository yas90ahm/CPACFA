/**
 * CPA Agent — Gap Analysis rule engine.
 * After parsing bank/ledger data, checks for Missing Liabilities, Missing Assets, Missing Identity.
 * Used by get_data_gaps() tool to return an "Urgent To-Do" list for the UI.
 *
 * CPA Bridge: When producing a recommendation for deterministic execution, use CPA_BRIDGE_INSTRUCTION.
 * Output must be a JSON object mapping to cpa_bridge_manifest (Lease, Revenue, FixedAsset, Tax).
 */

import { CPA_BRIDGE_MANIFEST, type BridgeStandardKey } from '../services/cpa_bridge_manifest.js';

/** Purely functional instruction for agents that produce recommendations for the CPA bridge. */
export const CPA_BRIDGE_INSTRUCTION =
  'You are a Senior CPA. Your ONLY output must be a JSON object mapping to the cpa_bridge_manifest. ' +
  'Use exactly one of these keys: Lease, Revenue, FixedAsset, Tax. ' +
  'Each key must have a "params" object with the required mathematical inputs for that standard. ' +
  'Do not provide narratives unless requested separately. ' +
  'Example: { "standard": "Lease", "params": { "term": 36, "rate": 0.05, "payment": 1000, "standard": "asc842" } }';

/** Valid standard keys for the bridge (for prompt injection). */
export const CPA_BRIDGE_STANDARDS: BridgeStandardKey[] = ['Lease', 'Revenue', 'FixedAsset', 'Tax'];

/** Required params per standard (for prompt injection). */
export function getCpaBridgeRequiredParams(standard: BridgeStandardKey): string[] {
  return CPA_BRIDGE_MANIFEST[standard].required;
}

export interface LedgerEntry {
  accountName: string;
  debit: number;
  credit: number;
  accountCode?: string;
  accountType?: string;
}

export interface BankOrLedgerMetadata {
  taxId?: string;
  businessNumber?: string;
  /** Optional: transaction-level data when available (payee, amount, date) */
  transactions?: Array<{ payee?: string; amount: number; date?: string; description?: string }>;
}

export type DataGapType =
  | 'missing_liability'
  | 'missing_asset'
  | 'missing_identity'
  | 'missing_transactions'
  | 'agentic_anomaly';

export interface DataGap {
  id: string;
  type: DataGapType;
  title: string;
  description: string;
  urgency: 'high' | 'medium';
  /** Optional: suggested action or account name */
  suggestion?: string;
}

// --- Rule 1: Missing Liabilities — recurring payments to lenders without a loan account ---

const LENDER_EXPENSE_PATTERNS = [
  /loan\s*(repayment|payment|interest)/i,
  /mortgage\s*(payment|interest|principal)/i,
  /interest\s*(expense|on\s*loan)/i,
  /debt\s*service/i,
  /bank\s*loan/i,
  /notes?\s*payable\s*interest/i,
];

const LIABILITY_ACCOUNT_PATTERNS = [
  /loan\s*payable/i,
  /mortgage\s*payable/i,
  /notes?\s*payable/i,
  /long[- ]?term\s*debt/i,
  /current\s*portion\s*of\s*(debt|loan)/i,
  /bank\s*overdraft/i,
];

function isLenderRelatedExpense(accountName: string): boolean {
  return LENDER_EXPENSE_PATTERNS.some((p) => p.test(accountName));
}

function hasMatchingLiabilityAccount(entries: LedgerEntry[]): boolean {
  return entries.some((e) =>
    LIABILITY_ACCOUNT_PATTERNS.some((p) => p.test(e.accountName))
  );
}

function checkMissingLiabilities(entries: LedgerEntry[]): DataGap | null {
  const lenderExpenses = entries.filter((e) => {
    const expenseAmount = e.debit > 0 ? e.debit : e.credit;
    return expenseAmount > 0 && isLenderRelatedExpense(e.accountName);
  });
  if (lenderExpenses.length === 0) return null;
  if (hasMatchingLiabilityAccount(entries)) return null;
  const total = lenderExpenses.reduce((s, e) => s + (e.debit > 0 ? e.debit : e.credit), 0);
  return {
    id: `gap-liability-${Date.now()}`,
    type: 'missing_liability',
    title: 'Missing Liabilities',
    description: `Recurring payments to lenders (${lenderExpenses.length} entries, total ${formatCurrency(total)}) without a corresponding loan or liability account. Consider adding a Loan Payable, Mortgage Payable, or Notes Payable account.`,
    urgency: 'high',
    suggestion: 'Add a liability account (e.g. Loan Payable, Mortgage Payable) and reclassify principal portions.',
  };
}

// --- Rule 2: Missing Assets — large one-time payments to vendors that should be capitalized ---

const FIXED_ASSET_VENDOR_PATTERNS = [
  /tesla|vehicle|auto|car\s*(purchase|lease)/i,
  /apple|computer|equipment|hardware/i,
  /machinery|furniture|fixtures/i,
  /leasehold\s*improvement|building/i,
  /software\s*(license|purchase)/i,
  /capital\s*expenditure|capex/i,
];

const FIXED_ASSET_ACCOUNT_PATTERNS = [
  /fixed\s*assets?|property\s*,\s*plant/i,
  /equipment|machinery|vehicles?/i,
  /accumulated\s*depreciation/i,
  /capital\s*assets?/i,
];

/** Threshold (e.g. $1,000) above which a single expense may warrant capitalization review */
const LARGE_ONE_TIME_THRESHOLD = 1000;

function isFixedAssetVendorExpense(accountName: string): boolean {
  return FIXED_ASSET_VENDOR_PATTERNS.some((p) => p.test(accountName));
}

function hasFixedAssetAccount(entries: LedgerEntry[]): boolean {
  return entries.some((e) =>
    FIXED_ASSET_ACCOUNT_PATTERNS.some((p) => p.test(e.accountName))
  );
}

function checkMissingAssets(entries: LedgerEntry[]): DataGap | null {
  const candidateExpenses = entries.filter((e) => {
    const amount = e.debit > 0 ? e.debit : e.credit;
    return amount >= LARGE_ONE_TIME_THRESHOLD && isFixedAssetVendorExpense(e.accountName);
  });
  if (candidateExpenses.length === 0) return null;
  if (hasFixedAssetAccount(entries)) return null;
  const total = candidateExpenses.reduce((s, e) => s + (e.debit > 0 ? e.debit : e.credit), 0);
  const examples = candidateExpenses.slice(0, 3).map((e) => e.accountName).join(', ');
  return {
    id: `gap-asset-${Date.now()}`,
    type: 'missing_asset',
    title: 'Missing Assets',
    description: `Large one-time payments (e.g. ${examples}) totaling ${formatCurrency(total)} that may need to be capitalized as Fixed Assets rather than expensed. Consider adding Property, Plant & Equipment and reviewing capitalization policy.`,
    urgency: 'high',
    suggestion: 'Add Fixed Assets / PP&E accounts and reclassify qualifying expenditures.',
  };
}

// --- Rule 3: Missing Identity — Tax ID or Business Number in metadata ---

function checkMissingIdentity(metadata: BankOrLedgerMetadata): DataGap | null {
  const hasTaxId = typeof metadata.taxId === 'string' && metadata.taxId.trim().length > 0;
  const hasBusinessNumber = typeof metadata.businessNumber === 'string' && metadata.businessNumber.trim().length > 0;
  if (hasTaxId || hasBusinessNumber) return null;
  return {
    id: `gap-identity-${Date.now()}`,
    type: 'missing_identity',
    title: 'Missing Identity',
    description: 'Tax ID or Business Number is not present in the metadata. Add for compliance and reporting.',
    urgency: 'medium',
    suggestion: 'Provide Tax ID (EIN/SIN) and/or Business Number in document or profile metadata.',
  };
}

function checkMissingTransactions(metadata: BankOrLedgerMetadata): DataGap | null {
  if (metadata.transactions && metadata.transactions.length > 0) return null;
  return {
    id: `gap-transactions-${Date.now()}`,
    type: 'missing_transactions',
    title: 'Missing Transaction Detail',
    description: 'Transaction-level detail is missing. Provide bank statement or transaction export to validate cash flow and reconciliation.',
    urgency: 'medium',
    suggestion: 'Upload bank statements or transaction exports (CSV/XLSX) for full cash flow verification.',
  };
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

/**
 * Run the CPA Gap Analysis rule engine on parsed bank/ledger data and metadata.
 * Returns a list of "Missing Information" gaps for the UI (Urgent To-Do list).
 */
export function runGapAnalysis(
  entries: LedgerEntry[],
  metadata: BankOrLedgerMetadata = {}
): DataGap[] {
  const gaps: DataGap[] = [];
  const liabilityGap = checkMissingLiabilities(entries);
  if (liabilityGap) gaps.push(liabilityGap);
  const assetGap = checkMissingAssets(entries);
  if (assetGap) gaps.push(assetGap);
  const identityGap = checkMissingIdentity(metadata);
  if (identityGap) gaps.push(identityGap);
  const txGap = checkMissingTransactions(metadata);
  if (txGap) gaps.push(txGap);
  return gaps;
}
