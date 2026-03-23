/**
 * OAuth2 Service — handles authorization code grant flow for accounting integrations.
 *
 * Supports QuickBooks Online, Xero, and NetSuite OAuth2 flows.
 * Tokens are stored encrypted in tenant_oauth_tokens.
 * Refresh token rotation is handled automatically.
 */

import { randomUUID } from 'crypto';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import type { Pool } from 'pg';
import type { AccountingProvider } from '../types/accounting_integration.js';

// --- Encryption ---

const ENCRYPTION_KEY = process.env.OAUTH_ENCRYPTION_KEY ?? 'default-dev-key-change-in-production-32';
const ALGORITHM = 'aes-256-gcm';

function deriveKey(password: string): Buffer {
  return scryptSync(password, 'sovereign-cpa-salt', 32);
}

export function encrypt(text: string): string {
  const key = deriveKey(ENCRYPTION_KEY);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const key = deriveKey(ENCRYPTION_KEY);
  const parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted text format');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// --- Provider Configuration ---

interface OAuthProviderConfig {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  redirectUri: string;
}

function getProviderConfig(provider: AccountingProvider): OAuthProviderConfig {
  switch (provider) {
    case 'quickbooks':
      return {
        authorizationUrl: 'https://appcenter.intuit.com/connect/oauth2',
        tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        clientId: process.env.QB_CLIENT_ID ?? '',
        clientSecret: process.env.QB_CLIENT_SECRET ?? '',
        scopes: ['com.intuit.quickbooks.accounting'],
        redirectUri: process.env.QB_REDIRECT_URI ?? `${process.env.APP_URL ?? 'http://localhost:3000'}/api/integrations/oauth/callback/quickbooks`,
      };
    case 'xero':
      return {
        authorizationUrl: 'https://login.xero.com/identity/connect/authorize',
        tokenUrl: 'https://identity.xero.com/connect/token',
        clientId: process.env.XERO_CLIENT_ID ?? '',
        clientSecret: process.env.XERO_CLIENT_SECRET ?? '',
        scopes: ['openid', 'profile', 'email', 'accounting.transactions', 'accounting.reports.read', 'accounting.settings'],
        redirectUri: process.env.XERO_REDIRECT_URI ?? `${process.env.APP_URL ?? 'http://localhost:3000'}/api/integrations/oauth/callback/xero`,
      };
    case 'netsuite':
      return {
        authorizationUrl: process.env.NS_AUTH_URL ?? 'https://system.netsuite.com/app/login/oauth2/authorize.nl',
        tokenUrl: process.env.NS_TOKEN_URL ?? 'https://system.netsuite.com/app/login/oauth2/token.nl',
        clientId: process.env.NS_CLIENT_ID ?? '',
        clientSecret: process.env.NS_CLIENT_SECRET ?? '',
        scopes: ['restlets', 'rest_webservices'],
        redirectUri: process.env.NS_REDIRECT_URI ?? `${process.env.APP_URL ?? 'http://localhost:3000'}/api/integrations/oauth/callback/netsuite`,
      };
  }
}

// --- OAuth Flow ---

export interface OAuthState {
  tenantId: string;
  connectionId: string;
  provider: AccountingProvider;
  nonce: string;
}

/** Parse a base64url-encoded OAuth state string back into its structured form. */
export function parseOAuthState(stateStr: string): OAuthState | null {
  try {
    return JSON.parse(Buffer.from(stateStr, 'base64url').toString('utf8')) as OAuthState;
  } catch {
    return null;
  }
}

/**
 * Generate the authorization URL for the user to visit.
 * Returns the URL and state parameter for CSRF protection.
 */
export function getAuthorizationUrl(
  provider: AccountingProvider,
  tenantId: string,
  connectionId: string
): { url: string; state: string } {
  const config = getProviderConfig(provider);
  const state: OAuthState = {
    tenantId,
    connectionId,
    provider,
    nonce: randomUUID(),
  };
  const stateStr = Buffer.from(JSON.stringify(state)).toString('base64url');

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state: stateStr,
  });

  return {
    url: `${config.authorizationUrl}?${params.toString()}`,
    state: stateStr,
  };
}

/**
 * Exchange authorization code for tokens.
 * Stores encrypted tokens in database.
 */
export async function exchangeCodeForTokens(
  pool: Pool,
  provider: AccountingProvider,
  code: string,
  tenantId: string,
  connectionId: string,
  realmId?: string
): Promise<{ success: boolean; error?: string }> {
  const config = getProviderConfig(provider);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
  });

  const authHeader = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  try {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${authHeader}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, error: `Token exchange failed: ${response.status} ${errorBody}` };
    }

    const tokenData = await response.json() as {
      access_token: string;
      refresh_token?: string;
      token_type?: string;
      expires_in?: number;
      x_refresh_token_expires_in?: number;
      scope?: string;
    };

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;
    const refreshExpiresAt = tokenData.x_refresh_token_expires_in
      ? new Date(Date.now() + tokenData.x_refresh_token_expires_in * 1000).toISOString()
      : null;

    await pool.query(
      `INSERT INTO tenant_oauth_tokens (
         id, tenant_id, connection_id, provider,
         access_token_encrypted, refresh_token_encrypted,
         token_type, expires_at, refresh_expires_at, scope,
         realm_id, last_refreshed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10, $11, NOW())
       ON CONFLICT (tenant_id, connection_id) DO UPDATE SET
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
         token_type = EXCLUDED.token_type,
         expires_at = EXCLUDED.expires_at,
         refresh_expires_at = EXCLUDED.refresh_expires_at,
         scope = EXCLUDED.scope,
         realm_id = EXCLUDED.realm_id,
         last_refreshed_at = NOW(),
         updated_at = NOW()`,
      [
        randomUUID(),
        tenantId,
        connectionId,
        provider,
        encrypt(tokenData.access_token),
        tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        tokenData.token_type ?? 'bearer',
        expiresAt,
        refreshExpiresAt,
        tokenData.scope ?? null,
        realmId ?? null,
      ]
    );

    // Update connection status
    await pool.query(
      `UPDATE accounting_connections SET last_sync_status = 'success', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [connectionId, tenantId]
    );

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get a valid access token, refreshing if necessary.
 * Returns null if no token exists or refresh fails.
 */
export async function getValidAccessToken(
  pool: Pool,
  tenantId: string,
  connectionId: string
): Promise<{ accessToken: string; realmId: string | null } | null> {
  const r = await pool.query<{
    access_token_encrypted: string | null;
    refresh_token_encrypted: string | null;
    expires_at: string | Date | null;
    provider: string;
    realm_id: string | null;
    connection_id: string;
  }>(
    `SELECT access_token_encrypted, refresh_token_encrypted, expires_at, provider, realm_id, connection_id
     FROM tenant_oauth_tokens
     WHERE tenant_id = $1 AND connection_id = $2 AND revoked_at IS NULL`,
    [tenantId, connectionId]
  );

  if (r.rows.length === 0 || !r.rows[0].access_token_encrypted) return null;
  const row = r.rows[0] as typeof r.rows[0] & { access_token_encrypted: string };

  // Check if token is expired
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : Infinity;
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer

  if (now + bufferMs < expiresAt) {
    // Token is still valid
    return {
      accessToken: decrypt(row.access_token_encrypted),
      realmId: row.realm_id ?? '',
    };
  }

  // Token expired — attempt refresh
  if (!row.refresh_token_encrypted) return null;

  const provider = row.provider as AccountingProvider;
  const config = getProviderConfig(provider);
  const refreshToken = decrypt(row.refresh_token_encrypted);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const authHeader = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  try {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${authHeader}`,
      },
      body: body.toString(),
    });

    if (!response.ok) return null;

    const tokenData = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const newExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    await pool.query(
      `UPDATE tenant_oauth_tokens SET
         access_token_encrypted = $3,
         refresh_token_encrypted = COALESCE($4, refresh_token_encrypted),
         expires_at = $5::timestamptz,
         last_refreshed_at = NOW(),
         updated_at = NOW()
       WHERE tenant_id = $1 AND connection_id = $2`,
      [
        tenantId,
        connectionId,
        encrypt(tokenData.access_token),
        tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        newExpiresAt,
      ]
    );

    return {
      accessToken: tokenData.access_token,
      realmId: row.realm_id,
    };
  } catch {
    return null;
  }
}

/**
 * Revoke stored tokens for a connection.
 */
export async function revokeTokens(
  pool: Pool,
  tenantId: string,
  connectionId: string
): Promise<void> {
  await pool.query(
    `UPDATE tenant_oauth_tokens SET revoked_at = NOW(), updated_at = NOW()
     WHERE tenant_id = $1 AND connection_id = $2`,
    [tenantId, connectionId]
  );
}
