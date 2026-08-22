/**
 * Types for accounting software integration (QuickBooks, Xero, NetSuite, Sage Intacct).
 * Sync TB, push JEs, pull transactions.
 */

import type { TrialBalanceEntry } from './financial.js';

export type AccountingProvider = 'quickbooks' | 'xero' | 'netsuite' | 'sage_intacct';

export interface AccountingConnection {
  id: string;
  tenantId: string;
  provider: AccountingProvider;
  /** Display name (e.g. "Acme Corp QB") */
  name: string;
  /** OAuth or API key reference — not raw secret */
  credentialRef: string;
  /** Sync status */
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'partial' | 'failed';
  lastSyncError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncTrialBalanceResult {
  success: boolean;
  entries: TrialBalanceEntry[];
  asOfDate: string;
  provider: AccountingProvider;
  connectionId: string;
  errors: string[];
}

export interface PushJournalEntryInput {
  connectionId: string;
  date: string;
  memo?: string;
  /** Stable caller-generated key used by ERP APIs that support duplicate prevention. */
  idempotencyKey?: string;
  lines: { accountCode: string; accountName: string; debit: number; credit: number; description?: string }[];
}

export interface PushJournalEntryResult {
  success: boolean;
  externalId?: string;
  externalRef?: string;
  errors: string[];
}

export interface PullTransactionsInput {
  connectionId: string;
  startDate: string;
  endDate: string;
  /** Optional: limit to account types or codes */
  accountCodes?: string[];
}

export interface PulledTransaction {
  externalId: string;
  date: string;
  description?: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  currency?: string;
  reference?: string;
}

export interface PullTransactionsResult {
  success: boolean;
  transactions: PulledTransaction[];
  errors: string[];
}
