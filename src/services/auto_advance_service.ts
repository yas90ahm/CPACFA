/**
 * Readiness Notification Engine
 *
 * After every cascade, checks if the current session's gates all pass.
 * If they do, notifies the controller that the session is READY for advancement.
 *
 * The controller ALWAYS clicks Advance manually. The system tells them WHEN,
 * not does it for them. This preserves the human checkpoint on every gate transition.
 *
 * Notification channels:
 * 1. WebSocket real-time event (persistent, not dismissable toast)
 * 2. In-app notification (stored in DB, shows in notification bell)
 * 3. Email to session owner + CFO role users (if configured)
 *
 * This replaces the previous auto-advance design. The system is autonomous
 * in doing the WORK but the controller decides when to ADVANCE.
 */

import type { Pool } from 'pg';
import type { CascadeResult } from './cascade_engine.js';

export interface ReadinessCheckResult {
  ready: boolean;
  notified: boolean;
  sessionId: string;
  currentStatus: string;
  reason: string;
  blockerCount: number;
}

/**
 * Check if a session is ready to advance after a cascade.
 * If ready, send persistent notifications to the controller.
 * NEVER advances the session automatically.
 */
export async function checkAndNotifyReadiness(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  cascadeResult: CascadeResult
): Promise<ReadinessCheckResult> {
  // Only notify if cascade validation shows all hard checks passing
  if (!cascadeResult.validation_results.all_hard_passing) {
    return {
      ready: false,
      notified: false,
      sessionId: closeSessionId,
      currentStatus: 'unknown',
      reason: `${cascadeResult.validation_results.blocking_count} hard blocker(s) remain`,
      blockerCount: cascadeResult.validation_results.blocking_count,
    };
  }

  // Get current session
  const { getCloseSessionById } = await import('../db/repositories/close_session_repository.js');
  const session = await getCloseSessionById(pool, tenantId, closeSessionId);
  if (!session) {
    return { ready: false, notified: false, sessionId: closeSessionId, currentStatus: 'unknown', reason: 'Session not found', blockerCount: 0 };
  }

  // Only relevant for IN_PROGRESS sessions (the only state that can advance to UNDER_REVIEW)
  if (session.status !== 'in_progress') {
    return { ready: false, notified: false, sessionId: closeSessionId, currentStatus: session.status, reason: 'Not in IN_PROGRESS state', blockerCount: 0 };
  }

  // Run full readiness check (not lightweight — this is the real gate)
  const { computeReadiness } = await import('./close_checklist_readiness_service.js');
  const readiness = await computeReadiness(pool, tenantId, session);

  if (!readiness.ready || readiness.hardBlockers.length > 0) {
    return {
      ready: false,
      notified: false,
      sessionId: closeSessionId,
      currentStatus: 'in_progress',
      reason: `${readiness.hardBlockers.length} hard blocker(s): ${readiness.hardBlockers.slice(0, 2).join('; ')}`,
      blockerCount: readiness.hardBlockers.length,
    };
  }

  // All gates pass — notify controller (DO NOT advance)
  const periodLabel = (session.periodEnd ?? '').slice(0, 7);
  const entityName = (session as unknown as { entityName?: string }).entityName ?? session.entityId ?? 'Unknown';
  const notificationTitle = `All gates passed — ${entityName} ${periodLabel} ready for review`;
  const notificationBody =
    `All readiness gates have passed for the ${periodLabel} close. ` +
    `Mapping, reconciliation, adjusting entries, variance explanations, and integrity checks are complete. ` +
    `Click "Advance to Review" on the dashboard when you are ready to proceed.`;

  // Channel 1: WebSocket real-time event (persistent — type 'readiness_changed')
  try {
    const { emitSessionEvent } = await import('../realtime/index.js');
    emitSessionEvent({
      type: 'readiness_changed',
      sessionId: closeSessionId,
      tenantId,
      triggeredBy: 'readiness_engine',
      data: {
        ready: true,
        allGatesPassed: true,
        currentStatus: 'in_progress',
        nextStatus: 'under_review',
        requiresAction: true,
        message: notificationTitle,
        detail: notificationBody,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[readiness] non-fatal: emit readiness websocket event failed:', err instanceof Error ? err.message : String(err));
  }

  // Channel 2: In-app notification (stored in DB, shows in notification bell)
  try {
    const { notify } = await import('./notification_service.js');
    await notify({
      tenantId,
      eventType: 'ready_to_advance',
      title: notificationTitle,
      body: notificationBody,
      data: {
        closeSessionId,
        periodLabel,
        entityName,
        action: 'advance_to_review',
        actionUrl: `/close/${closeSessionId}/dashboard`,
        allGatesPassed: true,
      },
    });
  } catch (err) {
    console.warn('[readiness] non-fatal: in-app notification failed:', err instanceof Error ? err.message : String(err));
  }

  // Channel 3: Email notification (if SMTP configured)
  try {
    await sendReadinessEmail(pool, tenantId, {
      closeSessionId,
      periodLabel,
      entityName,
      title: notificationTitle,
      body: notificationBody,
    });
  } catch (err) {
    console.warn('[readiness] non-fatal: send readiness email failed:', err instanceof Error ? err.message : String(err));
  }

  // Audit trail — record that the system detected readiness
  try {
    const { appendEntry } = await import('../db/repositories/audit_ledger_repository.js');
    await appendEntry(pool, {
      tenantId,
      eventType: 'close_session_transition',
      deterministicFlagSnapshot: {
        closeSessionId,
        status: 'in_progress',
        allGatesPassed: true,
        notifiedAt: new Date().toISOString(),
        action: 'readiness_notification_sent',
      },
      userPromptRationale: 'All readiness gates passed — notification sent to controller (manual advance required)',
    });
  } catch (err) {
    console.warn('[readiness] non-fatal: audit trail append failed:', err instanceof Error ? err.message : String(err));
  }

  return {
    ready: true,
    notified: true,
    sessionId: closeSessionId,
    currentStatus: 'in_progress',
    reason: 'All gates passed — controller notified',
    blockerCount: 0,
  };
}

/**
 * Send email notification for readiness (if SMTP is configured).
 * Sends to: session creator + all users with 'system_admin', 'reviewer', 'controller', or 'cfo' role for this tenant.
 */
async function sendReadinessEmail(
  pool: Pool,
  tenantId: string,
  params: {
    closeSessionId: string;
    periodLabel: string;
    entityName: string;
    title: string;
    body: string;
  }
): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) return; // Email not configured — skip silently

  // Find recipients: admins + reviewers for this tenant
  const { getControlPool } = await import('../db/index.js');
  const control = getControlPool();
  const recipientRes = await control.query<{ email: string; name: string }>(
    `SELECT email, name FROM users
     WHERE tenant_id = $1 AND role IN ('system_admin', 'reviewer', 'controller', 'cfo') AND active = true AND email IS NOT NULL`,
    [tenantId]
  );

  if (recipientRes.rows.length === 0) return;

  // Log email intent for each recipient (SMTP delivery handled by webhook or future job type)
  for (const recipient of recipientRes.rows) {
    console.log(
      `[readiness-email] To: ${recipient.email} | Subject: ${params.title} | ` +
      `Session: ${params.closeSessionId} | Entity: ${params.entityName}`
    );

    // If webhooks are configured for this tenant, deliver via webhook
    try {
      const { listWebhooks } = await import('./notification_service.js');
      const webhooks = await listWebhooks(tenantId);
      for (const wh of webhooks) {
        if (!wh.active) continue;
        try {
          const response = await fetch(wh.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'readiness_all_gates_passed',
              tenantId,
              closeSessionId: params.closeSessionId,
              periodLabel: params.periodLabel,
              entityName: params.entityName,
              recipient: { email: recipient.email, name: recipient.name },
              message: params.body,
              dashboardUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:3002'}/close/${params.closeSessionId}/dashboard`,
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) {
            console.warn(`[readiness-email] Webhook ${wh.url} returned ${response.status}`);
          }
        } catch (err) {
          console.warn('[readiness] non-fatal: webhook delivery failed:', err instanceof Error ? err.message : String(err));
        }
      }
    } catch (err) {
      console.warn('[readiness] non-fatal: webhook listing failed:', err instanceof Error ? err.message : String(err));
    }
  }
}
