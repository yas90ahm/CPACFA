export type CloseOrchestratorRunStatus = 'active' | 'waiting_human' | 'completed' | 'stopped';
export type CloseOrchestratorEventType =
  | 'close_started'
  | 'human_correction'
  | 'journal_entry_changed'
  | 'task_blocked'
  | 'task_failed'
  | 'memory_applied'
  | 'recovery_scheduled'
  | 'recovery_completed'
  | 'human_required'
  | 'budget_stopped';
export type CloseRecoveryFailureClass =
  | 'transient_operational'
  | 'missing_input'
  | 'accounting_exception'
  | 'control_failure'
  | 'ambiguous_external_write'
  | 'human_correction_required';
export type CloseRecoveryIncidentStatus =
  | 'open'
  | 'retry_scheduled'
  | 'resolved'
  | 'human_required'
  | 'stopped';

export interface CloseOrchestratorRun {
  id: string;
  tenantId: string;
  entityId: string;
  closeSessionId: string;
  status: CloseOrchestratorRunStatus;
  maxDepth: number;
  maxSteps: number;
  stepsUsed: number;
  memoryContextCount: number;
  stopReason?: string;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
}

export interface CloseOrchestratorEvent {
  id: string;
  tenantId: string;
  runId: string;
  closeSessionId: string;
  parentEventId?: string;
  depth: number;
  eventType: CloseOrchestratorEventType;
  sourceType?: 'close_session' | 'journal_entry' | 'runbook_task' | 'memory' | 'job';
  sourceId?: string;
  decision: Record<string, unknown>;
  actor: string;
  createdAt: string;
}

export interface CloseRecoveryIncident {
  id: string;
  tenantId: string;
  runId: string;
  closeSessionId: string;
  taskExecutionId?: string;
  failureClass: CloseRecoveryFailureClass;
  status: CloseRecoveryIncidentStatus;
  autoRecoverable: boolean;
  attemptCount: number;
  maxAttempts: number;
  errorFingerprint: string;
  detail: Record<string, unknown>;
  resolution?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export type CloseOrchestratorTrigger =
  | 'close_started'
  | 'human_correction'
  | 'journal_entry_changed'
  | 'task_blocked'
  | 'task_failed';

export interface CloseOrchestratorReconcilePayload {
  tenantId: string;
  closeSessionId: string;
  trigger: CloseOrchestratorTrigger;
  sourceType: 'close_session' | 'journal_entry' | 'runbook_task' | 'memory' | 'job';
  sourceId: string;
  parentEventId?: string;
  /** Makes repeat failures for one task enqueueable without changing its source identity. */
  occurrenceToken?: string;
  depth?: number;
  memoryId?: string;
  taskExecutionId?: string;
  error?: string;
}

export interface CloseOrchestratorView {
  run: CloseOrchestratorRun;
  events: CloseOrchestratorEvent[];
  incidents: CloseRecoveryIncident[];
}
