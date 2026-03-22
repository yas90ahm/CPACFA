/**
 * Xero Adapter — unit tests with mocked HTTP.
 * Validates request shape, response parsing, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { installMockFetch, type MockRoute } from './helpers/mock_fetch.js';
import { createMockPool } from './helpers/mock_pool.js';
import { XeroAdapter } from '../../src/adapters/xero_adapter.js';
import type { AccountingConnection } from '../../src/types/accounting_integration.js';

import xeroTbFixture from './fixtures/xero_trial_balance.json';
import xeroJeCreated from './fixtures/xero_manual_journal_created.json';
import xeroJournalsList from './fixtures/xero_manual_journals_list.json';

const MOCK_TOKEN = 'xero-test-token-abc123';
const MOCK_XERO_TENANT_ID = 'xt-00001111-2222-3333-4444-555566667777';

const mockConn: AccountingConnection = {
  id: 'conn-xero-1',
  tenantId: 'tenant-1',
  provider: 'xero',
  name: 'Test Xero Org',
  credentialRef: 'oauth-ref',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

function setupMockPool() {
  const mp = createMockPool();
  // getValidAccessToken query
  mp.onQuery('tenant_oauth_tokens', {
    rows: [{
      access_token_encrypted: '', // will be bypassed
      refresh_token_encrypted: null,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      provider: 'xero',
      realm_id: null,
      connection_id: 'conn-xero-1',
    }],
  });
  // Xero tenant ID query
  mp.onQuery('tenant_external_id', {
    rows: [{ tenant_external_id: MOCK_XERO_TENANT_ID }],
  });
  return mp;
}

describe('XeroAdapter', () => {
  let mockFetch: ReturnType<typeof installMockFetch>;

  afterEach(() => {
    mockFetch?.restore();
  });

  // We need to bypass the real getToken which calls getValidAccessToken + DB query.
  // Instead, we'll test the adapter's HTTP behavior by mocking at the fetch level
  // and using a subclass that overrides getToken.
  function createAdapter(pool: ReturnType<typeof createMockPool>) {
    const adapter = new XeroAdapter(pool.pool, 'tenant-1');
    // Override private getToken via prototype
    (adapter as any).getToken = async () => ({
      accessToken: MOCK_TOKEN,
      xeroTenantId: MOCK_XERO_TENANT_ID,
    });
    return adapter;
  }

  describe('syncTrialBalance', () => {
    it('parses Xero trial balance response with correct account codes and amounts', async () => {
      const mp = setupMockPool();
      mockFetch = installMockFetch([
        { match: '/Reports/TrialBalance', body: xeroTbFixture },
      ]);
      const adapter = createAdapter(mp);

      const result = await adapter.syncTrialBalance(mockConn, 'conn-xero-1', '2024-03-31');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('xero');
      expect(result.asOfDate).toBe('2024-03-31');
      expect(result.entries).toHaveLength(5);

      // Verify specific accounts parsed correctly
      const cash = result.entries.find((e) => e.accountCode === '1000');
      expect(cash).toBeDefined();
      expect(cash!.accountName).toBe('Cash at Bank');
      expect(cash!.debit).toBe(200000);
      expect(cash!.credit).toBe(0);

      const revenue = result.entries.find((e) => e.accountCode === '4000');
      expect(revenue).toBeDefined();
      expect(revenue!.credit).toBe(150000);

      // Verify dollar signs and commas stripped
      const serviceRev = result.entries.find((e) => e.accountCode === '4100');
      expect(serviceRev!.credit).toBe(75000);
    });

    it('sends correct Authorization and Xero-Tenant-Id headers', async () => {
      const mp = setupMockPool();
      mockFetch = installMockFetch([
        { match: '/Reports/TrialBalance', body: xeroTbFixture },
      ]);
      const adapter = createAdapter(mp);

      await adapter.syncTrialBalance(mockConn, 'conn-xero-1', '2024-03-31');

      const reqs = mockFetch.requestsTo('/Reports/TrialBalance');
      expect(reqs).toHaveLength(1);
      expect(reqs[0].headers['Authorization']).toBe(`Bearer ${MOCK_TOKEN}`);
      expect(reqs[0].headers['Xero-Tenant-Id']).toBe(MOCK_XERO_TENANT_ID);
      expect(reqs[0].method).toBe('GET');
    });

    it('includes date parameter in URL', async () => {
      const mp = setupMockPool();
      mockFetch = installMockFetch([
        { match: '/Reports/TrialBalance', body: { Reports: [{ Rows: [] }] } },
      ]);
      const adapter = createAdapter(mp);

      await adapter.syncTrialBalance(mockConn, 'conn-xero-1', '2024-06-30');

      const reqs = mockFetch.requestsTo('/Reports/TrialBalance');
      expect(reqs[0].url).toContain('date=2024-06-30');
    });

    it('returns empty entries for report with no data rows', async () => {
      const mp = setupMockPool();
      mockFetch = installMockFetch([
        { match: '/Reports/TrialBalance', body: { Reports: [{ Rows: [] }] } },
      ]);
      const adapter = createAdapter(mp);

      const result = await adapter.syncTrialBalance(mockConn, 'conn-xero-1');

      expect(result.success).toBe(true);
      expect(result.entries).toHaveLength(0);
    });

    it('returns error on 401 unauthorized', async () => {
      const mp = setupMockPool();
      mockFetch = installMockFetch([
        { match: '/Reports/TrialBalance', status: 401, body: { Type: 'AuthenticationException' } },
      ]);
      const adapter = createAdapter(mp);

      const result = await adapter.syncTrialBalance(mockConn, 'conn-xero-1');

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('401');
    });

    it('returns error on 429 rate limit', async () => {
      const mp = setupMockPool();
      mockFetch = installMockFetch([
        { match: '/Reports/TrialBalance', status: 429, body: { Type: 'RateLimitException' }, headers: { 'Retry-After': '60' } },
      ]);
      const adapter = createAdapter(mp);

      const result = await adapter.syncTrialBalance(mockConn, 'conn-xero-1');

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('429');
    });
  });

  describe('pushJournalEntry', () => {
    it('sends correct POST body to /ManualJournals', async () => {
      const mp = setupMockPool();
      mockFetch = installMockFetch([
        { match: '/ManualJournals', method: 'POST', body: xeroJeCreated },
      ]);
      const adapter = createAdapter(mp);

      const result = await adapter.pushJournalEntry(mockConn, {
        connectionId: 'conn-xero-1',
        date: '2024-03-31',
        memo: 'Monthly depreciation',
        lines: [
          { accountCode: '6000', accountName: 'Depreciation', debit: 5000, credit: 0, description: 'Depreciation' },
          { accountCode: '1500', accountName: 'Accum Depr', debit: 0, credit: 5000, description: 'Depreciation' },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result.externalRef).toContain('XERO-MJ-');

      // Verify request body structure
      const reqs = mockFetch.requestsTo('/ManualJournals');
      expect(reqs).toHaveLength(1);
      const body = reqs[0].body as any;
      expect(body.ManualJournals).toHaveLength(1);
      expect(body.ManualJournals[0].Date).toBe('2024-03-31');
      expect(body.ManualJournals[0].Narration).toBe('Monthly depreciation');
      expect(body.ManualJournals[0].JournalLines).toHaveLength(2);

      // Debit line should have positive LineAmount
      expect(body.ManualJournals[0].JournalLines[0].LineAmount).toBe(5000);
      // Credit line should have negative LineAmount
      expect(body.ManualJournals[0].JournalLines[1].LineAmount).toBe(-5000);
    });

    it('returns error on 500 response', async () => {
      const mp = setupMockPool();
      mockFetch = installMockFetch([
        { match: '/ManualJournals', method: 'POST', status: 500, text: 'Internal Server Error' },
      ]);
      const adapter = createAdapter(mp);

      const result = await adapter.pushJournalEntry(mockConn, {
        connectionId: 'conn-xero-1',
        date: '2024-03-31',
        lines: [
          { accountCode: '6000', accountName: 'Expense', debit: 1000, credit: 0 },
          { accountCode: '1000', accountName: 'Cash', debit: 0, credit: 1000 },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('500');
    });
  });

  describe('pullTransactions', () => {
    it('parses journal lines into PulledTransaction array', async () => {
      const mp = setupMockPool();
      mockFetch = installMockFetch([
        { match: '/ManualJournals', method: 'GET', body: xeroJournalsList },
      ]);
      const adapter = createAdapter(mp);

      const result = await adapter.pullTransactions(mockConn, {
        connectionId: 'conn-xero-1',
        startDate: '2024-03-01',
        endDate: '2024-03-31',
      });

      expect(result.success).toBe(true);
      // 2 journals x 2 lines each = 4 transactions
      expect(result.transactions).toHaveLength(4);

      // Positive LineAmount → debit
      const salaryLine = result.transactions.find((t) => t.accountCode === '6100');
      expect(salaryLine).toBeDefined();
      expect(salaryLine!.debit).toBe(45000);
      expect(salaryLine!.credit).toBe(0);

      // Negative LineAmount → credit
      const accrualLine = result.transactions.find((t) => t.accountCode === '2100');
      expect(accrualLine).toBeDefined();
      expect(accrualLine!.debit).toBe(0);
      expect(accrualLine!.credit).toBe(45000);
    });

    it('filters by accountCodes when specified', async () => {
      const mp = setupMockPool();
      mockFetch = installMockFetch([
        { match: '/ManualJournals', method: 'GET', body: xeroJournalsList },
      ]);
      const adapter = createAdapter(mp);

      const result = await adapter.pullTransactions(mockConn, {
        connectionId: 'conn-xero-1',
        startDate: '2024-03-01',
        endDate: '2024-03-31',
        accountCodes: ['6100'],
      });

      expect(result.success).toBe(true);
      // Only lines with account 6100 should be included
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].accountCode).toBe('6100');
    });

    it('encodes date filter in URL', async () => {
      const mp = setupMockPool();
      mockFetch = installMockFetch([
        { match: '/ManualJournals', method: 'GET', body: { ManualJournals: [] } },
      ]);
      const adapter = createAdapter(mp);

      await adapter.pullTransactions(mockConn, {
        connectionId: 'conn-xero-1',
        startDate: '2024-03-01',
        endDate: '2024-03-31',
      });

      const reqs = mockFetch.requestsTo('/ManualJournals');
      expect(reqs[0].url).toContain('where=');
      expect(decodeURIComponent(reqs[0].url)).toContain('DateTime(2024,03,01)');
      expect(decodeURIComponent(reqs[0].url)).toContain('DateTime(2024,03,31)');
    });
  });
});
