/**
 * NetSuite Adapter — real API implementation.
 * Uses NetSuite REST Web Services / SuiteQL for data retrieval.
 * OAuth2 token-based auth via oauth_service.
 */

import type { Pool } from 'pg';
import type { IAccountingAdapter } from '../services/accounting_integration_service.js';
import type {
  AccountingConnection,
  SyncTrialBalanceResult,
  PushJournalEntryInput,
  PushJournalEntryResult,
  PullTransactionsInput,
  PullTransactionsResult,
  PulledTransaction,
} from '../types/accounting_integration.js';
import type { TrialBalanceEntry } from '../types/financial.js';
import { getValidAccessToken } from '../services/oauth_service.js';

const NS_REST_BASE = process.env.NS_REST_BASE ?? 'https://rest.netsuite.com/rest/platform/v1';

function validateDate(date: string, fieldName: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid ${fieldName}: must be YYYY-MM-DD format, got "${date}"`);
  }
}

function validateAccountCode(code: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(code)) {
    throw new Error(`Invalid account code: contains disallowed characters, got "${code}"`);
  }
}

export class NetSuiteAdapter implements IAccountingAdapter {
  constructor(private pool: Pool, private tenantId: string) {}

  private async getToken(connectionId: string): Promise<{ accessToken: string; accountId: string }> {
    const tokenData = await getValidAccessToken(this.pool, this.tenantId, connectionId);
    if (!tokenData?.accessToken) throw new Error('No valid NetSuite access token. Please reconnect.');
    const accountId = tokenData.realmId ?? process.env.NS_ACCOUNT_ID ?? '';
    if (!accountId) throw new Error('No NetSuite account ID found.');
    return { accessToken: tokenData.accessToken, accountId };
  }

  private async nsFetch(
    accessToken: string,
    accountId: string,
    path: string,
    options?: { method?: string; body?: unknown; idempotencyKey?: string }
  ): Promise<Response> {
    const baseUrl = `https://${accountId.toLowerCase().replace('_', '-')}.suitetalk.api.netsuite.com/services/rest`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Prefer': 'transient',
    };
    if (options?.body) headers['Content-Type'] = 'application/json';
    if (options?.idempotencyKey) {
      headers['X-NetSuite-idempotency-key'] = options.idempotencyKey;
    }
    return fetch(`${baseUrl}${path}`, {
      method: options?.method ?? 'GET',
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
  }

  private async runSuiteQL(
    accessToken: string,
    accountId: string,
    query: string
  ): Promise<Array<Record<string, string | number | null>>> {
    const baseUrl = `https://${accountId.toLowerCase().replace('_', '-')}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Prefer': 'transient',
      },
      body: JSON.stringify({ q: query }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`SuiteQL error ${response.status}: ${errText}`);
    }
    const data = await response.json() as { items: Array<Record<string, string | number | null>> };
    return data.items ?? [];
  }

  async syncTrialBalance(
    conn: AccountingConnection,
    connectionId: string,
    asOfDate?: string
  ): Promise<SyncTrialBalanceResult> {
    try {
      const { accessToken, accountId } = await this.getToken(connectionId);
      const date = asOfDate ?? new Date().toISOString().slice(0, 10);
      validateDate(date, 'asOfDate');

      // SuiteQL to get trial balance
      const query = `
        SELECT a.acctnumber AS account_code, a.acctname AS account_name,
               SUM(CASE WHEN tal.debit IS NOT NULL THEN tal.debit ELSE 0 END) AS debit,
               SUM(CASE WHEN tal.credit IS NOT NULL THEN tal.credit ELSE 0 END) AS credit
        FROM transactionaccountingline tal
        JOIN transaction t ON tal.transaction = t.id
        JOIN account a ON tal.account = a.id
        WHERE t.trandate <= TO_DATE('${date}', 'YYYY-MM-DD')
          AND t.posting = 'T'
        GROUP BY a.acctnumber, a.acctname
        ORDER BY a.acctnumber`;

      const rows = await this.runSuiteQL(accessToken, accountId, query);
      const entries: TrialBalanceEntry[] = rows.map((r) => ({
        accountCode: String(r.account_code ?? ''),
        accountName: String(r.account_name ?? ''),
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
      }));

      return { success: true, entries, asOfDate: date, provider: 'netsuite', connectionId, errors: [] };
    } catch (err) {
      return { success: false, entries: [], asOfDate: asOfDate ?? '', provider: 'netsuite', connectionId, errors: [err instanceof Error ? err.message : String(err)] };
    }
  }

  async pushJournalEntry(conn: AccountingConnection, input: PushJournalEntryInput): Promise<PushJournalEntryResult> {
    try {
      const { accessToken, accountId } = await this.getToken(input.connectionId);

      const lines = input.lines.map((line) => ({
        account: { number: line.accountCode },
        debit: line.debit > 0 ? line.debit : undefined,
        credit: line.credit > 0 ? line.credit : undefined,
        memo: line.description ?? '',
      }));

      const body = {
        trandate: input.date,
        memo: input.memo ?? '',
        line: { items: lines },
      };

      const response = await this.nsFetch(accessToken, accountId, '/record/v1/journalentry', {
        method: 'POST',
        body,
        idempotencyKey: input.idempotencyKey,
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, errors: [`NetSuite API error ${response.status}: ${errText}`] };
      }

      // NetSuite returns Location header with new record ID
      const location = response.headers.get('Location') ?? '';
      const idMatch = location.match(/\/(\d+)$/);
      const externalId = idMatch?.[1] ?? `ns-je-${Date.now()}`;

      return { success: true, externalId, externalRef: `NS-JE-${externalId}`, errors: [] };
    } catch (err) {
      return { success: false, errors: [err instanceof Error ? err.message : String(err)] };
    }
  }

  async pullTransactions(conn: AccountingConnection, input: PullTransactionsInput): Promise<PullTransactionsResult> {
    try {
      const { accessToken, accountId } = await this.getToken(input.connectionId);

      validateDate(input.startDate, 'startDate');
      validateDate(input.endDate, 'endDate');

      let accountFilter = '';
      if (input.accountCodes?.length) {
        for (const code of input.accountCodes) {
          validateAccountCode(code);
        }
        const codes = input.accountCodes.map((c) => `'${c}'`).join(',');
        accountFilter = `AND a.acctnumber IN (${codes})`;
      }

      const query = `
        SELECT t.id AS transaction_id, t.trandate, t.memo AS description,
               a.acctnumber AS account_code, a.acctname AS account_name,
               tal.debit, tal.credit, t.tranid AS reference
        FROM transactionaccountingline tal
        JOIN transaction t ON tal.transaction = t.id
        JOIN account a ON tal.account = a.id
        WHERE t.trandate >= TO_DATE('${input.startDate}', 'YYYY-MM-DD')
          AND t.trandate <= TO_DATE('${input.endDate}', 'YYYY-MM-DD')
          AND t.posting = 'T'
          ${accountFilter}
        ORDER BY t.trandate, t.id`;

      const rows = await this.runSuiteQL(accessToken, accountId, query);
      const transactions: PulledTransaction[] = rows.map((r) => ({
        externalId: `NS-${r.transaction_id}-${r.account_code}`,
        date: String(r.trandate ?? input.startDate).slice(0, 10),
        description: String(r.description ?? ''),
        accountCode: String(r.account_code ?? ''),
        accountName: String(r.account_name ?? ''),
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
        reference: String(r.reference ?? ''),
      }));

      return { success: true, transactions, errors: [] };
    } catch (err) {
      return { success: false, transactions: [], errors: [err instanceof Error ? err.message : String(err)] };
    }
  }
}
