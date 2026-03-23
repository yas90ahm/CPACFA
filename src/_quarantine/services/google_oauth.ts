/**
 * Google OAuth token refresh helper.
 */

import { updateIntegrationTokens, getIntegration } from './integration_store.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '';

export async function refreshGoogleAccessToken(tenantId: string): Promise<string | null> {
  const record = getIntegration(tenantId, 'google');
  const refreshToken = record?.tokens.refreshToken;
  if (!refreshToken || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    updateIntegrationTokens(tenantId, {
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined,
    });
    return data.access_token;
  } catch {
    return null;
  }
}
