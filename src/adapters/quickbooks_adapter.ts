/**
 * QuickBooks Online Adapter — real API implementation.
 *
 * Uses QuickBooks Online Accounting API v3 (REST + JSON).
 * Requires OAuth2 access token managed by oauth_service.
 *
 * Operations:
 * - syncTrialBalance: GET /reports/TrialBalance
 * - pushJournalEntry: POST /journalentry
 * - pullTransactions: GET /query (QUERY SELECT * FROM JournalEntry)
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
import { from } from '../utils/decimal.js';

const QB_API_BASE = process.env.QB_API_BASE ?? 'https://quickbooks.api.intuit.com/v3';
const QB_SANDBOX_API_BASE = process.env.QB_SANDBOX_API_BASE ?? 'https://sandbox-quickbooks.api.intuit.com/v3';

function getApiBase(): string {
  return process.env.QB_SANDBOX === 'true' ? QB_SANDBOX_API_BASE : QB_API_BASE;
}

interface QBTrialBalanceReport {
  Header: { Time: string; ReportName: string; DateMacro: string; StartPeriod: string; EndPeriod: string };
  Columns: { Column: Array<{ ColTitle: string; ColType: string }> };
  Rows: {
    Row: Array<{
      ColData: Array<{ value: string; id?: string }>;
      group?: string;
      Summary?: { ColData: Array<{ value: string }> };
      Rows?: { Row: Array<{ ColData: Array<{ value: string; id?: string }> }> };
    }>;
  };
}

interface QBJournalEntryResponse {
  JournalEntry: {
    Id: string;
    SyncToken: string;
    TxnDate: string;
  };
}

export class QuickBooksAdapter implements IAccountingAdapter {
  constructor(private pool: Pool, private tenantId: string) {}

  private async getToken(connectionId: string): Promise<{ accessToken: string; realmId: string }> {
    const tokenData = await getValidAccessToken(this.pool, this.tenantId, connectionId);
    if (!tokenData || !tokenData.accessToken) {
      throw new Error('No valid QuickBooks access token. Please reconnect.');
    }
    if (!tokenData.realmId) {
      throw new Error('No QuickBooks realmId (company ID) found. Please reconnect.');
    }
    return { accessToken: tokenData.accessToken, realmId: tokenData.realmId };
  }

  private async qbFetch(
    realmId: string,
    accessToken: string,
    path: string,
    options?: { method?: string; body?: unknown }
  ): Promise<Response> {
    const url = `${getApiBase()}/company/${realmId}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    };
    if (options?.body) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(url, {
      method: options?.method ?? 'GET',
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
  }

  async syncTrialBalance(
    conn: AccountingConnection,
    connectionId: string,
    asOfDate?: string
  ): Promise<SyncTrialBalanceResult> {
    try {
      const { accessToken, realmId } = await this.getToken(connectionId);
      const date = asOfDate ?? new Date().toISOString().slice(0, 10);

      const response = await this.qbFetch(
        realmId,
        accessToken,
        `/reports/TrialBalance?date_macro=&start_date=${date}&end_date=${date}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          entries: [],
          asOfDate: date,
          provider: 'quickbooks',
          connectionId,
          errors: [`QuickBooks API error ${response.status}: ${errorText}`],
        };
      }

      const report = await response.json() as QBTrialBalanceReport;
      const entries: TrialBalanceEntry[] = [];

      // Parse QB report structure
      const rows = report.Rows?.Row ?? [];
      for (const row of rows) {
        // Section rows have nested Rows
        if (row.Rows?.Row) {
          for (const subRow of row.Rows.Row) {
            const entry = this.parseQBTrialBalanceRow(subRow.ColData);
            if (entry) entries.push(entry);
          }
        } else if (row.ColData && !row.Summary) {
          const entry = this.parseQBTrialBalanceRow(row.ColData);
          if (entry) entries.push(entry);
        }
      }

      return {
        success: true,
        entries,
        asOfDate: date,
        provider: 'quickbooks',
        connectionId,
        errors: [],
      };
    } catch (err) {
      return {
        success: false,
        entries: [],
        asOfDate: asOfDate ?? new Date().toISOString().slice(0, 10),
        provider: 'quickbooks',
        connectionId,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  private parseQBTrialBalanceRow(colData: Array<{ value: string; id?: string }>): TrialBalanceEntry | null {
    if (!colData || colData.length < 3) return null;
    const accountName = colData[0]?.value ?? '';
    if (!accountName || accountName === 'Total') return null;

    const debitStr = colData[1]?.value ?? '0';
    const creditStr = colData[2]?.value ?? '0';
    const debit = Number(debitStr.replace(/[,$]/g, '')) || 0;
    const credit = Number(creditStr.replace(/[,$]/g, '')) || 0;

    return {
      accountCode: colData[0]?.id ?? accountName,
      accountName,
      debit,
      credit,
    };
  }

  async pushJournalEntry(
    conn: AccountingConnection,
    input: PushJournalEntryInput
  ): Promise<PushJournalEntryResult> {
    try {
      const { accessToken, realmId } = await this.getToken(input.connectionId);

      // Build QB journal entry format
      const lines = input.lines.map((line) => {
        const isDebit = line.debit > 0;
        return {
          JournalEntryLineDetail: {
            PostingType: isDebit ? 'Debit' : 'Credit',
            AccountRef: {
              name: line.accountName,
              value: line.accountCode,
            },
          },
          Description: line.description ?? input.memo ?? '',
          Amount: isDebit ? line.debit : line.credit,
          DetailType: 'JournalEntryLineDetail',
        };
      });

      const body = {
        TxnDate: input.date,
        PrivateNote: input.memo ?? '',
        Line: lines,
      };

      const response = await this.qbFetch(realmId, accessToken, '/journalentry', {
        method: 'POST',
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          errors: [`QuickBooks API error ${response.status}: ${errorText}`],
        };
      }

      const result = await response.json() as QBJournalEntryResponse;
      return {
        success: true,
        externalId: result.JournalEntry.Id,
        externalRef: `QB-JE-${result.JournalEntry.Id}`,
        errors: [],
      };
    } catch (err) {
      return {
        success: false,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  async pullTransactions(
    conn: AccountingConnection,
    input: PullTransactionsInput
  ): Promise<PullTransactionsResult> {
    try {
      const { accessToken, realmId } = await this.getToken(input.connectionId);

      // Query journal entries within date range
      let query = `SELECT * FROM JournalEntry WHERE TxnDate >= '${input.startDate}' AND TxnDate <= '${input.endDate}'`;
      if (input.accountCodes && input.accountCodes.length > 0) {
        // QB doesn't support account filtering in query; we filter in-memory
      }

      const encodedQuery = encodeURIComponent(query);
      const response = await this.qbFetch(realmId, accessToken, `/query?query=${encodedQuery}`);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          transactions: [],
          errors: [`QuickBooks API error ${response.status}: ${errorText}`],
        };
      }

      const data = await response.json() as {
        QueryResponse: {
          JournalEntry?: Array<{
            Id: string;
            TxnDate: string;
            PrivateNote?: string;
            Line: Array<{
              JournalEntryLineDetail: {
                PostingType: string;
                AccountRef: { value: string; name: string };
              };
              Description?: string;
              Amount: number;
            }>;
          }>;
        };
      };

      const transactions: PulledTransaction[] = [];
      const entries = data.QueryResponse?.JournalEntry ?? [];

      for (const entry of entries) {
        for (const line of entry.Line) {
          const accountCode = line.JournalEntryLineDetail?.AccountRef?.value ?? '';
          const accountName = line.JournalEntryLineDetail?.AccountRef?.name ?? '';

          // Filter by account codes if specified
          if (input.accountCodes && input.accountCodes.length > 0) {
            if (!input.accountCodes.includes(accountCode)) continue;
          }

          const isDebit = line.JournalEntryLineDetail?.PostingType === 'Debit';
          transactions.push({
            externalId: `QB-JE-${entry.Id}-${accountCode}`,
            date: entry.TxnDate,
            description: line.Description ?? entry.PrivateNote ?? '',
            accountCode,
            accountName,
            debit: isDebit ? line.Amount : 0,
            credit: isDebit ? 0 : line.Amount,
            reference: `JE-${entry.Id}`,
          });
        }
      }

      return {
        success: true,
        transactions,
        errors: [],
      };
    } catch (err) {
      return {
        success: false,
        transactions: [],
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }
}
