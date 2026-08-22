/**
 * Durable job queue: types for jobs table and worker.
 */

export type JobStatus = 'pending' | 'locked' | 'completed' | 'failed' | 'dead';

export type JobType =
  | 'statement_generation'
  | 'resolution_agent'
  | 'gate_check'
  | 'close_cycle_kickoff'
  | 'close_orchestrator_reconcile'
  | 'runbook_task_execute'
  | 'erp_je_writeback';

export interface Job {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  lockedAt: string | null;
  completedAt: string | null;
  workerId: string | null;
  runAt: string | null;
}

export interface EnqueueInput {
  id: string;
  type: JobType;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  runAt?: string;
  maxAttempts?: number;
}

export interface JobHandlerContext {
  job: Job;
  workerId: string;
}
