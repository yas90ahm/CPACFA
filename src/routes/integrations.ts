/**
 * OAuth integrations (Google) — tenant-scoped.
 */

import { Router, type Request, type Response } from 'express';
import { setIntegration, getIntegration, listIntegrations } from '../services/integration_store.js';

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
  const tenantId = (req.query.tenantId as string) ?? 'default-tenant';
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    res.status(400).json({ error: 'Google OAuth is not configured' });
    return;
  }
  const state = Buffer.from(JSON.stringify({ tenantId })).toString('base64url');
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
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as { tenantId?: string };
    const tenantId = decoded.tenantId ?? 'default-tenant';

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
    const message = err instanceof Error ? err.message : 'OAuth callback failed';
    res.status(500).json({ error: message });
  }
});

router.get('/list', (req: Request, res: Response) => {
  const tenantId = (req.query.tenantId as string) ?? 'default-tenant';
  res.json({ tenantId, integrations: listIntegrations(tenantId) });
});

router.get('/google/status', (req: Request, res: Response) => {
  const tenantId = (req.query.tenantId as string) ?? 'default-tenant';
  const record = getIntegration(tenantId, 'google');
  res.json({ connected: Boolean(record), tenantId });
});

export default router;
