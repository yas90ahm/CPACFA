// @ts-nocheck — pool query mock returns only fields needed for a rejected budget reservation.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, jest } from '@jest/globals';
import type { Pool } from 'pg';
import {
  classifyCloseRecoveryFailure,
  closeOrchestratorJobId,
} from '../../src/services/close_orchestrator_service.js';
import { reserveStep } from '../../src/db/repositories/close_orchestrator_repository.js';

describe('bounded Close Orchestrator', () => {
  it('retries only clearly transient operational failures', () => {
    expect(classifyCloseRecoveryFailure('Network timeout from read-only source').autoRecoverable).toBe(true);
    expect(classifyCloseRecoveryFailure('Journal entry classification variance').autoRecoverable).toBe(false);
    expect(classifyCloseRecoveryFailure('Evidence required for accrued liabilities').autoRecoverable).toBe(false);
  });

  it('never retries an ambiguous ERP write outcome', () => {
    expect(classifyCloseRecoveryFailure('Sent to ERP but no response; unknown posting outcome')).toEqual({
      failureClass: 'ambiguous_external_write',
      autoRecoverable: false,
      reason: 'An external write may have occurred; the ERP receipt must be reconciled before another attempt.',
    });
  });

  it('gives repeat occurrences unique jobs while preserving deterministic idempotency', () => {
    const base = {
      tenantId: 'tenant-a', closeSessionId: 'session-a', trigger: 'task_failed' as const,
      sourceType: 'job' as const, sourceId: 'task-job-a', taskExecutionId: 'task-a',
    };
    expect(closeOrchestratorJobId({ ...base, occurrenceToken: 'attempt-1' })).toBe(
      closeOrchestratorJobId({ ...base, occurrenceToken: 'attempt-1' })
    );
    expect(closeOrchestratorJobId({ ...base, occurrenceToken: 'attempt-1' })).not.toBe(
      closeOrchestratorJobId({ ...base, occurrenceToken: 'attempt-2' })
    );
    expect(closeOrchestratorJobId({ ...base, tenantId: 'tenant-b', occurrenceToken: 'attempt-1' })).not.toBe(
      closeOrchestratorJobId({ ...base, occurrenceToken: 'attempt-1' })
    );
  });

  it('atomically refuses work after the persisted step budget is exhausted', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    expect(await reserveStep(pool, 'tenant-a', 'run-a')).toBeNull();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('steps_used < max_steps'),
      ['tenant-a', 'run-a']
    );
    expect(query.mock.calls[0][0]).toContain("status IN ('active', 'waiting_human')");
  });

  it('has no journal approval, posting, writeback, or protocol-bridge capability', () => {
    const source = readFileSync(join(process.cwd(), 'src/services/close_orchestrator_service.ts'), 'utf8');
    expect(source).not.toMatch(/\bapproveJE\b|\bpostJE\b|requestApprovedErpWriteback|protocol_bridge/);
    expect(source).toContain('accountingDataChanged: false');
    expect(source).toContain("ELIGIBLE_CORRECTION_RECOVERY_CAPABILITIES = new Set(['journal_entry_review'])");
    expect(source).toContain('originalCompletedTaskPreserved: true');
  });

  it('routes task failures through accounting classification before any retry', () => {
    const source = readFileSync(join(process.cwd(), 'src/services/runbook_execution_service.ts'), 'utf8');
    expect(source).toContain("type: 'runbook_task_execute'");
    expect(source).toMatch(/type: 'runbook_task_execute'[\s\S]{0,500}maxAttempts: 1/);
  });
});
