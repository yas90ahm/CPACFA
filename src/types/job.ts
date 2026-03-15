/**
 * Durable job queue: types for jobs table and worker.
 */

export type JobStatus = 'pending' | 'locked' | 'completed' | 'failed' | 'dead';

// QUARANTINED — ingestion_pipeline not in MVP architecture
export type JobType = /* 'ingestion_pipeline' | */ 'agentic_cleanup' | 'statement_generation' | 'resolution_agent';

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
