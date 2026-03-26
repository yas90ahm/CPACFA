/**
 * Accounting software integration: QuickBooks, Xero, NetSuite.
 * Adapter interface: sync TB, push JEs, pull transactions.
 * Uses tenant pool when DATABASE_URL is set and pool is provided; in production no in-memory fallback.
 */

import type { Pool } from 'pg';
import type { TrialBalanceEntry } from '../types/financial.js';
import { from, sumRound2 } from '../utils/decimal.js';
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
import { disallowMemoryStoreInProduction } from '../lib/env.js';
import * as connectionRepo from '../db/repositories/accounting_connection_repository.js';

/** In-memory connections (tenant-scoped); used only when not production and no pool */
const connectionStore = createInMemoryStore<AccountingConnection>({
  idPrefix: 'conn',
  timestamps: true,
});

async function getConnectionById(
  connectionId: string,
  pool?: Pool,
  tenantId?: string
): Promise<AccountingConnection | null> {
  if (isDbConfigured() && pool && tenantId) {
    return connectionRepo.getConnection(pool, tenantId, connectionId);
  }
  disallowMemoryStoreInProduction({ storeName: 'accounting connections', hasDurableContext: false });
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
    const sumDebit = sumRound2(input.lines.map((l) => l.debit));
    const sumCredit = sumRound2(input.lines.map((l) => l.credit));
    if (from(sumDebit).minus(sumCredit).abs().greaterThan(0.01)) {
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

/** Default mock adapters — used when no real adapter is available */
const mockAdapters: Record<AccountingProvider, IAccountingAdapter> = {
  quickbooks: new MockAccountingAdapter('quickbooks'),
  xero: new MockAccountingAdapter('xero'),
  netsuite: new MockAccountingAdapter('netsuite'),
};

/** Real adapter instances — lazy-initialized per pool+tenant */
const realAdapterCache = new Map<string, IAccountingAdapter>();

/**
 * Get adapter for provider. Uses real implementation when available.
 * In production: throws if real adapter unavailable (no silent mock fallback).
 * In dev/test: mock allowed only if ALLOW_MOCK_ERP=true.
 */
function getAdapter(provider: AccountingProvider, pool?: Pool, tenantId?: string): IAccountingAdapter {
  if (pool && tenantId) {
    const cacheKey = `${provider}-${tenantId}`;
    const cached = realAdapterCache.get(cacheKey);
    if (cached) return cached;

    // Lazy-load real adapters to avoid circular imports
    try {
      if (provider === 'quickbooks') {
        const { QuickBooksAdapter } = require('../adapters/quickbooks_adapter.js');
        const adapter = new QuickBooksAdapter(pool, tenantId);
        realAdapterCache.set(cacheKey, adapter);
        return adapter;
      }
      if (provider === 'xero') {
        const { XeroAdapter } = require('../adapters/xero_adapter.js');
        const adapter = new XeroAdapter(pool, tenantId);
        realAdapterCache.set(cacheKey, adapter);
        return adapter;
      }
      if (provider === 'netsuite') {
        const { NetSuiteAdapter } = require('../adapters/netsuite_adapter.js');
        const adapter = new NetSuiteAdapter(pool, tenantId);
        realAdapterCache.set(cacheKey, adapter);
        return adapter;
      }
    } catch (adapterErr) {
      // Real adapter not available — only fall back to mock if explicitly allowed
      if (process.env.ALLOW_MOCK_ERP !== 'true') {
        throw new Error(
          `ERP sync failed: ${provider} adapter unavailable (${(adapterErr as Error).message}). ` +
          `Verify credentials and connectivity before syncing. Set ALLOW_MOCK_ERP=true for local development only.`
        );
      }
      console.warn(`[ERP] ${provider} adapter failed, using MOCK (ALLOW_MOCK_ERP=true):`, (adapterErr as Error).message);
      console.error(`[ERP][CRITICAL] MOCK DATA ACTIVE for ${provider} — financial data is NOT real. This must never happen in production.`);
    }
  }

  // Mock fallback — only if explicitly enabled and not production
  if (process.env.ALLOW_MOCK_ERP !== 'true') {
    throw new Error(
      `ERP sync failed: ${provider} adapter unavailable (no pool/tenant context). ` +
      `Do not proceed with mock data. Set ALLOW_MOCK_ERP=true for local development only.`
    );
  }
  console.error(`[ERP][CRITICAL] Using MockAccountingAdapter for ${provider} — financial data is NOT real. ALLOW_MOCK_ERP is set.`);
  return mockAdapters[provider];
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

export async function getConnection(connectionId: string, pool?: Pool, tenantId?: string): Promise<AccountingConnection | undefined> {
  if (isDbConfigured() && pool && tenantId) {
    const conn = await connectionRepo.getConnection(pool, tenantId, connectionId);
    return conn ?? undefined;
  }
  disallowMemoryStoreInProduction({ storeName: 'accounting connections', hasDurableContext: false });
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
  pool?: Pool,
  tenantId?: string
): Promise<SyncTrialBalanceResult> {
  const conn = await getConnectionById(connectionId, pool, tenantId);
  if (!conn) {
    const date = asOfDate ?? new Date().toISOString().slice(0, 10);
    return { success: false, entries: [], asOfDate: date, provider: 'quickbooks', connectionId, errors: ['Connection not found'] };
  }
  const result = await getAdapter(conn.provider, pool ?? undefined, tenantId ?? undefined).syncTrialBalance(conn, connectionId, asOfDate);
  if (isDbConfigured() && pool && tenantId && result.success) {
    await connectionRepo.updateConnection(pool, tenantId, connectionId, { lastSyncAt: new Date().toISOString(), lastSyncStatus: 'success' });
  } else if (!pool && result.success) {
    disallowMemoryStoreInProduction({ storeName: 'accounting connections', hasDurableContext: false });
    connectionStore.update(connectionId, { lastSyncAt: new Date().toISOString(), lastSyncStatus: 'success' });
  }
  return result;
}

export async function pushJournalEntry(input: PushJournalEntryInput, pool?: Pool, tenantId?: string): Promise<PushJournalEntryResult> {
  const conn = await getConnectionById(input.connectionId, pool, tenantId);
  if (!conn) return { success: false, errors: ['Connection not found'] };
  return getAdapter(conn.provider, pool ?? undefined, tenantId ?? undefined).pushJournalEntry(conn, input);
}

export async function pullTransactions(input: PullTransactionsInput, pool?: Pool, tenantId?: string): Promise<PullTransactionsResult> {
  const conn = await getConnectionById(input.connectionId, pool, tenantId);
  if (!conn) return { success: false, transactions: [], errors: ['Connection not found'] };
  return getAdapter(conn.provider, pool ?? undefined, tenantId ?? undefined).pullTransactions(conn, input);
}
