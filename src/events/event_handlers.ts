/**
 * Event handlers: subscribe to financial events and queue async jobs.
 *
 * Each handler:
 *   1. Receives typed event packet from the emitter
 *   2. Enqueues a job via the job worker
 *   3. The job: query KB → call Resolution Agent → validate → store in HITL staging → audit chain
 */

import { financialEvents, type FinancialEventMap, type FinancialEventType } from './financial_event_emitter.js';
import { enqueueJob } from '../services/job_service.js';
import { log } from '../lib/logger.js';
import type { GateCheckRequestedData } from './financial_event_emitter.js';

/**
 * Enqueue a resolution agent job for a financial event.
 * The job worker picks it up and runs the Plan-Execute-Verify loop.
 */
async function enqueueResolutionJob(
  eventType: FinancialEventType,
  packet: FinancialEventMap[typeof eventType]
): Promise<void> {
  try {
    const idempotencyKey = `resolution-${eventType}-${packet.emittedAt}-${packet.errorCode}`;
    await enqueueJob({
      type: 'resolution_agent',
      payload: {
        eventType,
        packet,
      },
      idempotencyKey,
      maxAttempts: 3,
    });
    log('info', `Queued resolution job for ${eventType}`, {
      errorCode: packet.errorCode,
      tenantId: packet.metadata.tenantId,
    });
  } catch (err) {
    // Non-blocking: log and continue. The event is already recorded in the audit trail
    // by the emitting service; the resolution job is advisory.
    log('error', `Failed to enqueue resolution job for ${eventType}`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// --- Register handlers ---

function handleVarianceDetected(packet: FinancialEventMap['VARIANCE_DETECTED']): void {
  void enqueueResolutionJob('VARIANCE_DETECTED', packet);
}

function handleReconOverTolerance(packet: FinancialEventMap['RECON_OVER_TOLERANCE']): void {
  void enqueueResolutionJob('RECON_OVER_TOLERANCE', packet);
}

function handleJEPolicyViolation(packet: FinancialEventMap['JE_POLICY_VIOLATION']): void {
  void enqueueResolutionJob('JE_POLICY_VIOLATION', packet);
}

function handleSuspiciousPlug(packet: FinancialEventMap['SUSPICIOUS_PLUG']): void {
  void enqueueResolutionJob('SUSPICIOUS_PLUG', packet);
}

function handleGLHealthAnomaly(packet: FinancialEventMap['GL_HEALTH_ANOMALY']): void {
  void enqueueResolutionJob('GL_HEALTH_ANOMALY', packet);
}

/** Enqueue gate check job when GATE_CHECK_REQUESTED fires. */
async function handleGateCheckRequested(packet: FinancialEventMap['GATE_CHECK_REQUESTED']): Promise<void> {
  const data = (packet as unknown as { data: GateCheckRequestedData }).data;
  const closeSessionId = data?.closeSessionId ?? packet.metadata?.closeSessionId;
  const tenantId = packet.metadata?.tenantId;
  if (!closeSessionId || !tenantId) return;
  try {
    const idempotencyKey = `gate-check-${closeSessionId}-${packet.emittedAt}`;
    await enqueueJob({
      type: 'gate_check' as unknown as import('../types/job.js').JobType,
      payload: {
        tenantId,
        closeSessionId,
        triggeredBy: data?.triggeredBy ?? 'event',
        trigger: data?.trigger ?? 'unknown',
      },
      idempotencyKey,
      maxAttempts: 1,
    });
    log('info', `Queued gate_check job for session ${closeSessionId}`, { tenantId, trigger: data?.trigger });
  } catch (err) {
    log('error', `Failed to enqueue gate_check job`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

let registered = false;

/**
 * Register all event handlers. Idempotent — safe to call multiple times.
 * Call this once during server startup.
 */
export function registerEventHandlers(): void {
  if (registered) return;
  registered = true;

  financialEvents.on('VARIANCE_DETECTED', handleVarianceDetected);
  financialEvents.on('RECON_OVER_TOLERANCE', handleReconOverTolerance);
  financialEvents.on('JE_POLICY_VIOLATION', handleJEPolicyViolation);
  financialEvents.on('SUSPICIOUS_PLUG', handleSuspiciousPlug);
  financialEvents.on('GL_HEALTH_ANOMALY', handleGLHealthAnomaly);
  financialEvents.on('GATE_CHECK_REQUESTED', handleGateCheckRequested);

  log('info', 'Financial event handlers registered');
}

/**
 * Unregister all handlers (for testing/cleanup).
 */
export function unregisterEventHandlers(): void {
  financialEvents.off('VARIANCE_DETECTED', handleVarianceDetected);
  financialEvents.off('RECON_OVER_TOLERANCE', handleReconOverTolerance);
  financialEvents.off('JE_POLICY_VIOLATION', handleJEPolicyViolation);
  financialEvents.off('SUSPICIOUS_PLUG', handleSuspiciousPlug);
  financialEvents.off('GL_HEALTH_ANOMALY', handleGLHealthAnomaly);
  financialEvents.off('GATE_CHECK_REQUESTED', handleGateCheckRequested);
  registered = false;
}
