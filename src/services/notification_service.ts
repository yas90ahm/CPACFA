/**
 * Notification Service
 *
 * Delivers in-app notifications, webhook POSTs, and (future) email
 * for portfolio-level events: company_certified, company_overdue, blocking_issue_created.
 */

import type { Pool } from 'pg';
import { getControlPool } from '../db/index.js';
import { createHmac } from 'crypto';

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

export type NotificationEventType =
  | 'company_certified'
  | 'company_overdue'
  | 'blocking_issue_created';

export interface NotificationPayload {
  tenantId: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  eventType: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export interface WebhookConfig {
  id: string;
  tenantId: string;
  url: string;
  secret: string | null;
  active: boolean;
  createdAt: string;
}

// ────────────────────────────────────────────────────────
// Recipients
// ────────────────────────────────────────────────────────

/**
 * Find all operating_partner and admin users who have portfolio access to this tenant.
 */
async function getPortfolioRecipients(tenantId: string): Promise<{ userId: string }[]> {
  const control = getControlPool();
  const r = await control.query<{ user_id: string }>(
    `SELECT DISTINCT pa.user_id
     FROM portfolio_access pa
     JOIN users u ON u.id = pa.user_id AND u.status = 'active'
     WHERE pa.tenant_id = $1
       AND u.role IN ('operating_partner', 'admin')`,
    [tenantId]
  );
  return r.rows.map((row) => ({ userId: row.user_id }));
}

/**
 * Find the preparer for a close session (most recently active preparer/accountant).
 */
async function getSessionPreparer(tenantId: string): Promise<{ userId: string } | null> {
  const control = getControlPool();
  const r = await control.query<{ id: string }>(
    `SELECT id FROM users
     WHERE tenant_id = $1 AND status = 'active'
       AND role IN ('preparer', 'accountant')
     ORDER BY last_active_at DESC NULLS LAST
     LIMIT 1`,
    [tenantId]
  );
  return r.rows[0] ? { userId: r.rows[0].id } : null;
}

// ────────────────────────────────────────────────────────
// In-app storage
// ────────────────────────────────────────────────────────

async function storeNotification(
  userId: string,
  payload: NotificationPayload
): Promise<void> {
  const control = getControlPool();
  await control.query(
    `INSERT INTO notifications (id, tenant_id, user_id, event_type, title, body, data, read, created_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, false, NOW())`,
    [payload.tenantId, userId, payload.eventType, payload.title, payload.body, JSON.stringify(payload.data ?? null)]
  );
}

// ────────────────────────────────────────────────────────
// Webhook delivery
// ────────────────────────────────────────────────────────

async function getWebhooksForTenant(tenantId: string): Promise<WebhookConfig[]> {
  const control = getControlPool();
  const r = await control.query<{
    id: string; tenant_id: string; url: string; secret: string | null; active: boolean; created_at: string;
  }>(
    `SELECT id, tenant_id, url, secret, active, created_at::text FROM webhook_configs WHERE tenant_id = $1 AND active = true`,
    [tenantId]
  );
  return r.rows.map((row) => ({
    id: row.id, tenantId: row.tenant_id, url: row.url,
    secret: row.secret, active: row.active, createdAt: row.created_at,
  }));
}

async function deliverWebhook(
  webhook: WebhookConfig,
  payload: NotificationPayload
): Promise<void> {
  const body = JSON.stringify({
    event: payload.eventType,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    timestamp: new Date().toISOString(),
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (webhook.secret) {
    const sig = createHmac('sha256', webhook.secret).update(body).digest('hex');
    headers['X-Sabit-Signature'] = sig;
  }

  try {
    await fetch(webhook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    console.warn(`[Notification] Webhook delivery failed for ${webhook.url}:`, (err as Error).message);
  }
}

// ────────────────────────────────────────────────────────
// Email (infrastructure — not wired yet)
// ────────────────────────────────────────────────────────

const EMAIL_ENABLED = process.env.NOTIFICATIONS_EMAIL_ENABLED === 'true';

async function sendEmailNotification(
  userId: string,
  payload: NotificationPayload
): Promise<void> {
  const control = getControlPool();
  const userRow = await control.query<{ email: string; name: string | null }>(
    'SELECT email, name FROM users WHERE id = $1',
    [userId]
  );
  const user = userRow.rows[0];
  if (!user) return;

  if (!EMAIL_ENABLED) {
    console.log(`[EMAIL WOULD SEND] To: ${user.email} (${user.name ?? 'N/A'})\n  Subject: ${payload.title}\n  Body: ${payload.body}`);
    return;
  }

  // Future: call SendGrid/SES/SMTP here
  console.log(`[EMAIL SEND] To: ${user.email} — ${payload.title}`);
}

// ────────────────────────────────────────────────────────
// Main dispatch
// ────────────────────────────────────────────────────────

/**
 * Send a notification to all relevant recipients.
 * Fire-and-forget — never throws (logs errors).
 */
export async function notify(payload: NotificationPayload): Promise<void> {
  try {
    const recipients = await getPortfolioRecipients(payload.tenantId);

    // Also include preparer for blocking_issue_created
    if (payload.eventType === 'blocking_issue_created') {
      const preparer = await getSessionPreparer(payload.tenantId);
      if (preparer && !recipients.some((r) => r.userId === preparer.userId)) {
        recipients.push(preparer);
      }
    }

    // Check preferences per user (fall back to defaults: in_app=true, webhook=false, email=false)
    const control = getControlPool();
    const prefRows = await control.query<{
      user_id: string; in_app: boolean; webhook: boolean; email: boolean;
    }>(
      `SELECT user_id, in_app, webhook, email
       FROM notification_preferences
       WHERE tenant_id = $1 AND event_type = $2
       AND user_id = ANY($3::text[])`,
      [payload.tenantId, payload.eventType, recipients.map((r) => r.userId)]
    );
    const prefMap = new Map(prefRows.rows.map((p) => [p.user_id, p]));

    // Store in-app notifications
    for (const r of recipients) {
      const pref = prefMap.get(r.userId);
      const inApp = pref?.in_app ?? true;
      if (inApp) {
        await storeNotification(r.userId, payload);
      }
      const doEmail = pref?.email ?? false;
      if (doEmail) {
        await sendEmailNotification(r.userId, payload);
      }
    }

    // Webhooks — per tenant, not per user
    const webhooks = await getWebhooksForTenant(payload.tenantId);
    for (const wh of webhooks) {
      deliverWebhook(wh, payload).catch(() => {}); // fire-and-forget
    }
  } catch (err) {
    console.warn('[Notification] dispatch error:', (err as Error).message);
  }
}

// ────────────────────────────────────────────────────────
// Query helpers (for API routes)
// ────────────────────────────────────────────────────────

export async function listNotifications(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<Notification[]> {
  const control = getControlPool();
  const r = await control.query<{
    id: string; tenant_id: string; user_id: string; event_type: string;
    title: string; body: string; data: Record<string, unknown> | null;
    read: boolean; created_at: string;
  }>(
    `SELECT id, tenant_id, user_id, event_type, title, body, data, read, created_at::text
     FROM notifications
     WHERE user_id = $1
     ORDER BY read ASC, created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return r.rows.map((row) => ({
    id: row.id, tenantId: row.tenant_id, userId: row.user_id,
    eventType: row.event_type, title: row.title, body: row.body,
    data: row.data, read: row.read, createdAt: row.created_at,
  }));
}

export async function getUnreadCount(userId: string): Promise<number> {
  const control = getControlPool();
  const r = await control.query<{ count: string }>(
    'SELECT COUNT(*)::text FROM notifications WHERE user_id = $1 AND read = false',
    [userId]
  );
  return parseInt(r.rows[0]?.count ?? '0', 10);
}

export async function markAsRead(userId: string, notificationId: string): Promise<void> {
  const control = getControlPool();
  await control.query(
    'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2',
    [notificationId, userId]
  );
}

export async function markAllAsRead(userId: string): Promise<void> {
  const control = getControlPool();
  await control.query(
    'UPDATE notifications SET read = true WHERE user_id = $1 AND read = false',
    [userId]
  );
}

// ────────────────────────────────────────────────────────
// Webhook config CRUD
// ────────────────────────────────────────────────────────

export async function listWebhooks(tenantId: string): Promise<WebhookConfig[]> {
  const control = getControlPool();
  const r = await control.query<{
    id: string; tenant_id: string; url: string; secret: string | null; active: boolean; created_at: string;
  }>(
    'SELECT id, tenant_id, url, secret, active, created_at::text FROM webhook_configs WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return r.rows.map((row) => ({
    id: row.id, tenantId: row.tenant_id, url: row.url,
    secret: row.secret, active: row.active, createdAt: row.created_at,
  }));
}

export async function createWebhook(
  tenantId: string,
  url: string,
  secret?: string
): Promise<WebhookConfig> {
  const control = getControlPool();
  const r = await control.query<{
    id: string; tenant_id: string; url: string; secret: string | null; active: boolean; created_at: string;
  }>(
    `INSERT INTO webhook_configs (id, tenant_id, url, secret, active, created_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, true, NOW())
     RETURNING id, tenant_id, url, secret, active, created_at::text`,
    [tenantId, url, secret ?? null]
  );
  const row = r.rows[0];
  return {
    id: row.id, tenantId: row.tenant_id, url: row.url,
    secret: row.secret, active: row.active, createdAt: row.created_at,
  };
}

export async function deleteWebhook(tenantId: string, webhookId: string): Promise<void> {
  const control = getControlPool();
  await control.query(
    'DELETE FROM webhook_configs WHERE id = $1 AND tenant_id = $2',
    [webhookId, tenantId]
  );
}

// ────────────────────────────────────────────────────────
// Preference CRUD
// ────────────────────────────────────────────────────────

export interface NotificationPreference {
  eventType: string;
  inApp: boolean;
  webhook: boolean;
  email: boolean;
}

export async function getPreferences(
  tenantId: string,
  userId: string
): Promise<NotificationPreference[]> {
  const control = getControlPool();
  const r = await control.query<{
    event_type: string; in_app: boolean; webhook: boolean; email: boolean;
  }>(
    'SELECT event_type, in_app, webhook, email FROM notification_preferences WHERE tenant_id = $1 AND user_id = $2',
    [tenantId, userId]
  );
  return r.rows.map((row) => ({
    eventType: row.event_type, inApp: row.in_app, webhook: row.webhook, email: row.email,
  }));
}

export async function upsertPreferences(
  tenantId: string,
  userId: string,
  prefs: NotificationPreference[]
): Promise<void> {
  const control = getControlPool();
  for (const p of prefs) {
    await control.query(
      `INSERT INTO notification_preferences (id, tenant_id, user_id, event_type, in_app, webhook, email)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, user_id, event_type) DO UPDATE
       SET in_app = EXCLUDED.in_app, webhook = EXCLUDED.webhook, email = EXCLUDED.email`,
      [tenantId, userId, p.eventType, p.inApp, p.webhook, p.email]
    );
  }
}

// ────────────────────────────────────────────────────────
// Overdue check (can be called periodically or on page load)
// ────────────────────────────────────────────────────────

/**
 * Check for overdue sessions across all tenants and notify.
 * Only sends one notification per session per 24 hours.
 */
export async function checkOverdueAndNotify(): Promise<void> {
  const control = getControlPool();
  try {
    // Find all tenants with portfolio access
    const tenantRows = await control.query<{ tenant_id: string; name: string }>(
      `SELECT DISTINCT pa.tenant_id, t.name
       FROM portfolio_access pa
       JOIN tenants t ON t.id = pa.tenant_id`
    );

    for (const tenant of tenantRows.rows) {
      try {
        const { getTenantPool } = await import('../db/index.js');
        const pool = await getTenantPool(tenant.tenant_id);

        // Find in-progress sessions that are overdue (> 10 days default)
        const overdue = await pool.query<{
          id: string; period_end: string; created_at: string; days: number; blocking: string;
        }>(
          `SELECT cs.id, cs.period_end, cs.created_at,
                  EXTRACT(EPOCH FROM (NOW() - cs.created_at)) / 86400 AS days,
                  COALESCE((SELECT COUNT(*)::text FROM tenant_close_issues
                   WHERE period_id = cs.id AND severity IN ('critical','blocking')
                   AND status NOT IN ('resolved','verified','waived')), '0') AS blocking
           FROM close_sessions cs
           WHERE cs.tenant_id = $1
             AND cs.status IN ('in_progress', 'under_review')
             AND EXTRACT(EPOCH FROM (NOW() - cs.created_at)) / 86400 > 10`,
          [tenant.tenant_id]
        );

        for (const session of overdue.rows) {
          // Check if we already sent an overdue notification in the last 24 hours
          const recent = await control.query<{ count: string }>(
            `SELECT COUNT(*)::text FROM notifications
             WHERE tenant_id = $1 AND event_type = 'company_overdue'
             AND data->>'closeSessionId' = $2
             AND created_at > NOW() - INTERVAL '24 hours'`,
            [tenant.tenant_id, session.id]
          );
          if (parseInt(recent.rows[0]?.count ?? '0', 10) > 0) continue;

          const days = Math.floor(session.days);
          const periodLabel = session.period_end
            ? new Date(session.period_end + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            : 'current period';

          await notify({
            tenantId: tenant.tenant_id,
            eventType: 'company_overdue',
            title: `${tenant.name} is overdue`,
            body: `${tenant.name} is overdue for ${periodLabel}. Day ${days} of 10 day target. ${session.blocking} blocking issues remaining.`,
            data: { closeSessionId: session.id, days, blocking: parseInt(session.blocking, 10) },
          });
        }
      } catch {
        // Skip tenants that can't be reached
      }
    }
  } catch (err) {
    console.warn('[Notification] overdue check error:', (err as Error).message);
  }
}
