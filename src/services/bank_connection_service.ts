/**
 * Bank Connection Service — Abstraction layer for bank balance APIs.
 *
 * Defines the interface for fetching ending balances from bank accounts.
 * First adapter: Plaid. Future: MX, Yodlee, direct bank APIs.
 *
 * When a bank connection exists for an account, reconciliation auto-pulls
 * the balance instead of requiring manual entry or PDF upload.
 *
 * Configuration stored per tenant in bank_connections table.
 */

import type { Pool } from 'pg';

// ── Interface ──

export interface BankBalance {
  balance: string; // Decimal-safe string
  currency: string;
  institution: string;
  accountName: string;
  accountLast4: string;
  asOfDate: string; // ISO date
  lastUpdated: string; // ISO timestamp
  source: 'plaid' | 'mx' | 'yodlee' | 'manual';
}

export interface BankConnectionConfig {
  id: string;
  tenantId: string;
  provider: 'plaid' | 'mx' | 'yodlee';
  /** Provider-specific access token (encrypted at rest) */
  accessToken: string;
  institutionName: string;
  /** Map of GL account code → provider account ID */
  accountMappings: Array<{
    glAccountCode: string;
    providerAccountId: string;
    accountName: string;
    accountLast4: string;
  }>;
  active: boolean;
  createdAt: string;
  lastSyncAt: string | null;
}

export interface BankConnectionAdapter {
  /** Fetch the ending balance for a specific account as of a date */
  fetchBalance(
    accessToken: string,
    providerAccountId: string,
    asOfDate: string
  ): Promise<BankBalance | null>;

  /** List all accounts available on a connection */
  listAccounts(
    accessToken: string
  ): Promise<Array<{ id: string; name: string; last4: string; type: string; balance: string }>>;

  /** Test connection health */
  healthCheck(accessToken: string): Promise<boolean>;
}

// ── Registry ──

const adapters = new Map<string, BankConnectionAdapter>();

export function registerAdapter(provider: string, adapter: BankConnectionAdapter): void {
  adapters.set(provider, adapter);
}

export function getAdapter(provider: string): BankConnectionAdapter | null {
  return adapters.get(provider) ?? null;
}

// ── Service Functions ──

/**
 * Get bank balance for a GL account if a connection exists.
 * Returns null if no connection or provider unavailable.
 */
export async function fetchBankBalance(
  pool: Pool,
  tenantId: string,
  glAccountCode: string,
  asOfDate: string
): Promise<BankBalance | null> {
  // Look up connection for this account
  let connection: BankConnectionConfig | null = null;
  let providerAccountId: string | null = null;

  try {
    const res = await pool.query<{
      id: string; provider: string; access_token: string;
      institution_name: string; account_mappings: unknown; active: boolean;
    }>(
      `SELECT id, provider, access_token, institution_name, account_mappings, active
       FROM bank_connections
       WHERE tenant_id = $1 AND active = true`,
      [tenantId]
    );

    for (const row of res.rows) {
      const mappings = (Array.isArray(row.account_mappings) ? row.account_mappings : []) as BankConnectionConfig['accountMappings'];
      const mapping = mappings.find((m) => m.glAccountCode === glAccountCode);
      if (mapping) {
        connection = {
          id: row.id,
          tenantId,
          provider: row.provider as BankConnectionConfig['provider'],
          accessToken: row.access_token,
          institutionName: row.institution_name,
          accountMappings: mappings,
          active: row.active,
          createdAt: '',
          lastSyncAt: null,
        };
        providerAccountId = mapping.providerAccountId;
        break;
      }
    }
  } catch {
    // bank_connections table may not exist yet
    return null;
  }

  if (!connection || !providerAccountId) return null;

  const adapter = getAdapter(connection.provider);
  if (!adapter) return null;

  try {
    return await adapter.fetchBalance(connection.accessToken, providerAccountId, asOfDate);
  } catch {
    return null;
  }
}

/**
 * List all bank connections for a tenant.
 */
export async function listConnections(
  pool: Pool,
  tenantId: string
): Promise<BankConnectionConfig[]> {
  try {
    const res = await pool.query<{
      id: string; provider: string; access_token: string;
      institution_name: string; account_mappings: unknown;
      active: boolean; created_at: string; last_sync_at: string | null;
    }>(
      `SELECT id, provider, access_token, institution_name, account_mappings,
              active, created_at, last_sync_at
       FROM bank_connections
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      tenantId,
      provider: row.provider as BankConnectionConfig['provider'],
      accessToken: '***', // Never return access token in list
      institutionName: row.institution_name,
      accountMappings: (Array.isArray(row.account_mappings) ? row.account_mappings : []) as BankConnectionConfig['accountMappings'],
      active: row.active,
      createdAt: row.created_at,
      lastSyncAt: row.last_sync_at,
    }));
  } catch {
    return []; // Table may not exist
  }
}

// ── Plaid Adapter (Stub — requires PLAID_CLIENT_ID + PLAID_SECRET env vars) ──

export const PlaidAdapter: BankConnectionAdapter = {
  async fetchBalance(accessToken, providerAccountId, asOfDate): Promise<BankBalance | null> {
    const clientId = process.env.PLAID_CLIENT_ID;
    const secret = process.env.PLAID_SECRET;
    const env = process.env.PLAID_ENV ?? 'sandbox';

    if (!clientId || !secret) return null;

    const baseUrl = env === 'production'
      ? 'https://production.plaid.com'
      : env === 'development'
        ? 'https://development.plaid.com'
        : 'https://sandbox.plaid.com';

    try {
      const response = await fetch(`${baseUrl}/accounts/balance/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          secret,
          access_token: accessToken,
          options: { account_ids: [providerAccountId] },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      const data = await response.json() as {
        accounts: Array<{
          account_id: string;
          balances: { current: number; available: number; iso_currency_code: string };
          name: string;
          mask: string;
          official_name: string;
        }>;
      };

      const account = data.accounts?.find((a) => a.account_id === providerAccountId);
      if (!account) return null;

      return {
        balance: account.balances.current.toFixed(2),
        currency: account.balances.iso_currency_code ?? 'USD',
        institution: 'Plaid',
        accountName: account.official_name ?? account.name,
        accountLast4: account.mask ?? '',
        asOfDate,
        lastUpdated: new Date().toISOString(),
        source: 'plaid',
      };
    } catch {
      return null;
    }
  },

  async listAccounts(accessToken) {
    const clientId = process.env.PLAID_CLIENT_ID;
    const secret = process.env.PLAID_SECRET;
    const env = process.env.PLAID_ENV ?? 'sandbox';
    if (!clientId || !secret) return [];

    const baseUrl = env === 'production'
      ? 'https://production.plaid.com'
      : env === 'development'
        ? 'https://development.plaid.com'
        : 'https://sandbox.plaid.com';

    try {
      const response = await fetch(`${baseUrl}/accounts/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, access_token: accessToken }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return [];

      const data = await response.json() as {
        accounts: Array<{
          account_id: string; name: string; mask: string;
          type: string; balances: { current: number };
        }>;
      };

      return (data.accounts ?? []).map((a) => ({
        id: a.account_id,
        name: a.name,
        last4: a.mask ?? '',
        type: a.type,
        balance: (a.balances?.current ?? 0).toFixed(2),
      }));
    } catch {
      return [];
    }
  },

  async healthCheck(accessToken) {
    const clientId = process.env.PLAID_CLIENT_ID;
    const secret = process.env.PLAID_SECRET;
    if (!clientId || !secret) return false;
    // Simple check: can we list accounts?
    const accounts = await this.listAccounts(accessToken);
    return accounts.length > 0;
  },
};

// Register Plaid adapter if configured
if (process.env.PLAID_CLIENT_ID) {
  registerAdapter('plaid', PlaidAdapter);
}
