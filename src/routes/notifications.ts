/**
 * Notification API: in-app notifications, webhook config, preferences.
 * Mounted at /api/notifications and /api/settings/webhooks, /api/settings/notification-preferences.
 */

import { Router, type Request, type Response } from 'express';
import { send500 } from '../lib/errorHandler.js';
import type { AuthRequest } from '../auth/middleware.js';
import * as notificationService from '../services/notification_service.js';

const router = Router();

function getUserId(req: Request): string | null {
  return (req as AuthRequest).userId ?? null;
}

function getTenantId(req: Request): string | null {
  return (req as AuthRequest).tenantId ?? null;
}

// ────────────────────────────────────────────────────────
// Notification endpoints
// ────────────────────────────────────────────────────────

/** GET /api/notifications — list notifications for current user */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
    const notifications = await notificationService.listNotifications(userId, limit, offset);
    res.json({ notifications });
  } catch (e) {
    send500(res, e, 'List notifications failed');
  }
});

/** GET /api/notifications/unread-count — unread count */
router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const count = await notificationService.getUnreadCount(userId);
    res.json({ count });
  } catch (e) {
    send500(res, e, 'Unread count failed');
  }
});

/** PUT /api/notifications/read-all — mark all as read */
router.put('/read-all', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    await notificationService.markAllAsRead(userId);
    res.json({ ok: true });
  } catch (e) {
    send500(res, e, 'Mark all read failed');
  }
});

/** PUT /api/notifications/:id/read — mark one as read */
router.put('/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    await notificationService.markAsRead(userId, req.params.id ?? '');
    res.json({ ok: true });
  } catch (e) {
    send500(res, e, 'Mark read failed');
  }
});

export default router;

// ────────────────────────────────────────────────────────
// Settings sub-routes (webhook config + preferences)
// ────────────────────────────────────────────────────────

export const webhookRouter = Router();

/** GET /api/settings/webhooks — list webhook configs */
webhookRouter.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const webhooks = await notificationService.listWebhooks(tenantId);
    res.json({ webhooks });
  } catch (e) {
    send500(res, e, 'List webhooks failed');
  }
});

/** POST /api/settings/webhooks — create webhook config */
webhookRouter.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const body = req.body as { url?: string; secret?: string };
    if (!body?.url) { res.status(400).json({ error: 'url is required' }); return; }
    const webhook = await notificationService.createWebhook(tenantId, body.url, body.secret);
    res.status(201).json(webhook);
  } catch (e) {
    send500(res, e, 'Create webhook failed');
  }
});

/** DELETE /api/settings/webhooks/:id — delete webhook config */
webhookRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    await notificationService.deleteWebhook(tenantId, req.params.id ?? '');
    res.json({ deleted: true });
  } catch (e) {
    send500(res, e, 'Delete webhook failed');
  }
});

export const preferencesRouter = Router();

/** GET /api/settings/notification-preferences — get preferences for current user */
preferencesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const tenantId = getTenantId(req);
    if (!userId || !tenantId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const preferences = await notificationService.getPreferences(tenantId, userId);
    res.json({ preferences });
  } catch (e) {
    send500(res, e, 'Get preferences failed');
  }
});

/** PUT /api/settings/notification-preferences — update preferences */
preferencesRouter.put('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const tenantId = getTenantId(req);
    if (!userId || !tenantId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const body = req.body as { preferences?: notificationService.NotificationPreference[] };
    if (!Array.isArray(body?.preferences)) {
      res.status(400).json({ error: 'preferences array is required' });
      return;
    }
    await notificationService.upsertPreferences(tenantId, userId, body.preferences);
    res.json({ ok: true });
  } catch (e) {
    send500(res, e, 'Update preferences failed');
  }
});
