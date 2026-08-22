import type {
  AllowedCloseAgentAction,
  CanadianAspeRequirementCode,
  CloseCompletionAuthority,
  CloseFrequency,
} from './accounting_close_profile.js';

export const CLOSE_RUNBOOK_SCHEMA_VERSION = '1.0.0' as const;

export type RunbookSourceFormat = 'csv' | 'xlsx' | 'json' | 'text' | 'pdf' | 'docx';
export type RunbookStatus = 'draft' | 'approved' | 'archived';
export type RunbookTaskOrigin = 'company_runbook' | 'sabit_control';
export type RunbookTaskExecutionMode = 'deterministic' | 'agent_assisted' | 'human_review';

/**
 * Capabilities are deliberately closed and code-owned. Uploaded documents may
 * select from this registry through the compiler, but can never invent tools.
 */
export type RunbookCapability =
  | 'source_integrity'
  | 'reconciliation_review'
  | 'journal_entry_review'
  | 'variance_review'
  | 'evidence_review'
  | 'statement_generation'
  | 'close_readiness'
  | 'human_review'
  | 'custom_review';

export type RunbookIssueSeverity = 'error' | 'warning' | 'info';

export interface RunbookCompilationIssue {
  severity: RunbookIssueSeverity;
  code:
    | 'EMPTY_RUNBOOK'
    | 'DUPLICATE_TASK_CODE'
    | 'UNKNOWN_DEPENDENCY'
    | 'CYCLIC_DEPENDENCY'
    | 'UNSAFE_INSTRUCTION_REWRITTEN'
    | 'FRAMEWORK_MISMATCH'
    | 'UNMAPPED_CUSTOM_TASK'
    | 'MANDATORY_CONTROL_ADDED'
    | 'INVALID_DUE_OFFSET'
    | 'INVALID_TOLERANCE';
  message: string;
  taskCode?: string;
  sourceReference?: string;
}

export interface ParsedRunbookTask {
  sourceReference: string;
  values: Record<string, string>;
}

export interface ParsedRunbookSource {
  format: RunbookSourceFormat;
  tasks: ParsedRunbookTask[];
  sourceRowCount: number;
  ignoredRowCount: number;
  warnings: string[];
}

export interface CompiledRunbookTask {
  code: string;
  title: string;
  description: string;
  origin: RunbookTaskOrigin;
  sourceReference?: string;
  category: string;
  capability: RunbookCapability;
  executionMode: RunbookTaskExecutionMode;
  completionAuthority: CloseCompletionAuthority;
  dependencies: string[];
  dueOffsetDays: number;
  assignee?: string;
  reviewer?: string;
  requiredInputs: string[];
  requiredEvidence: string[];
  completionCriteria: string;
  allowedAgentActions: AllowedCloseAgentAction[];
  approvalRequired: boolean;
  tolerance?: string;
  controlCode?: CanadianAspeRequirementCode;
}

export interface RunbookControlCoverage {
  coveredByCompanyRunbook: CanadianAspeRequirementCode[];
  addedBySabit: CanadianAspeRequirementCode[];
  uncovered: CanadianAspeRequirementCode[];
}

export interface CompiledCloseRunbook {
  schemaVersion: typeof CLOSE_RUNBOOK_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  framework: 'ASPE';
  frequency: CloseFrequency;
  generatedAt: string;
  requiresHumanApproval: true;
  executable: boolean;
  tasks: CompiledRunbookTask[];
  issues: RunbookCompilationIssue[];
  coverage: RunbookControlCoverage;
}

export interface CloseRunbook {
  id: string;
  tenantId: string;
  entityId: string;
  name: string;
  version: number;
  framework: 'ASPE';
  frequency: CloseFrequency;
  profileId: string;
  sourceFilename: string;
  sourceFormat: RunbookSourceFormat;
  sourceMimeType: string;
  sourceSha256: string;
  sourceSizeBytes: number;
  sourceRowCount: number;
  compiledPlan: CompiledCloseRunbook;
  status: RunbookStatus;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  supersedesRunbookId?: string;
}

export type RunbookExecutionStatus =
  | 'pending'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type RunbookTaskExecutionStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting_human'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface RunbookExecution {
  id: string;
  tenantId: string;
  runbookId: string;
  closeSessionId: string;
  status: RunbookExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RunbookTaskExecution {
  id: string;
  tenantId: string;
  executionId: string;
  closeSessionId: string;
  taskCode: string;
  taskSnapshot: CompiledRunbookTask;
  status: RunbookTaskExecutionStatus;
  result?: Record<string, unknown>;
  blockedReason?: string;
  assignedTo?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
