/**
 * Accounting software integration: QuickBooks, Xero, NetSuite.
 * Adapter interface: sync TB, push JEs, pull transactions.
 * Uses tenant pool when DATABASE_URL is set and pool is provided; otherwise in-memory.
 */

import type { Pool } from 'pg';
import type { TrialBalanceEntry } from '../types/financial.js';
import type {
  AccountingConnection,
  AccountingProvider,
  SyncTrialBalanceResult,
  PushJournalEntryInput,
  PushJournalEntryResult,
  PullTransactionsInput,
  PullTransactionsResult,
  PulledTransaction,
} from '../types/accounting_integration.js';
import { createInMemoryStore } from '../lib/inMemoryStore.js';
import { isDbConfigured } from '../db/index.js';
import * as connectionRepo from '../db/repositories/accounting_connection_repository.js';

/** In-memory connections (tenant-scoped); used when DATABASE_URL not set or no pool */
const connectionStore = createInMemoryStore<AccountingConnection>({
  idPrefix: 'conn',
  timestamps: true,
});

async function getConnectionById(
  connectionId: string,
  pool?: Pool
): Promise<AccountingConnection | null> {
  if (isDbConfigured() && pool) {
    return connectionRepo.getConnection(pool, connectionId);
  }
  return connectionStore.get(connectionId) ?? null;
}

export interface IAccountingAdapter {
  syncTrialBalance(conn: AccountingConnection, connectionId: string, asOfDate?: string): Promise<SyncTrialBalanceResult>;
  pushJournalEntry(conn: AccountingConnection, input: PushJournalEntryInput): Promise<PushJournalEntryResult>;
  pullTransactions(conn: AccountingConnection, input: PullTransactionsInput): Promise<PullTransactionsResult>;
}

/** Mock TB entries for demo sync */
function mockTrialBalanceEntries(asOfDate: string, provider: AccountingProvider): TrialBalanceEntry[] {
  const prefix = provider === 'quickbooks' ? 'QB' : provider === 'xero' ? 'X' : 'NS';
  return [
    { accountCode: `${prefix}-1000`, accountName: 'Cash', debit: 50000, credit: 0 },
    { accountCode: `${prefix}-1200`, accountName: 'Accounts Receivable', debit: 25000, credit: 0 },
    { accountCode: `${prefix}-2000`, accountName: 'Accounts Payable', debit: 0, credit: 15000 },
    { accountCode: `${prefix}-3000`, accountName: 'Equity', debit: 0, credit: 60000 },
  ];
}

/** Mock adapter: simulates QB/Xero/NetSuite without real API */
class MockAccountingAdapter implements IAccountingAdapter {
  constructor(private provider: AccountingProvider) {}

  async syncTrialBalance(conn: AccountingConnection, connectionId: string, asOfDate?: string): Promise<SyncTrialBalanceResult> {
    const date = asOfDate ?? new Date().toISOString().slice(0, 10);
    const entries = mockTrialBalanceEntries(date, this.provider);
    return { success: true, entries, asOfDate: date, provider: this.provider, connectionId, errors: [] };
  }

  async pushJournalEntry(conn: AccountingConnection, input: PushJournalEntryInput): Promise<PushJournalEntryResult> {
    const sumDebit = input.lines.reduce((s, l) => s + l.debit, 0);
    const sumCredit = input.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(sumDebit - sumCredit) > 0.01) {
      return { success: false, errors: ['Journal entry must balance (debits = credits)'] };
    }
    const externalId = `${conn.provider}-je-${Date.now()}`;
    return { success: true, externalId, externalRef: externalId, errors: [] };
  }

  async pullTransactions(conn: AccountingConnection, input: PullTransactionsInput): Promise<PullTransactionsResult> {
    const transactions: PulledTransaction[] = [
      { externalId: 'tx-1', date: input.startDate, description: 'Sample deposit', accountCode: '1000', accountName: 'Cash', debit: 0, credit: 1000, reference: 'DEP-001' },
      { externalId: 'tx-2', date: input.endDate, description: 'Sample payment', accountCode: '2000', accountName: 'AP', debit: 500, credit: 0, reference: 'PMT-001' },
    ];
    return { success: true, transactions, errors: [] };
  }
}

const adapters: Record<AccountingProvider, IAccountingAdapter> = {
  quickbooks: new MockAccountingAdapter('quickbooks'),
  xero: new MockAccountingAdapter('xero'),
  netsuite: new MockAccountingAdapter('netsuite'),
};

function getAdapter(provider: AccountingProvider): IAccountingAdapter {
  return adapters[provider];
}

export async function createConnection(
  tenantId: string,
  provider: AccountingProvider,
  name: string,
  credentialRef: string,
  pool?: Pool
): Promise<AccountingConnection> {
  if (isDbConfigured() && pool) {
    return connectionRepo.createConnection(pool, { tenantId, provider, name, credentialRef });
  }
  return connectionStore.create({
    tenantId,
    provider,
    name,
    credentialRef,
  });
}

export async function getConnection(connectionId: string, pool?: Pool): Promise<AccountingConnection | undefined> {
  if (isDbConfigured() && pool) {
    const conn = await connectionRepo.getConnection(pool, connectionId);
    return conn ?? undefined;
  }
  return connectionStore.get(connectionId);
}

export async function listConnections(tenantId: string, pool?: Pool): Promise<AccountingConnection[]> {
  if (isDbConfigured() && pool) {
    return connectionRepo.listConnections(pool, tenantId);
  }
  return connectionStore.list().filter((c) => c.tenantId === tenantId);
}

export async function syncTrialBalance(
  connectionId: string,
  asOfDate?: string,
  pool?: Pool
): Promise<SyncTrialBalanceResult> {
  const conn = await getConnectionById(connectionId, pool);
  if (!conn) {
    const date = asOfDate ?? new Date().toISOString().slice(0, 10);
    return { success: false, entries: [], asOfDate: date, provider: 'quickbooks', connectionId, errors: ['Connection not found'] };
  }
  const result = await getAdapter(conn.provider).syncTrialBalance(conn, connectionId, asOfDate);
  if (isDbConfigured() && pool && result.success) {
    await connectionRepo.updateConnection(pool, connectionId, { lastSyncAt: new Date().toISOString(), lastSyncStatus: 'success' });
  } else if (!pool && result.success) {
    connectionStore.update(connectionId, { lastSyncAt: new Date().toISOString(), lastSyncStatus: 'success' });
  }
  return result;
}

export async function pushJournalEntry(input: PushJournalEntryInput, pool?: Pool): Promise<PushJournalEntryResult> {
  const conn = await getConnectionById(input.connectionId, pool);
  if (!conn) return { success: false, errors: ['Connection not found'] };
  return getAdapter(conn.provider).pushJournalEntry(conn, input);
}

export async function pullTransactions(input: PullTransactionsInput, pool?: Pool): Promise<PullTransactionsResult> {
  const conn = await getConnectionById(input.connectionId, pool);
  if (!conn) return { success: false, transactions: [], errors: ['Connection not found'] };
  return getAdapter(conn.provider).pullTransactions(conn, input);
}
