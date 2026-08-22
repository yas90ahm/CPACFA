import type { Pool } from 'pg';
import * as repository from '../db/repositories/close_runbook_repository.js';

export interface RunbookReadiness {
  required: boolean;
  passing: boolean;
  executionId?: string;
  runbookId?: string;
  total: number;
  completed: number;
  waitingHuman: number;
  blocked: number;
  active: number;
  pending: number;
  detail: string;
}

/**
 * Readiness is based on persisted task outcomes, never model narration. When a
 * configured active runbook exists, not starting it is itself a hard blocker.
 */
export async function checkRunbookReadiness(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  entityId: string
): Promise<RunbookReadiness> {
  const execution = await repository.getExecutionBySession(pool, tenantId, closeSessionId);
  if (execution) {
    const tasks = await repository.listTaskExecutions(pool, tenantId, execution.id);
    const completed = tasks.filter((task) => task.status === 'completed' || task.status === 'skipped').length;
    const waitingHuman = tasks.filter((task) => task.status === 'waiting_human').length;
    const blocked = tasks.filter((task) => task.status === 'blocked' || task.status === 'failed').length;
    const active = tasks.filter((task) => task.status === 'queued' || task.status === 'running').length;
    const pending = tasks.filter((task) => task.status === 'pending').length;
    const passing = tasks.length > 0 && completed === tasks.length && execution.status === 'completed';
    return {
      required: true,
      passing,
      executionId: execution.id,
      runbookId: execution.runbookId,
      total: tasks.length,
      completed,
      waitingHuman,
      blocked,
      active,
      pending,
      detail: passing
        ? `${completed}/${tasks.length} approved runbook tasks complete`
        : `${completed}/${tasks.length} complete · ${waitingHuman} awaiting review · ${blocked} blocked/failed · ${active} active`,
    };
  }

  const configured = await pool.query<{ id: string; task_count: string }>(
    `SELECT r.id,
            CASE WHEN jsonb_typeof(r.compiled_plan->'tasks') = 'array'
              THEN jsonb_array_length(r.compiled_plan->'tasks') ELSE 0 END::text AS task_count
     FROM close_runbooks r
     JOIN tenant_close_calendar_config c
       ON c.tenant_id = r.tenant_id
      AND c.entity_id = r.entity_id
      AND c.close_frequency = r.frequency
      AND c.profile_id = r.profile_id
     WHERE r.tenant_id = $1
       AND r.entity_id = $2
       AND r.framework = 'ASPE'
       AND r.status = 'approved'
       AND r.is_active = TRUE
     LIMIT 1`,
    [tenantId, entityId]
  );
  const activeRunbook = configured.rows[0];
  if (activeRunbook) {
    return {
      required: true,
      passing: false,
      runbookId: activeRunbook.id,
      total: Number(activeRunbook.task_count),
      completed: 0,
      waitingHuman: 0,
      blocked: 0,
      active: 0,
      pending: Number(activeRunbook.task_count),
      detail: 'The configured approved runbook has not started for this close session',
    };
  }

  return {
    required: false,
    passing: true,
    total: 0,
    completed: 0,
    waitingHuman: 0,
    blocked: 0,
    active: 0,
    pending: 0,
    detail: 'No approved runbook is required for this close session',
  };
}
