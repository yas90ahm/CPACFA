/**
 * Typed event emitter for financial events.
 * Events are emitted by services when significant financial conditions are detected.
 * Handlers subscribe to process these events asynchronously via the job queue.
 */

import { EventEmitter } from 'events';

// --- Event Types ---

export type FinancialEventType =
  | 'VARIANCE_DETECTED'
  | 'RECON_OVER_TOLERANCE'
  | 'JE_POLICY_VIOLATION'
  | 'SUSPICIOUS_PLUG'
  | 'GL_HEALTH_ANOMALY'
  | 'GATE_CHECK_REQUESTED';

// --- Event Packet ---

export interface FinancialEventPacket<T extends FinancialEventType = FinancialEventType> {
  eventType: T;
  errorCode: string;
  conflictingData: Record<string, unknown>;
  metadata: {
    tenantId: string;
    closeSessionId?: string;
    periodLabel?: string;
    relatedTransactions?: string[];
    userIds?: string[];
    accountCodes?: string[];
  };
  context: Record<string, unknown>;
  emittedAt: string;
}

// --- Per-event payload shapes ---

export interface VarianceDetectedData {
  varianceId: string;
  fsLineId: string;
  lineItemName: string;
  statement: string;
  currentAmount: number;
  priorAmount: number;
  changeAmount: number;
  changePercentage: number;
  materialThresholdPct: number;
}

export interface ReconOverToleranceData {
  reconId: string;
  accountCode: string;
  unexplainedVariance: number;
  toleranceAmount: number;
  previousStatus: string;
  entityId: string;
}

export interface JEPolicyViolationData {
  journalEntryId: string;
  severity: 'ok' | 'warn' | 'block';
  findings: Array<{ code: string; message: string; rule_ids: string[]; refs: string[] }>;
  confidence: number;
  memo: string;
  lines: Array<{ accountRef: string; debit: number; credit: number; description?: string }>;
}

export interface SuspiciousPlugData {
  plugAccountNames: string[];
  plugAmount: number;
  plugShare: number;
  totalNetActivity: number;
  threshold: number;
}

export interface GLHealthAnomalyData {
  overallGrade: string;
  overallScore: number;
  findingCount: number;
  criticalFindings: Array<{ checkName: string; severity: string; findingCount: number; details?: string }>;
}

export interface GateCheckRequestedData {
  closeSessionId: string;
  trigger: string;
  triggeredBy: string;
}

// --- Typed event map ---

export interface FinancialEventMap {
  VARIANCE_DETECTED: FinancialEventPacket<'VARIANCE_DETECTED'> & { data: VarianceDetectedData };
  RECON_OVER_TOLERANCE: FinancialEventPacket<'RECON_OVER_TOLERANCE'> & { data: ReconOverToleranceData };
  JE_POLICY_VIOLATION: FinancialEventPacket<'JE_POLICY_VIOLATION'> & { data: JEPolicyViolationData };
  SUSPICIOUS_PLUG: FinancialEventPacket<'SUSPICIOUS_PLUG'> & { data: SuspiciousPlugData };
  GL_HEALTH_ANOMALY: FinancialEventPacket<'GL_HEALTH_ANOMALY'> & { data: GLHealthAnomalyData };
  GATE_CHECK_REQUESTED: FinancialEventPacket<'GATE_CHECK_REQUESTED'> & { data: GateCheckRequestedData };
}

// --- Typed emitter ---

class FinancialEventEmitter {
  private emitter = new EventEmitter();

  constructor() {
    // Prevent memory leak warnings — we may have multiple handlers per event type
    this.emitter.setMaxListeners(50);
  }

  emit<T extends FinancialEventType>(eventType: T, packet: FinancialEventMap[T]): void {
    this.emitter.emit(eventType, packet);
  }

  on<T extends FinancialEventType>(eventType: T, handler: (packet: FinancialEventMap[T]) => void): void {
    this.emitter.on(eventType, handler);
  }

  off<T extends FinancialEventType>(eventType: T, handler: (packet: FinancialEventMap[T]) => void): void {
    this.emitter.off(eventType, handler);
  }

  once<T extends FinancialEventType>(eventType: T, handler: (packet: FinancialEventMap[T]) => void): void {
    this.emitter.once(eventType, handler);
  }

  removeAllListeners(eventType?: FinancialEventType): void {
    if (eventType) this.emitter.removeAllListeners(eventType);
    else this.emitter.removeAllListeners();
  }
}

/** Singleton event bus for financial events. */
export const financialEvents = new FinancialEventEmitter();

// --- Helper to build packets ---

export function buildEventPacket<T extends FinancialEventType>(
  eventType: T,
  params: {
    errorCode: string;
    conflictingData: Record<string, unknown>;
    metadata: FinancialEventPacket['metadata'];
    context?: Record<string, unknown>;
    data: FinancialEventMap[T] extends { data: infer D } ? D : never;
  }
): FinancialEventMap[T] {
  return {
    eventType,
    errorCode: params.errorCode,
    conflictingData: params.conflictingData,
    metadata: params.metadata,
    context: params.context ?? {},
    emittedAt: new Date().toISOString(),
    data: params.data,
  } as unknown as FinancialEventMap[T];
}
