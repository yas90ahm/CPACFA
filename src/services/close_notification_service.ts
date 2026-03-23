/**
 * Close Notification Service — in-app notifications + optional webhook delivery
 * specifically for close process events (gate changes, auto-advance, task assignments).
 * Complements the existing notification_service.ts (portfolio-level events).
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { log } from '../lib/logger.js';

export type CloseNotificationType =
  | 'gate_passed' | 'gate_failed' | 'auto_advanced' | 'task_assigned'
  | 'task_due_soon' | 'task_overdue' | 'recon_completed' | 'je_posted'
  | 'review_rejected' | 'certified' | 'custom';

export type NotificationSeverity = 'info' | 'warning' | 'success' | 'error';

export interface CloseNotification {
  id: string;
  tenantId: string;
  userId: string;
  closeSessionId: string | null;
  notificationType: CloseNotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  readAt: string | null;
  actionUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function createCloseNotification(
  pool: Pool,
  tenantId: string,
  input: {
    userId: string;
    closeSessionId?: string;
    notificationType: CloseNotificationType;
    title: string;
    message: string;
    severity?: NotificationSeverity;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<CloseNotification> {
  const id = randomUUID();
  const r = await pool.query<Record<string, unknown>>(
    `INSERT INTO tenant_notifications (id, tenant_id, user_id, close_session_id,
       notification_type, title, message, severity, action_url, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     RETURNING *`,
    [id, tenantId, input.userId, input.closeSessionId ?? null,
     input.notificationType, input.title, input.message,
     input.severity ?? 'info', input.actionUrl ?? null,
     JSON.stringify(input.metadata ?? {})]
  );
  return mapRow(r.rows[0]);
}

/** Notify multiple users at once */
export async function notifyCloseUsers(
  pool: Pool,
  tenantId: string,
  userIds: string[],
  input: {
    closeSessionId?: string;
    notificationType: CloseNotificationType;
    title: string;
    message: string;
    severity?: NotificationSeverity;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<number> {
  let sent = 0;
  for (const userId of userIds) {
    try {
      await createCloseNotification(pool, tenantId, { ...input, userId });
      sent++;
    } catch (err) {
      log('warn', `Failed to create close notification for user ${userId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return sent;
}

export async function listCloseNotifications(
  pool: Pool, tenantId: string, userId: string,
  opts?: { unreadOnly?: boolean; limit?: number; closeSessionId?: string }
): Promise<CloseNotification[]> {
  let sql = 'SELECT * FROM tenant_notifications WHERE tenant_id = $1 AND user_id = $2';
  const params: unknown[] = [tenantId, userId];
  if (opts?.unreadOnly) sql += ' AND read_at IS NULL';
  if (opts?.closeSessionId) { params.push(opts.closeSessionId); sql += ` AND close_session_id = $${params.length}`; }
  sql += ' ORDER BY created_at DESC';
  params.push(Math.min(opts?.limit ?? 50, 200));
  sql += ` LIMIT $${params.length}`;
  const r = await pool.query<Record<string, unknown>>(sql, params);
  return r.rows.map(mapRow);
}

export async function markCloseNotificationRead(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query(`UPDATE tenant_notifications SET read_at = NOW() WHERE id = $2 AND tenant_id = $1 AND read_at IS NULL`, [tenantId, id]);
  return (r.rowCount ?? 0) > 0;
}

export async function getUnreadCloseCount(pool: Pool, tenantId: string, userId: string): Promise<number> {
  const r = await pool.query<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM tenant_notifications WHERE tenant_id = $1 AND user_id = $2 AND read_at IS NULL`,
    [tenantId, userId]
  );
  return r.rows[0]?.cnt ?? 0;
}

/** Notify on auto-advance */
export async function notifyAutoAdvance(
  pool: Pool, tenantId: string, closeSessionId: string, newStatus: string, triggeredBy: string
): Promise<void> {
  const teamMembers = await getTeamUserIds(pool, tenantId);
  if (teamMembers.length === 0) return;
  await notifyCloseUsers(pool, tenantId, teamMembers, {
    closeSessionId,
    notificationType: 'auto_advanced',
    title: `Close session auto-advanced to ${newStatus}`,
    message: `All gates passed. Session automatically advanced to ${newStatus}. Triggered by: ${triggeredBy}.`,
    severity: 'success',
    actionUrl: `/close/${closeSessionId}`,
    metadata: { newStatus, triggeredBy },
  });
}

async function getTeamUserIds(pool: Pool, tenantId: string): Promise<string[]> {
  try {
    const r = await pool.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM tenant_team_members WHERE tenant_id = $1 AND status = 'active' LIMIT 50`,
      [tenantId]
    );
    return r.rows.map((row) => row.user_id);
  } catch { return []; }
}

function mapRow(row: Record<string, unknown>): CloseNotification {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    closeSessionId: row.close_session_id != null ? String(row.close_session_id) : null,
    notificationType: String(row.notification_type) as CloseNotificationType,
    title: String(row.title),
    message: String(row.message),
    severity: String(row.severity) as NotificationSeverity,
    readAt: row.read_at != null ? String(row.read_at) : null,
    actionUrl: row.action_url != null ? String(row.action_url) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
  };
}
