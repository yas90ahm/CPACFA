/**
 * OAuth Service — unit tests.
 * Validates encryption, token exchange, auto-refresh, and authorization URL generation.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import {
  encrypt,
  decrypt,
  getAuthorizationUrl,
  parseOAuthState,
} from '../../src/services/oauth_service.js';
import { installMockFetch } from './helpers/mock_fetch.js';
import { createMockPool } from './helpers/mock_pool.js';

import oauthTokenFixture from './fixtures/oauth_token_response.json';

describe('OAuth Service', () => {
  let mockFetch: ReturnType<typeof installMockFetch>;

  afterEach(() => {
    mockFetch?.restore();
  });

  describe('encrypt / decrypt', () => {
    it('round-trips a token string', () => {
      const original = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test-payload';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('produces different ciphertext for same plaintext (random IV)', () => {
      const token = 'same-token-value';
      const e1 = encrypt(token);
      const e2 = encrypt(token);
      expect(e1).not.toBe(e2);
      // But both decrypt to the same value
      expect(decrypt(e1)).toBe(token);
      expect(decrypt(e2)).toBe(token);
    });

    it('encrypted format is salt:iv:authTag:ciphertext', () => {
      const encrypted = encrypt('test');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(4);
      // Salt and IV are each 16 bytes = 32 hex chars
      expect(parts[0]).toHaveLength(32);
      expect(parts[1]).toHaveLength(32);
      // Auth tag is 16 bytes = 32 hex chars
      expect(parts[2]).toHaveLength(32);
      // Ciphertext should be non-empty
      expect(parts[3].length).toBeGreaterThan(0);
    });

    it('throws on tampered ciphertext', () => {
      const encrypted = encrypt('secret-token');
      // Flip a character in the ciphertext
      const parts = encrypted.split(':');
      const lastChar = parts[3].slice(-1);
      parts[3] = parts[3].slice(0, -1) + (lastChar === 'a' ? 'b' : 'a');
      const tampered = parts.join(':');

      expect(() => decrypt(tampered)).toThrow();
    });

    it('throws on invalid format', () => {
      expect(() => decrypt('not-a-valid-encrypted-string')).toThrow('Invalid encrypted text format');
    });
  });

  describe('getAuthorizationUrl', () => {
    it('generates correct Xero authorization URL', () => {
      const { url, state } = getAuthorizationUrl('xero', 'tenant-1', 'conn-1');

      expect(url).toContain('https://login.xero.com/identity/connect/authorize');
      expect(url).toContain('response_type=code');
      expect(url).toContain('accounting.transactions');
      expect(url).toContain('accounting.reports.read');

      const decoded = parseOAuthState(state);
      expect(decoded).not.toBeNull();
      expect(decoded!.tenantId).toBe('tenant-1');
      expect(decoded!.connectionId).toBe('conn-1');
      expect(decoded!.provider).toBe('xero');
      expect(decoded!.nonce).toBeDefined();
    });

    it('generates correct NetSuite authorization URL', () => {
      const { url, state } = getAuthorizationUrl('netsuite', 'tenant-2', 'conn-2');

      expect(url).toContain('https://system.netsuite.com/app/login/oauth2/authorize.nl');
      expect(url).toContain('response_type=code');
      expect(url).toContain('restlets');
      expect(url).toContain('rest_webservices');

      const decoded = parseOAuthState(state);
      expect(decoded).not.toBeNull();
      expect(decoded!.provider).toBe('netsuite');
    });

    it('generates correct QuickBooks authorization URL', () => {
      const { url } = getAuthorizationUrl('quickbooks', 'tenant-3', 'conn-3');

      expect(url).toContain('https://appcenter.intuit.com/connect/oauth2');
      expect(url).toContain('com.intuit.quickbooks.accounting');
    });

    it('includes unique nonce in each call', () => {
      const { state: s1 } = getAuthorizationUrl('xero', 'tenant-1', 'conn-1');
      const { state: s2 } = getAuthorizationUrl('xero', 'tenant-1', 'conn-1');

      const d1 = parseOAuthState(s1);
      const d2 = parseOAuthState(s2);
      expect(d1).not.toBeNull();
      expect(d2).not.toBeNull();
      expect(d1!.nonce).not.toBe(d2!.nonce);
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('sends correct POST to token endpoint with Basic auth', async () => {
      const { exchangeCodeForTokens } = await import('../../src/services/oauth_service.js');
      const mp = createMockPool();

      mockFetch = installMockFetch([
        { match: 'identity.xero.com/connect/token', method: 'POST', body: oauthTokenFixture },
      ]);

      // Mock the DB insert to succeed
      mp.onQuery('INSERT INTO tenant_oauth_tokens', { rows: [], rowCount: 1 });
      mp.onQuery('UPDATE accounting_connections', { rows: [], rowCount: 1 });

      const result = await exchangeCodeForTokens(mp.pool, 'xero', 'auth-code-abc', 'tenant-1', 'conn-1');

      expect(result.success).toBe(true);

      // Verify token endpoint was called
      const reqs = mockFetch.requestsTo('identity.xero.com');
      expect(reqs).toHaveLength(1);
      expect(reqs[0].method).toBe('POST');
      expect(reqs[0].headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(reqs[0].headers['Authorization']).toMatch(/^Basic /);

      // Verify body includes grant_type and code
      const body = reqs[0].body as string;
      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('code=auth-code-abc');
    });

    it('stores encrypted tokens in database', async () => {
      const { exchangeCodeForTokens } = await import('../../src/services/oauth_service.js');
      const mp = createMockPool();

      mockFetch = installMockFetch([
        { match: 'identity.xero.com/connect/token', method: 'POST', body: oauthTokenFixture },
      ]);

      mp.onQuery('INSERT INTO tenant_oauth_tokens', { rows: [], rowCount: 1 });
      mp.onQuery('UPDATE accounting_connections', { rows: [], rowCount: 1 });

      await exchangeCodeForTokens(mp.pool, 'xero', 'code-123', 'tenant-1', 'conn-1');

      // Verify INSERT was called with encrypted values
      const inserts = mp.queriesMatching('INSERT INTO tenant_oauth_tokens');
      expect(inserts).toHaveLength(1);
      const values = inserts[0].values!;

      // values[4] = encrypted access token, values[5] = encrypted refresh token
      const encryptedAccess = values[4] as string;
      const encryptedRefresh = values[5] as string;

      // Should be encrypted (salt:iv:authTag:ciphertext format)
      expect(encryptedAccess.split(':')).toHaveLength(4);
      expect(encryptedRefresh.split(':')).toHaveLength(4);

      // Should decrypt to the fixture token values
      expect(decrypt(encryptedAccess)).toBe(oauthTokenFixture.access_token);
      expect(decrypt(encryptedRefresh)).toBe(oauthTokenFixture.refresh_token);
    });
  });

  describe('getValidAccessToken', () => {
    it('returns cached token when not expired', async () => {
      const { getValidAccessToken } = await import('../../src/services/oauth_service.js');
      const mp = createMockPool();

      const encryptedToken = encrypt('valid-access-token');
      mp.onQuery('tenant_oauth_tokens', {
        rows: [{
          access_token_encrypted: encryptedToken,
          refresh_token_encrypted: null,
          expires_at: new Date(Date.now() + 3600_000).toISOString(), // 1 hour from now
          provider: 'xero',
          realm_id: 'realm-123',
          connection_id: 'conn-1',
        }],
      });

      // No fetch mock needed — should not make any HTTP calls
      mockFetch = installMockFetch([]);

      const result = await getValidAccessToken(mp.pool, 'tenant-1', 'conn-1');

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe('valid-access-token');
      expect(result!.realmId).toBe('realm-123');

      // Verify NO token refresh HTTP call was made
      expect(mockFetch.captured).toHaveLength(0);
    });

    it('auto-refreshes expired token', async () => {
      const { getValidAccessToken } = await import('../../src/services/oauth_service.js');
      const mp = createMockPool();

      const encryptedAccess = encrypt('expired-access-token');
      const encryptedRefresh = encrypt('valid-refresh-token');

      mp.onQuery('tenant_oauth_tokens', {
        rows: [{
          access_token_encrypted: encryptedAccess,
          refresh_token_encrypted: encryptedRefresh,
          expires_at: new Date(Date.now() - 60_000).toISOString(), // expired 1 min ago
          provider: 'xero',
          realm_id: 'realm-123',
          connection_id: 'conn-1',
        }],
      });
      mp.onQuery('UPDATE tenant_oauth_tokens', { rows: [], rowCount: 1 });

      mockFetch = installMockFetch([
        {
          match: 'identity.xero.com/connect/token',
          method: 'POST',
          body: {
            access_token: 'new-fresh-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          },
        },
      ]);

      const result = await getValidAccessToken(mp.pool, 'tenant-1', 'conn-1');

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe('new-fresh-access-token');

      // Verify refresh HTTP call was made
      const reqs = mockFetch.requestsTo('identity.xero.com');
      expect(reqs).toHaveLength(1);
      const body = reqs[0].body as string;
      expect(body).toContain('grant_type=refresh_token');
      expect(body).toContain('refresh_token=valid-refresh-token');

      // Verify DB was updated with new encrypted token
      const updates = mp.queriesMatching('UPDATE tenant_oauth_tokens');
      expect(updates).toHaveLength(1);
    });

    it('returns null when no token exists', async () => {
      const { getValidAccessToken } = await import('../../src/services/oauth_service.js');
      const mp = createMockPool();

      mp.onQuery('tenant_oauth_tokens', { rows: [] });

      const result = await getValidAccessToken(mp.pool, 'tenant-1', 'conn-nonexistent');

      expect(result).toBeNull();
    });

    it('returns null when token expired and no refresh token', async () => {
      const { getValidAccessToken } = await import('../../src/services/oauth_service.js');
      const mp = createMockPool();

      mp.onQuery('tenant_oauth_tokens', {
        rows: [{
          access_token_encrypted: encrypt('old-token'),
          refresh_token_encrypted: null, // no refresh token
          expires_at: new Date(Date.now() - 60_000).toISOString(),
          provider: 'xero',
          realm_id: null,
          connection_id: 'conn-1',
        }],
      });

      const result = await getValidAccessToken(mp.pool, 'tenant-1', 'conn-1');

      expect(result).toBeNull();
    });
  });
});
