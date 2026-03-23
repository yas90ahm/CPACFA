/**
 * OAuth integrations (Google) — tenant-scoped.
 * Tenant ID comes exclusively from JWT; query.tenantId is ignored to prevent tenant IDOR.
 */

import { Router, type Request, type Response } from 'express';
import { setIntegration, getIntegration, listIntegrations } from '../services/integration_store.js';
import { getTenantId } from '../lib/tenant_context.js';
import { getTenantPool } from '../db/index.js';
import { send500 } from '../lib/errorHandler.js';
import { signState, verifyAndParseState } from '../services/oauth_service.js';
import type { AccountingProvider } from '../types/accounting_integration.js';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '';
const GOOGLE_SCOPES =
  process.env.GOOGLE_OAUTH_SCOPES ??
  [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
  ].join(' ');

router.get('/google/start', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  if (!tenantId) {
    res.status(403).json({ error: 'Tenant context required', message: 'Authenticate with a valid token to start OAuth.' });
    return;
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    res.status(400).json({ error: 'Google OAuth is not configured' });
    return;
  }
  const state = signState(JSON.stringify({ tenantId }));
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: GOOGLE_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    }).toString();
  res.json({ url });
});

router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state' });
      return;
    }
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      res.status(400).json({ error: 'Google OAuth is not configured' });
      return;
    }
    const decoded = verifyAndParseState(state) as { tenantId?: string } | null;
    if (!decoded || !decoded.tenantId) {
      res.status(403).json({ error: 'Invalid or tampered OAuth state' });
      return;
    }
    const tenantId = decoded.tenantId;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!tokenRes.ok) {
      res.status(400).json({ error: 'Token exchange failed', detail: await tokenRes.text() });
      return;
    }
    const tokenJson = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    setIntegration({
      tenantId,
      provider: 'google',
      tokens: {
        accessToken: tokenJson.access_token,
        refreshToken: tokenJson.refresh_token,
        expiresAt: tokenJson.expires_in ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString() : undefined,
      },
      connectedAt: new Date().toISOString(),
    });
    res.json({ ok: true, tenantId });
  } catch (err) {
    send500(res, err, 'OAuth callback failed');
  }
});

router.get('/list', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  if (!tenantId) {
    res.status(403).json({ error: 'Tenant context required', message: 'Authenticate with a valid token to list integrations.' });
    return;
  }
  res.json({ tenantId, integrations: listIntegrations(tenantId) });
});

// ── ERP OAuth routes (QuickBooks, Xero, NetSuite) ──

router.get('/oauth/start/:provider', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(403).json({ error: 'Tenant context required' }); return; }
    const provider = req.params.provider as AccountingProvider;
    if (!['quickbooks', 'xero', 'netsuite'].includes(provider)) {
      res.status(400).json({ error: `Unsupported provider: ${provider}` }); return;
    }
    const { getAuthorizationUrl } = await import('../services/oauth_service.js');
    const connectionId = req.query.connectionId as string ?? '';
    const result = getAuthorizationUrl(provider, tenantId, connectionId);
    res.json(result);
  } catch (err) {
    send500(res, err, 'OAuth start failed');
  }
});

router.get('/oauth/callback/:provider', async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as AccountingProvider;
    if (!['quickbooks', 'xero', 'netsuite'].includes(provider)) {
      res.status(400).json({ error: `Unsupported provider: ${provider}` }); return;
    }
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const realmId = req.query.realmId as string | undefined; // QuickBooks-specific
    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state parameter' }); return;
    }
    const { exchangeCodeForTokens, parseOAuthState } = await import('../services/oauth_service.js');
    const stateData = parseOAuthState(state);
    if (!stateData?.tenantId) {
      res.status(400).json({ error: 'Invalid OAuth state' }); return;
    }
    const pool = await getTenantPool(stateData.tenantId);
    await exchangeCodeForTokens(pool, provider, code, stateData.tenantId, stateData.connectionId, realmId);
    // Redirect to frontend integrations page on success
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3002';
    res.redirect(`${frontendUrl}/settings/integrations?connected=${provider}`);
  } catch (err) {
    send500(res, err, 'OAuth callback failed');
  }
});

router.post('/oauth/revoke/:provider', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(403).json({ error: 'Tenant context required' }); return; }
    const provider = req.params.provider as AccountingProvider;
    const connectionId = req.body?.connectionId as string;
    if (!connectionId) { res.status(400).json({ error: 'connectionId required' }); return; }
    const { revokeTokens } = await import('../services/oauth_service.js');
    const pool = await getTenantPool(tenantId);
    await revokeTokens(pool, tenantId, connectionId);
    res.json({ ok: true });
  } catch (err) {
    send500(res, err, 'OAuth revoke failed');
  }
});

router.get('/google/status', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  if (!tenantId) {
    res.status(403).json({ error: 'Tenant context required', message: 'Authenticate with a valid token to check integration status.' });
    return;
  }
  const record = getIntegration(tenantId, 'google');
  res.json({ connected: Boolean(record), tenantId });
});

export default router;
