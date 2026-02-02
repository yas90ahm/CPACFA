/**
 * Audit and evidence: DRL (document request list), sampling, prior-period comparison.
 */

export interface DocumentRequest {
  id: string;
  requestLabel: string;
  /** Link to binder or source document id */
  documentId?: string;
  status: 'pending' | 'in_progress' | 'fulfilled' | 'partial';
  requestedAt?: string; // ISO
  fulfilledAt?: string;
  /** FW3: DRL workflow */
  assignee?: string;
  dueDate?: string; // ISO
}

export interface SamplingInput {
  population: string; // e.g. "revenue", "ap"
  /** IDs or line refs for the population */
  items: { id: string; amount?: number }[];
  method: 'random' | 'risk_based' | 'hilo';
  sampleSize: number;
  /** Run metadata (stored with result) */
  periodLabel?: string;
  materialityThreshold?: number;
  populationCount?: number;
}

export interface SamplingResult {
  population: string;
  method: string;
  sampleSize: number;
  selectedIds: string[];
  selectedItems: { id: string; amount?: number }[];
  /** FW3: test result per selected item (pass/fail, exception) */
  testResults?: { id: string; result: 'pass' | 'fail' | 'exception'; note?: string }[];
  /** Run metadata: period, materiality threshold used, population count */
  periodLabel?: string;
  materialityThreshold?: number;
  populationCount?: number;
}

/** Sampling result with run id and created timestamp (stored by sampling_result_store). */
export interface SamplingResultWithId extends SamplingResult {
  runId: string;
  createdAt: string;
}

export interface PriorPeriodComparisonInput {
  currentLines: { label: string; amount: number }[];
  priorLines: { label: string; amount: number }[];
  currentPeriodLabel: string;
  priorPeriodLabel: string;
}

export interface PriorPeriodComparisonResult {
  currentPeriodLabel: string;
  priorPeriodLabel: string;
  lines: { label: string; currentAmount: number; priorAmount: number; change: number; changePercent: number; material?: boolean }[];
  narrative?: string;
}
