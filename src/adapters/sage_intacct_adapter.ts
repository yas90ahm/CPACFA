/**
 * Sage Intacct Adapter — real API implementation.
 *
 * Uses Sage Intacct REST API v1 (JSON, OAuth2).
 * Requires OAuth2 access token managed by oauth_service.
 *
 * Operations:
 * - syncTrialBalance: GET /objects/glaccountbalance (paginated)
 * - pushJournalEntry: POST /objects/glbatch
 * - pullTransactions: GET /objects/glentry (paginated, date-filtered)
 *
 * Rate limit: 5 req/sec — 200ms delay between paginated requests.
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

const INTACCT_API_BASE = process.env.INTACCT_API_BASE ?? 'https://api.intacct.com/ia/api/v1';
const PAGE_SIZE = 100;
const RATE_LIMIT_DELAY_MS = 200;

const PROVIDER = 'sage_intacct' satisfies import('../types/accounting_integration.js').AccountingProvider;

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

/** Intacct GL account balance row from /objects/glaccountbalance */
interface IntacctGLBalanceRow {
  ACCOUNTNO: string;
  TITLE: string;
  DEBIT: string;
  CREDIT: string;
  LOCATIONID?: string;
  DEPARTMENTID?: string;
  CURRENCY?: string;
}

/** Intacct paginated response envelope */
interface IntacctListResponse<T> {
  'ia::result': T[];
  '@totalcount': number;
}

/** Intacct GL entry row from /objects/glentry */
interface IntacctGLEntryRow {
  RECORDNO: string;
  BATCH_DATE: string;
  ACCOUNTNO: string;
  ACCOUNT_TITLE?: string;
  TR_TYPE: string;
  AMOUNT: string;
  DESCRIPTION?: string;
  BATCH_NO?: string;
  BATCH_TITLE?: string;
}

/** Intacct GL batch creation response */
interface IntacctGLBatchResponse {
  'ia::result': {
    RECORDNO: string;
    BATCH_NO?: string;
  };
}

export class SageIntacctAdapter implements IAccountingAdapter {
  constructor(private pool: Pool, private tenantId: string) {}

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  private async getAuthHeaders(connectionId: string): Promise<Record<string, string>> {
    const token = await getValidAccessToken(this.pool, this.tenantId, connectionId);
    if (!token?.accessToken) {
      throw new Error('No valid Sage Intacct access token. Please reconnect.');
    }
    return {
      'Authorization': `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  // ---------------------------------------------------------------------------
  // Fetch helper
  // ---------------------------------------------------------------------------

  private async intacctFetch(
    connectionId: string,
    path: string,
    options?: { method?: string; body?: unknown }
  ): Promise<Response> {
    const headers = await this.getAuthHeaders(connectionId);
    return fetch(`${INTACCT_API_BASE}${path}`, {
      method: options?.method ?? 'GET',
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // syncTrialBalance
  // ---------------------------------------------------------------------------

  async syncTrialBalance(
    conn: AccountingConnection,
    connectionId: string,
    asOfDate?: string,
  ): Promise<SyncTrialBalanceResult> {
    try {
      const date = asOfDate ?? new Date().toISOString().slice(0, 10);
      validateDate(date, 'asOfDate');

      const entries: TrialBalanceEntry[] = [];
      let start = 0;
      let totalCount = Infinity;

      while (start < totalCount) {
        const qs = new URLSearchParams({
          start: String(start),
          size: String(PAGE_SIZE),
          'filter': `PERIOD = '${date.slice(0, 7)}'`,
        });

        const response = await this.intacctFetch(
          connectionId,
          `/objects/glaccountbalance?${qs.toString()}`,
        );

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            entries: [],
            asOfDate: date,
            provider: PROVIDER,
            connectionId,
            errors: [`Sage Intacct API error ${response.status}: ${errorText}`],
          };
        }

        let data: IntacctListResponse<IntacctGLBalanceRow>;
        try {
          data = await response.json() as IntacctListResponse<IntacctGLBalanceRow>;
        } catch {
          return {
            success: false,
            entries: [],
            asOfDate: date,
            provider: PROVIDER,
            connectionId,
            errors: ['Invalid response from Intacct API'],
          };
        }

        totalCount = data['@totalcount'] ?? 0;
        const rows = data['ia::result'] ?? [];

        for (const row of rows) {
          entries.push({
            accountCode: row.ACCOUNTNO ?? '',
            accountName: row.TITLE ?? '',
            debit: parseFloat(row.DEBIT) || 0,
            credit: parseFloat(row.CREDIT) || 0,
          });
        }

        start += PAGE_SIZE;

        // Rate-limit: 5 req/sec max
        if (start < totalCount) {
          await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
        }
      }

      return {
        success: true,
        entries,
        asOfDate: date,
        provider: PROVIDER,
        connectionId,
        errors: [],
      };
    } catch (err) {
      return {
        success: false,
        entries: [],
        asOfDate: asOfDate ?? new Date().toISOString().slice(0, 10),
        provider: PROVIDER,
        connectionId,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  // ---------------------------------------------------------------------------
  // pushJournalEntry
  // ---------------------------------------------------------------------------

  async pushJournalEntry(
    conn: AccountingConnection,
    input: PushJournalEntryInput,
  ): Promise<PushJournalEntryResult> {
    try {
      const glEntries = input.lines.map((line) => {
        const isDebit = line.debit > 0;
        return {
          ACCOUNTNO: line.accountCode,
          TR_TYPE: isDebit ? '1' : '-1',
          AMOUNT: isDebit ? String(line.debit) : String(line.credit),
          DESCRIPTION: line.description ?? input.memo ?? '',
        };
      });

      const body = {
        JOURNAL: 'GJ',
        BATCH_DATE: input.date,
        BATCH_TITLE: input.memo ?? '',
        ENTRIES: {
          GLENTRY: glEntries,
        },
      };

      const response = await this.intacctFetch(
        input.connectionId,
        '/objects/glbatch',
        { method: 'POST', body },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          errors: [`Sage Intacct API error ${response.status}: ${errorText}`],
        };
      }

      let result: IntacctGLBatchResponse;
      try {
        result = await response.json() as IntacctGLBatchResponse;
      } catch {
        return {
          success: false,
          errors: ['Invalid response from Intacct API'],
        };
      }

      const recordNo = result['ia::result']?.RECORDNO ?? `intacct-je-${Date.now()}`;
      return {
        success: true,
        externalId: recordNo,
        externalRef: `INTACCT-JE-${recordNo}`,
        errors: [],
      };
    } catch (err) {
      return {
        success: false,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  // ---------------------------------------------------------------------------
  // pullTransactions
  // ---------------------------------------------------------------------------

  async pullTransactions(
    conn: AccountingConnection,
    input: PullTransactionsInput,
  ): Promise<PullTransactionsResult> {
    try {
      validateDate(input.startDate, 'startDate');
      validateDate(input.endDate, 'endDate');

      const transactions: PulledTransaction[] = [];
      let start = 0;
      let totalCount = Infinity;

      // Build filter
      let filter = `BATCH_DATE >= '${input.startDate}' and BATCH_DATE <= '${input.endDate}'`;
      if (input.accountCodes?.length) {
        for (const code of input.accountCodes) {
          validateAccountCode(code);
        }
        // Intacct supports IN filters; fall back to single equality if one code
        if (input.accountCodes.length === 1) {
          filter += ` and ACCOUNTNO = '${input.accountCodes[0]}'`;
        } else {
          const codes = input.accountCodes.map((c) => `'${c}'`).join(',');
          filter += ` and ACCOUNTNO in [${codes}]`;
        }
      }

      while (start < totalCount) {
        const qs = new URLSearchParams({
          start: String(start),
          size: String(PAGE_SIZE),
          filter,
        });

        const response = await this.intacctFetch(
          input.connectionId,
          `/objects/glentry?${qs.toString()}`,
        );

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            transactions: [],
            errors: [`Sage Intacct API error ${response.status}: ${errorText}`],
          };
        }

        let data: IntacctListResponse<IntacctGLEntryRow>;
        try {
          data = await response.json() as IntacctListResponse<IntacctGLEntryRow>;
        } catch {
          return {
            success: false,
            transactions: [],
            errors: ['Invalid response from Intacct API'],
          };
        }

        totalCount = data['@totalcount'] ?? 0;
        const rows = data['ia::result'] ?? [];

        for (const row of rows) {
          const amount = parseFloat(row.AMOUNT) || 0;
          const isDebit = row.TR_TYPE === '1';

          transactions.push({
            externalId: `INTACCT-${row.RECORDNO ?? ''}-${row.ACCOUNTNO ?? ''}`,
            date: (row.BATCH_DATE ?? input.startDate).slice(0, 10),
            description: row.DESCRIPTION ?? row.BATCH_TITLE ?? '',
            accountCode: row.ACCOUNTNO ?? '',
            accountName: row.ACCOUNT_TITLE ?? '',
            debit: isDebit ? amount : 0,
            credit: isDebit ? 0 : amount,
            reference: row.BATCH_NO ? `BATCH-${row.BATCH_NO}` : '',
          });
        }

        start += PAGE_SIZE;

        // Rate-limit: 5 req/sec max
        if (start < totalCount) {
          await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
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
