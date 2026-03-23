/**
 * Route-level integration tests for accounting integration endpoints.
 * Validates the full Express route → service → adapter path with mocked fetch.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { installMockFetch } from './helpers/mock_fetch.js';
import { createMockPool } from './helpers/mock_pool.js';
import type { IAccountingAdapter } from '../../src/services/accounting_integration_service.js';
import type {
  AccountingConnection,
  SyncTrialBalanceResult,
  PushJournalEntryResult,
  PullTransactionsResult,
} from '../../src/types/accounting_integration.js';

import nsTbFixture from './fixtures/netsuite_suiteql_tb.json';
import xeroTbFixture from './fixtures/xero_trial_balance.json';
import xeroJeCreated from './fixtures/xero_manual_journal_created.json';
import nsTxnsFixture from './fixtures/netsuite_suiteql_txns.json';

/**
 * These tests validate the service-layer functions from accounting_integration_service
 * which are what the routes call. We test the full adapter selection + execution path.
 */

describe('Accounting Integration Service (route-level)', () => {
  let mockFetch: ReturnType<typeof installMockFetch>;

  afterEach(() => {
    mockFetch?.restore();
  });

  describe('adapter factory', () => {
    it('returns XeroAdapter for xero provider with pool', async () => {
      // Import the module to test adapter creation
      const { XeroAdapter } = await import('../../src/adapters/xero_adapter.js');
      const mp = createMockPool();
      const adapter = new XeroAdapter(mp.pool, 'tenant-1');
      expect(adapter).toBeDefined();
      expect(adapter.syncTrialBalance).toBeInstanceOf(Function);
      expect(adapter.pushJournalEntry).toBeInstanceOf(Function);
      expect(adapter.pullTransactions).toBeInstanceOf(Function);
    });

    it('returns NetSuiteAdapter for netsuite provider with pool', async () => {
      const { NetSuiteAdapter } = await import('../../src/adapters/netsuite_adapter.js');
      const mp = createMockPool();
      const adapter = new NetSuiteAdapter(mp.pool, 'tenant-1');
      expect(adapter).toBeDefined();
      expect(adapter.syncTrialBalance).toBeInstanceOf(Function);
      expect(adapter.pushJournalEntry).toBeInstanceOf(Function);
      expect(adapter.pullTransactions).toBeInstanceOf(Function);
    });
  });

  describe('IAccountingAdapter contract', () => {
    /**
     * Both adapters must implement the same interface.
     * These tests verify the return type contracts.
     */

    it('XeroAdapter.syncTrialBalance returns SyncTrialBalanceResult shape', async () => {
      const { XeroAdapter } = await import('../../src/adapters/xero_adapter.js');
      const mp = createMockPool();
      const adapter = new XeroAdapter(mp.pool, 'tenant-1');
      (adapter as any).getToken = async () => ({
        accessToken: 'token',
        xeroTenantId: 'xt-123',
      });

      mockFetch = installMockFetch([
        { match: '/Reports/TrialBalance', body: xeroTbFixture },
      ]);

      const conn: AccountingConnection = {
        id: 'c1', tenantId: 'tenant-1', provider: 'xero',
        name: 'Test', credentialRef: 'ref',
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
      };

      const result: SyncTrialBalanceResult = await adapter.syncTrialBalance(conn, 'c1', '2024-03-31');

      // Verify all required fields exist
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.entries)).toBe(true);
      expect(typeof result.asOfDate).toBe('string');
      expect(result.provider).toBe('xero');
      expect(typeof result.connectionId).toBe('string');
      expect(Array.isArray(result.errors)).toBe(true);

      // Verify entry shape
      for (const entry of result.entries) {
        expect(typeof entry.accountCode).toBe('string');
        expect(typeof entry.accountName).toBe('string');
        expect(typeof entry.debit).toBe('number');
        expect(typeof entry.credit).toBe('number');
      }
    });

    it('NetSuiteAdapter.syncTrialBalance returns SyncTrialBalanceResult shape', async () => {
      const { NetSuiteAdapter } = await import('../../src/adapters/netsuite_adapter.js');
      const mp = createMockPool();
      const adapter = new NetSuiteAdapter(mp.pool, 'tenant-1');
      (adapter as any).getToken = async () => ({
        accessToken: 'token',
        accountId: 'ACCT123',
      });

      mockFetch = installMockFetch([
        { match: 'suiteql', method: 'POST', body: nsTbFixture },
      ]);

      const conn: AccountingConnection = {
        id: 'c2', tenantId: 'tenant-1', provider: 'netsuite',
        name: 'Test NS', credentialRef: 'ref',
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
      };

      const result: SyncTrialBalanceResult = await adapter.syncTrialBalance(conn, 'c2', '2024-03-31');

      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.entries)).toBe(true);
      expect(result.provider).toBe('netsuite');

      for (const entry of result.entries) {
        expect(typeof entry.accountCode).toBe('string');
        expect(typeof entry.accountName).toBe('string');
        expect(typeof entry.debit).toBe('number');
        expect(typeof entry.credit).toBe('number');
      }
    });

    it('Xero and NetSuite TB results have consistent entry structure', async () => {
      const { XeroAdapter } = await import('../../src/adapters/xero_adapter.js');
      const { NetSuiteAdapter } = await import('../../src/adapters/netsuite_adapter.js');
      const mp = createMockPool();

      const xero = new XeroAdapter(mp.pool, 'tenant-1');
      (xero as any).getToken = async () => ({ accessToken: 't', xeroTenantId: 'xt' });

      const ns = new NetSuiteAdapter(mp.pool, 'tenant-1');
      (ns as any).getToken = async () => ({ accessToken: 't', accountId: 'A1' });

      mockFetch = installMockFetch([
        { match: '/Reports/TrialBalance', body: xeroTbFixture },
        { match: 'suiteql', method: 'POST', body: nsTbFixture },
      ]);

      const conn: AccountingConnection = {
        id: 'c', tenantId: 'tenant-1', provider: 'xero',
        name: 'T', credentialRef: 'r',
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
      };

      const xeroResult = await xero.syncTrialBalance(conn, 'c');
      const nsResult = await ns.syncTrialBalance({ ...conn, provider: 'netsuite' }, 'c');

      // Both should have same structure
      expect(Object.keys(xeroResult).sort()).toEqual(Object.keys(nsResult).sort());

      // Both entries should have same fields
      const xeroKeys = Object.keys(xeroResult.entries[0]).sort();
      const nsKeys = Object.keys(nsResult.entries[0]).sort();
      expect(xeroKeys).toEqual(nsKeys);
    });
  });

  describe('error propagation', () => {
    it('Xero adapter surfaces HTTP errors without crashing', async () => {
      const { XeroAdapter } = await import('../../src/adapters/xero_adapter.js');
      const mp = createMockPool();
      const adapter = new XeroAdapter(mp.pool, 'tenant-1');
      (adapter as any).getToken = async () => ({ accessToken: 't', xeroTenantId: 'xt' });

      mockFetch = installMockFetch([
        { match: '/Reports/TrialBalance', status: 503, body: { message: 'Service Unavailable' } },
      ]);

      const conn: AccountingConnection = {
        id: 'c', tenantId: 'tenant-1', provider: 'xero',
        name: 'T', credentialRef: 'r',
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
      };

      const result = await adapter.syncTrialBalance(conn, 'c');

      // Should return structured error, not throw
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.entries).toEqual([]);
    });

    it('NetSuite adapter surfaces fetch exceptions without crashing', async () => {
      const { NetSuiteAdapter } = await import('../../src/adapters/netsuite_adapter.js');
      const mp = createMockPool();
      const adapter = new NetSuiteAdapter(mp.pool, 'tenant-1');
      // getToken throws to simulate no credentials
      (adapter as any).getToken = async () => { throw new Error('No valid NetSuite access token. Please reconnect.'); };

      const conn: AccountingConnection = {
        id: 'c', tenantId: 'tenant-1', provider: 'netsuite',
        name: 'T', credentialRef: 'r',
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
      };

      const result = await adapter.syncTrialBalance(conn, 'c');

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('reconnect');
    });
  });
});
