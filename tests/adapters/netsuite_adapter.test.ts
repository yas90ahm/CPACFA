/**
 * NetSuite Adapter — unit tests with mocked HTTP.
 * Validates SuiteQL queries, request shape, response parsing, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { installMockFetch, type MockRoute } from './helpers/mock_fetch.js';
import { createMockPool } from './helpers/mock_pool.js';
import { NetSuiteAdapter } from '../../src/adapters/netsuite_adapter.js';
import type { AccountingConnection } from '../../src/types/accounting_integration.js';

import nsTbFixture from './fixtures/netsuite_suiteql_tb.json';
import nsJeCreated from './fixtures/netsuite_je_created.json';
import nsTxnsFixture from './fixtures/netsuite_suiteql_txns.json';

const MOCK_TOKEN = 'ns-test-token-xyz789';
const MOCK_ACCOUNT_ID = 'TSTDRV1234567';

const mockConn: AccountingConnection = {
  id: 'conn-ns-1',
  tenantId: 'tenant-1',
  provider: 'netsuite',
  name: 'Test NetSuite Account',
  credentialRef: 'oauth-ref',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('NetSuiteAdapter', () => {
  let mockFetch: ReturnType<typeof installMockFetch>;

  afterEach(() => {
    mockFetch?.restore();
  });

  function createAdapter() {
    const mp = createMockPool();
    const adapter = new NetSuiteAdapter(mp.pool, 'tenant-1');
    // Override private getToken
    (adapter as any).getToken = async () => ({
      accessToken: MOCK_TOKEN,
      accountId: MOCK_ACCOUNT_ID,
    });
    return { adapter, mp };
  }

  describe('syncTrialBalance', () => {
    it('sends SuiteQL query with correct SQL structure', async () => {
      const { adapter } = createAdapter();
      mockFetch = installMockFetch([
        { match: 'suiteql', method: 'POST', body: nsTbFixture },
      ]);

      const result = await adapter.syncTrialBalance(mockConn, 'conn-ns-1', '2024-03-31');

      expect(result.success).toBe(true);

      // Verify SuiteQL request
      const reqs = mockFetch.requestsTo('suiteql');
      expect(reqs).toHaveLength(1);
      const body = reqs[0].body as any;
      expect(body.q).toBeDefined();
      expect(body.q).toContain('transactionaccountingline');
      expect(body.q).toContain('2024-03-31');
      expect(body.q).toContain("t.posting = 'T'");
    });

    it('parses SuiteQL response into TrialBalanceEntry array', async () => {
      const { adapter } = createAdapter();
      mockFetch = installMockFetch([
        { match: 'suiteql', method: 'POST', body: nsTbFixture },
      ]);

      const result = await adapter.syncTrialBalance(mockConn, 'conn-ns-1', '2024-03-31');

      expect(result.entries).toHaveLength(7);

      const cash = result.entries.find((e) => e.accountCode === '1000');
      expect(cash).toBeDefined();
      expect(cash!.accountName).toBe('Cash and Cash Equivalents');
      expect(cash!.debit).toBe(320000);
      expect(cash!.credit).toBe(0);

      const revenue = result.entries.find((e) => e.accountCode === '4000');
      expect(revenue!.credit).toBe(500000);

      const cogs = result.entries.find((e) => e.accountCode === '5000');
      expect(cogs!.debit).toBe(275000);
    });

    it('constructs URL with correct account ID', async () => {
      const { adapter } = createAdapter();
      mockFetch = installMockFetch([
        { match: 'suiteql', method: 'POST', body: nsTbFixture },
      ]);

      await adapter.syncTrialBalance(mockConn, 'conn-ns-1');

      const reqs = mockFetch.requestsTo('suiteql');
      // Account ID should be lowercased and underscores replaced with dashes
      expect(reqs[0].url).toContain('tstdrv1234567.suitetalk.api.netsuite.com');
    });

    it('sends correct auth headers', async () => {
      const { adapter } = createAdapter();
      mockFetch = installMockFetch([
        { match: 'suiteql', method: 'POST', body: nsTbFixture },
      ]);

      await adapter.syncTrialBalance(mockConn, 'conn-ns-1');

      const reqs = mockFetch.requestsTo('suiteql');
      expect(reqs[0].headers['Authorization']).toBe(`Bearer ${MOCK_TOKEN}`);
      expect(reqs[0].headers['Prefer']).toBe('transient');
      expect(reqs[0].headers['Content-Type']).toBe('application/json');
    });

    it('returns error on SuiteQL 400 bad query', async () => {
      const { adapter } = createAdapter();
      mockFetch = installMockFetch([
        {
          match: 'suiteql',
          method: 'POST',
          status: 400,
          text: '{"type":"https://system.netsuite.com/errors","title":"Invalid Query","status":400,"detail":"Syntax error in SuiteQL query"}',
        },
      ]);

      const result = await adapter.syncTrialBalance(mockConn, 'conn-ns-1');

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('SuiteQL error 400');
    });
  });

  describe('pushJournalEntry', () => {
    it('sends correct POST body to /record/v1/journalentry', async () => {
      const { adapter } = createAdapter();
      mockFetch = installMockFetch([
        {
          match: '/record/v1/journalentry',
          method: 'POST',
          status: 204,
          body: {},
          headers: { 'Location': '/services/rest/record/v1/journalentry/78543' },
        },
      ]);

      const result = await adapter.pushJournalEntry(mockConn, {
        connectionId: 'conn-ns-1',
        date: '2024-03-31',
        memo: 'Monthly depreciation entry',
        idempotencyKey: 'sabit-approved-je-1',
        lines: [
          { accountCode: '6000', accountName: 'Depreciation', debit: 12500, credit: 0, description: 'Fixed asset' },
          { accountCode: '1500', accountName: 'Accum Depr', debit: 0, credit: 12500, description: 'Fixed asset' },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('78543');
      expect(result.externalRef).toBe('NS-JE-78543');

      // Verify request body
      const reqs = mockFetch.requestsTo('/record/v1/journalentry');
      const body = reqs[0].body as any;
      expect(body.trandate).toBe('2024-03-31');
      expect(body.memo).toBe('Monthly depreciation entry');
      expect(body.line.items).toHaveLength(2);
      expect(body.line.items[0].account.number).toBe('6000');
      expect(body.line.items[0].debit).toBe(12500);
      expect(body.line.items[1].credit).toBe(12500);
      expect(reqs[0].headers['X-NetSuite-idempotency-key']).toBe('sabit-approved-je-1');
    });

    it('returns error on 400 validation failure', async () => {
      const { adapter } = createAdapter();
      mockFetch = installMockFetch([
        {
          match: '/record/v1/journalentry',
          method: 'POST',
          status: 400,
          text: 'Invalid journal entry: debits must equal credits',
        },
      ]);

      const result = await adapter.pushJournalEntry(mockConn, {
        connectionId: 'conn-ns-1',
        date: '2024-03-31',
        lines: [
          { accountCode: '6000', accountName: 'Expense', debit: 1000, credit: 0 },
          { accountCode: '1000', accountName: 'Cash', debit: 0, credit: 999 },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('400');
    });

    it('URL contains account-specific domain', async () => {
      const { adapter } = createAdapter();
      mockFetch = installMockFetch([
        {
          match: '/record/v1/journalentry',
          method: 'POST',
          status: 204,
          headers: { 'Location': '/services/rest/record/v1/journalentry/99' },
        },
      ]);

      await adapter.pushJournalEntry(mockConn, {
        connectionId: 'conn-ns-1',
        date: '2024-03-31',
        lines: [
          { accountCode: '6000', accountName: 'Expense', debit: 100, credit: 0 },
          { accountCode: '1000', accountName: 'Cash', debit: 0, credit: 100 },
        ],
      });

      const reqs = mockFetch.requestsTo('/record/v1/journalentry');
      expect(reqs[0].url).toContain('tstdrv1234567.suitetalk.api.netsuite.com');
    });
  });

  describe('pullTransactions', () => {
    it('sends SuiteQL query with date range and parses results', async () => {
      const { adapter } = createAdapter();
      mockFetch = installMockFetch([
        { match: 'suiteql', method: 'POST', body: nsTxnsFixture },
      ]);

      const result = await adapter.pullTransactions(mockConn, {
        connectionId: 'conn-ns-1',
        startDate: '2024-03-01',
        endDate: '2024-03-31',
      });

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(4);

      // Verify parsed fields
      const arLine = result.transactions.find((t) => t.accountCode === '1200');
      expect(arLine).toBeDefined();
      expect(arLine!.debit).toBe(75000);
      expect(arLine!.credit).toBe(0);
      expect(arLine!.reference).toBe('INV-2024-042');

      // SQL should contain date range
      const reqs = mockFetch.requestsTo('suiteql');
      const sql = (reqs[0].body as any).q;
      expect(sql).toContain('2024-03-01');
      expect(sql).toContain('2024-03-31');
    });

    it('includes account code filter in SuiteQL when accountCodes specified', async () => {
      const { adapter } = createAdapter();
      mockFetch = installMockFetch([
        { match: 'suiteql', method: 'POST', body: { items: [] } },
      ]);

      await adapter.pullTransactions(mockConn, {
        connectionId: 'conn-ns-1',
        startDate: '2024-03-01',
        endDate: '2024-03-31',
        accountCodes: ['1000', '1200'],
      });

      const reqs = mockFetch.requestsTo('suiteql');
      const sql = (reqs[0].body as any).q;
      expect(sql).toContain("'1000'");
      expect(sql).toContain("'1200'");
      expect(sql).toContain('IN');
    });

    it('handles null debit/credit in SuiteQL response', async () => {
      const { adapter } = createAdapter();
      mockFetch = installMockFetch([
        { match: 'suiteql', method: 'POST', body: nsTxnsFixture },
      ]);

      const result = await adapter.pullTransactions(mockConn, {
        connectionId: 'conn-ns-1',
        startDate: '2024-03-01',
        endDate: '2024-03-31',
      });

      // Items with null debit/credit should parse to 0
      const cashLine = result.transactions.find((t) => t.accountCode === '1000');
      expect(cashLine!.debit).toBe(0); // null in fixture → 0
      expect(cashLine!.credit).toBe(2500);
    });
  });
});
