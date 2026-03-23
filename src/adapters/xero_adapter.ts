/**
 * Xero Adapter — real API implementation.
 * Uses Xero Accounting API v2.0 (REST + JSON, OAuth2).
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

const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';

function validateDate(date: string, fieldName: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid ${fieldName}: must be YYYY-MM-DD format, got "${date}"`);
  }
}

export class XeroAdapter implements IAccountingAdapter {
  constructor(private pool: Pool, private tenantId: string) {}

  private async getToken(connectionId: string): Promise<{ accessToken: string; xeroTenantId: string }> {
    const tokenData = await getValidAccessToken(this.pool, this.tenantId, connectionId);
    if (!tokenData?.accessToken) throw new Error('No valid Xero access token. Please reconnect.');

    // Xero uses tenant_external_id instead of realmId
    const r = await this.pool.query<{ tenant_external_id: string | null }>(
      `SELECT tenant_external_id FROM tenant_oauth_tokens WHERE tenant_id = $1 AND connection_id = $2`,
      [this.tenantId, connectionId]
    );
    const xeroTenantId = r.rows[0]?.tenant_external_id;
    if (!xeroTenantId) throw new Error('No Xero tenant ID found. Please reconnect.');
    return { accessToken: tokenData.accessToken, xeroTenantId };
  }

  private async xeroFetch(
    accessToken: string,
    xeroTenantId: string,
    path: string,
    options?: { method?: string; body?: unknown }
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Xero-Tenant-Id': xeroTenantId,
    };
    if (options?.body) headers['Content-Type'] = 'application/json';
    return fetch(`${XERO_API_BASE}${path}`, {
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
      const { accessToken, xeroTenantId } = await this.getToken(connectionId);
      const date = asOfDate ?? new Date().toISOString().slice(0, 10);
      validateDate(date, 'asOfDate');

      const response = await this.xeroFetch(accessToken, xeroTenantId, `/Reports/TrialBalance?date=${date}`);
      if (!response.ok) {
        return { success: false, entries: [], asOfDate: date, provider: 'xero', connectionId, errors: [`Xero API error ${response.status}`] };
      }

      const data = await response.json() as {
        Reports: Array<{
          Rows: Array<{
            RowType: string;
            Rows?: Array<{ Cells: Array<{ Value: string; Attributes?: Array<{ Value: string }> }> }>;
          }>;
        }>;
      };

      const entries: TrialBalanceEntry[] = [];
      const report = data.Reports?.[0];
      if (report?.Rows) {
        for (const section of report.Rows) {
          if (section.RowType === 'Section' && section.Rows) {
            for (const row of section.Rows) {
              const cells = row.Cells;
              if (!cells || cells.length < 3) continue;
              const accountName = cells[0]?.Value ?? '';
              const accountCode = cells[0]?.Attributes?.[0]?.Value ?? accountName;
              const debit = Number(cells[1]?.Value?.replace(/[,$]/g, '')) || 0;
              const credit = Number(cells[2]?.Value?.replace(/[,$]/g, '')) || 0;
              if (accountName && (debit !== 0 || credit !== 0)) {
                entries.push({ accountCode, accountName, debit, credit });
              }
            }
          }
        }
      }

      return { success: true, entries, asOfDate: date, provider: 'xero', connectionId, errors: [] };
    } catch (err) {
      return { success: false, entries: [], asOfDate: asOfDate ?? '', provider: 'xero', connectionId, errors: [err instanceof Error ? err.message : String(err)] };
    }
  }

  async pushJournalEntry(conn: AccountingConnection, input: PushJournalEntryInput): Promise<PushJournalEntryResult> {
    try {
      const { accessToken, xeroTenantId } = await this.getToken(input.connectionId);

      const journalLines = input.lines.map((line) => ({
        AccountCode: line.accountCode,
        Description: line.description ?? input.memo ?? '',
        LineAmount: line.debit > 0 ? line.debit : -line.credit,
      }));

      const body = {
        ManualJournals: [{
          Narration: input.memo ?? '',
          Date: input.date,
          JournalLines: journalLines,
        }],
      };

      const response = await this.xeroFetch(accessToken, xeroTenantId, '/ManualJournals', { method: 'POST', body });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, errors: [`Xero API error ${response.status}: ${errText}`] };
      }

      const result = await response.json() as {
        ManualJournals: Array<{ ManualJournalID: string }>;
      };
      const jeId = result.ManualJournals?.[0]?.ManualJournalID;
      return { success: true, externalId: jeId, externalRef: `XERO-MJ-${jeId}`, errors: [] };
    } catch (err) {
      return { success: false, errors: [err instanceof Error ? err.message : String(err)] };
    }
  }

  async pullTransactions(conn: AccountingConnection, input: PullTransactionsInput): Promise<PullTransactionsResult> {
    try {
      const { accessToken, xeroTenantId } = await this.getToken(input.connectionId);

      validateDate(input.startDate, 'startDate');
      validateDate(input.endDate, 'endDate');

      const where = `Date >= DateTime(${input.startDate.replace(/-/g, ',')}) AND Date <= DateTime(${input.endDate.replace(/-/g, ',')})`;
      const response = await this.xeroFetch(accessToken, xeroTenantId, `/ManualJournals?where=${encodeURIComponent(where)}`);

      if (!response.ok) {
        return { success: false, transactions: [], errors: [`Xero API error ${response.status}`] };
      }

      const data = await response.json() as {
        ManualJournals: Array<{
          ManualJournalID: string;
          Date: string;
          Narration: string;
          JournalLines: Array<{ AccountCode: string; AccountName: string; LineAmount: number; Description: string }>;
        }>;
      };

      const transactions: PulledTransaction[] = [];
      for (const mj of data.ManualJournals ?? []) {
        for (const line of mj.JournalLines ?? []) {
          if (input.accountCodes?.length && !input.accountCodes.includes(line.AccountCode)) continue;
          const amount = line.LineAmount;
          transactions.push({
            externalId: `XERO-MJ-${mj.ManualJournalID}-${line.AccountCode}`,
            date: mj.Date?.slice(0, 10) ?? input.startDate,
            description: line.Description || mj.Narration,
            accountCode: line.AccountCode,
            accountName: line.AccountName ?? '',
            debit: amount > 0 ? amount : 0,
            credit: amount < 0 ? Math.abs(amount) : 0,
            reference: `MJ-${mj.ManualJournalID}`,
          });
        }
      }

      return { success: true, transactions, errors: [] };
    } catch (err) {
      return { success: false, transactions: [], errors: [err instanceof Error ? err.message : String(err)] };
    }
  }
}
