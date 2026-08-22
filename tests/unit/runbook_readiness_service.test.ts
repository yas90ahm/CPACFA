import { describe, expect, it, jest } from '@jest/globals';
import type { Pool } from 'pg';
import { checkRunbookReadiness } from '../../src/services/runbook_readiness_service.js';

function fakePool(handler: (sql: string) => { rows: unknown[] }): Pool {
  return {
    query: jest.fn((sql: string) => Promise.resolve(handler(sql))),
  } as unknown as Pool;
}

describe('runbook close-readiness gate', () => {
  it('passes when no approved runbook is configured for the entity', async () => {
    let configuredQuery = '';
    const pool = fakePool((sql) => {
      if (sql.includes('tenant_close_calendar_config')) configuredQuery = sql;
      return { rows: [] };
    });
    const result = await checkRunbookReadiness(pool, 'tenant-1', 'session-1', 'entity-1');

    expect(result.required).toBe(false);
    expect(result.passing).toBe(true);
    expect(configuredQuery).toContain('c.close_frequency = r.frequency');
  });

  it('blocks a close when its configured approved runbook never started', async () => {
    const pool = fakePool((sql) => sql.includes('FROM close_runbook_executions')
      ? { rows: [] }
      : { rows: [{ id: 'runbook-1', task_count: '25' }] });
    const result = await checkRunbookReadiness(pool, 'tenant-1', 'session-1', 'entity-1');

    expect(result.required).toBe(true);
    expect(result.passing).toBe(false);
    expect(result.pending).toBe(25);
    expect(result.detail).toMatch(/has not started/i);
  });

  it('passes only when every persisted task and the execution are complete', async () => {
    const pool = fakePool((sql) => {
      if (sql.includes('FROM close_runbook_executions')) {
        return { rows: [{
          id: 'execution-1', tenant_id: 'tenant-1', runbook_id: 'runbook-1', close_session_id: 'session-1',
          status: 'completed', started_at: '2026-08-01T00:00:00.000Z', completed_at: '2026-08-02T00:00:00.000Z',
          created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-02T00:00:00.000Z',
        }] };
      }
      return { rows: [
        {
          id: 'task-1', tenant_id: 'tenant-1', execution_id: 'execution-1', close_session_id: 'session-1',
          task_code: 'CASH_REC', task_snapshot: {}, status: 'completed', result: {}, blocked_reason: null,
          assigned_to: null, started_at: null, completed_at: null, created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-02T00:00:00.000Z',
        },
        {
          id: 'task-2', tenant_id: 'tenant-1', execution_id: 'execution-1', close_session_id: 'session-1',
          task_code: 'INVENTORY_RECONCILIATION', task_snapshot: {}, status: 'skipped', result: {}, blocked_reason: null,
          assigned_to: null, started_at: null, completed_at: null, created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-02T00:00:00.000Z',
        },
      ] };
    });
    const result = await checkRunbookReadiness(pool, 'tenant-1', 'session-1', 'entity-1');

    expect(result.passing).toBe(true);
    expect(result.completed).toBe(2);
  });
});
