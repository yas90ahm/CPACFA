/**
 * Gate Event Service — monitors gate status changes and triggers auto-advance.
 *
 * After key mutations (recon complete, JE posted, statement generated), the caller
 * emits a GATE_CHECK_REQUESTED event. This service:
 * 1. Re-evaluates all readiness gates
 * 2. Persists a gate status snapshot
 * 3. If all gates pass AND auto-advance is enabled, advances the session
 *
 * This is the bridge between manual close work and true close automation.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { getReadinessGates } from './session_readiness_gates_service.js';
import { getSession } from './close_session_service.js';
import { recordMaterialEvent } from './audit_service.js';
import { financialEvents } from '../events/financial_event_emitter.js';
import { log } from '../lib/logger.js';

export interface GateCheckResult {
  sessionId: string;
  gatesPassing: number;
  gatesTotal: number;
  canAdvance: boolean;
  autoAdvanced: boolean;
  newStatus: string | null;
  snapshotId: string;
}

/**
 * Check all gates for a session, persist snapshot, and optionally auto-advance.
 * Called after key mutations: recon completion, JE posting, statement generation.
 */
export async function checkGatesAndAutoAdvance(
  pool: Pool,
  tenantId: string,
  sessionId: string,
  triggeredBy: string
): Promise<GateCheckResult> {
  const session = await getSession(pool, tenantId, sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Only check gates for in_progress sessions
  if (session.status !== 'in_progress') {
    return {
      sessionId,
      gatesPassing: 0,
      gatesTotal: 0,
      canAdvance: false,
      autoAdvanced: false,
      newStatus: null,
      snapshotId: '',
    };
  }

  // Evaluate all gates
  const gatesResult = await getReadinessGates(pool, tenantId, session);

  // Persist gate snapshot
  const snapshotId = randomUUID();
  try {
    await pool.query(
      `INSERT INTO tenant_gate_snapshots (id, tenant_id, close_session_id, gates_passing, gates_total, can_advance, gate_details, triggered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        snapshotId,
        tenantId,
        sessionId,
        gatesResult.gatesPassing,
        gatesResult.gatesTotal,
        gatesResult.canAdvance,
        JSON.stringify(gatesResult.gates.map((g) => ({
          id: g.id,
          name: g.name,
          passing: g.passing,
          detail: g.detail,
          category: g.category,
        }))),
        triggeredBy,
      ]
    );
  } catch {
    // Gate snapshot table may not exist yet; non-fatal
  }

  // Auto-complete checklist items that correspond to passing gates
  try {
    const { getChecklistItems, completeChecklistItem } = await import('./close_checklist_readiness_service.js');
    const checklistItems = await getChecklistItems(pool, tenantId, sessionId);
    const gateToChecklistMap: Record<string, string> = {
      'cash_rec_complete': 'CASH_REC',
      'no_blocking_issues': 'NO_CRITICAL_ISSUES',
      'material_jes_approved': 'MATERIAL_JES_APPROVED',
      'tb_balanced': 'INTEGRITY_CHECKS',
    };
    for (const gate of gatesResult.gates) {
      if (!gate.passing) continue;
      const checklistCode = gateToChecklistMap[gate.id];
      if (!checklistCode) continue;
      const item = checklistItems.find((i) => i.code === checklistCode && i.status !== 'completed' && i.status !== 'skipped');
      if (item) {
        await completeChecklistItem(pool, tenantId, item.id, 'system:auto-complete', `Auto-completed: ${gate.name} gate passed`);
      }
    }
  } catch {
    // Non-fatal: checklist auto-completion failed
  }

  // Auto-advance removed: controller must always click Advance manually.

  return {
    sessionId,
    gatesPassing: gatesResult.gatesPassing,
    gatesTotal: gatesResult.gatesTotal,
    canAdvance: gatesResult.canAdvance,
    autoAdvanced: false,
    newStatus: null,
    snapshotId,
  };
}

/**
 * Get the latest gate snapshot for a session.
 */
export async function getLatestGateSnapshot(
  pool: Pool,
  tenantId: string,
  sessionId: string
): Promise<{
  gatesPassing: number;
  gatesTotal: number;
  canAdvance: boolean;
  gateDetails: Array<{ id: string; name: string; passing: boolean; detail: string }>;
  checkedAt: string;
} | null> {
  try {
    const r = await pool.query<{
      gates_passing: number;
      gates_total: number;
      can_advance: boolean;
      gate_details: unknown;
      created_at: string | Date;
    }>(
      `SELECT gates_passing, gates_total, can_advance, gate_details, created_at
       FROM tenant_gate_snapshots
       WHERE tenant_id = $1 AND close_session_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, sessionId]
    );
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return {
      gatesPassing: row.gates_passing,
      gatesTotal: row.gates_total,
      canAdvance: row.can_advance,
      gateDetails: row.gate_details as Array<{ id: string; name: string; passing: boolean; detail: string }>,
      checkedAt: typeof row.created_at === 'string' ? row.created_at : (row.created_at as Date).toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Register gate check as a new job type in the job handlers.
 * This allows gate checks to run asynchronously via the job queue.
 */
export async function handleGateCheckJob(ctx: { job: { payload: Record<string, unknown> }; workerId: string }): Promise<void> {
  const tenantId = ctx.job.payload?.tenantId as string | undefined;
  const sessionId = ctx.job.payload?.closeSessionId as string | undefined;
  const triggeredBy = (ctx.job.payload?.triggeredBy as string) ?? 'system:job';

  if (!tenantId || !sessionId) {
    throw new Error('gate_check job requires payload.tenantId and payload.closeSessionId');
  }

  const { getTenantPool } = await import('../db/index.js');
  const pool = await getTenantPool(tenantId);
  await checkGatesAndAutoAdvance(pool, tenantId, sessionId, triggeredBy);
}
