/**
 * Board-ready precheck: single source of truth for blocker/warning codes and messages.
 * Contract: code is stable; message is protective tone; remediation is short guidance.
 */

export const PRECHECK_CONTRACT_VERSION = 'v1';

/** Stable codes for board-ready blockers and warnings. */
export const PrecheckCode = {
  MISSING_TRIAL_BALANCE: 'MISSING_TRIAL_BALANCE',
  EMPTY_TRIAL_BALANCE: 'EMPTY_TRIAL_BALANCE',
  TRIAL_BALANCE_IMBALANCED: 'TRIAL_BALANCE_IMBALANCED',
  BALANCE_SHEET_EQUATION_FAILED: 'BALANCE_SHEET_EQUATION_FAILED',
  PLUG_ACCOUNTS_DETECTED: 'PLUG_ACCOUNTS_DETECTED',
} as const;

export type PrecheckCodeType = (typeof PrecheckCode)[keyof typeof PrecheckCode];

/** User-facing messages (protective tone; no blame). */
export const PrecheckMessage: Record<PrecheckCodeType, string> = {
  [PrecheckCode.MISSING_TRIAL_BALANCE]: 'Not ready: trial balance array is required and must be non-empty.',
  [PrecheckCode.EMPTY_TRIAL_BALANCE]: 'Not ready: at least one row with an account name is required.',
  [PrecheckCode.TRIAL_BALANCE_IMBALANCED]:
    'Blocked until resolved: debits and credits do not match within tolerance.',
  [PrecheckCode.BALANCE_SHEET_EQUATION_FAILED]:
    'Blocked until resolved: Assets do not equal Liabilities + Equity within tolerance.',
  [PrecheckCode.PLUG_ACCOUNTS_DETECTED]:
    'Blocked until resolved: reclassify or reduce Suspense/Miscellaneous/Other accounts (≥90% of activity).',
};

/** Short remediation guidance (optional but preferred). */
export const PrecheckRemediation: Partial<Record<PrecheckCodeType, string>> = {
  [PrecheckCode.MISSING_TRIAL_BALANCE]: 'Send trialBalance as a non-empty array.',
  [PrecheckCode.EMPTY_TRIAL_BALANCE]: 'Include at least one row with accountName.',
  [PrecheckCode.TRIAL_BALANCE_IMBALANCED]: 'Reconcile debits and credits or add adjusting entries.',
  [PrecheckCode.BALANCE_SHEET_EQUATION_FAILED]: 'Reclassify accounts so Assets = Liabilities + Equity.',
  [PrecheckCode.PLUG_ACCOUNTS_DETECTED]: 'Reclassify Suspense/Misc/Other to proper accounts.',
};
