/**
 * Subsequent Events Service: ASC 855 post-balance-sheet-date event management.
 * Events are tracked during the SUBSEQUENT_EVENTS_REVIEW state (between CERTIFIED and LOCKED).
 */

import type { Pool } from 'pg';
import type {
  SubsequentEvent,
  CreateSubsequentEventInput,
  UpdateSubsequentEventInput,
} from '../types/subsequent_event.js';
import * as repo from '../db/repositories/subsequent_event_repository.js';
import { recordMaterialEvent } from './audit_service.js';

export class SubsequentEventError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'INVALID_STATE' | 'VALIDATION'
  ) {
    super(message);
    this.name = 'SubsequentEventError';
  }
}

export async function createEvent(
  pool: Pool,
  input: CreateSubsequentEventInput
): Promise<SubsequentEvent> {
  if (!input.description || input.description.trim().length < 5) {
    throw new SubsequentEventError('Description must be at least 5 characters', 'VALIDATION');
  }
  const event = await repo.createSubsequentEvent(pool, input);
  await recordMaterialEvent(pool, {
    tenantId: input.tenantId,
    eventType: 'subsequent_event_created',
    deterministicFlagSnapshot: {
      eventId: event.id,
      closeSessionId: input.closeSessionId,
      eventDate: input.eventDate,
      description: input.description,
    },
    createdBy: input.createdBy,
  });
  return event;
}

export async function listEvents(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<SubsequentEvent[]> {
  return repo.listBySession(pool, tenantId, closeSessionId);
}

export async function updateEventDisposition(
  pool: Pool,
  tenantId: string,
  eventId: string,
  input: UpdateSubsequentEventInput
): Promise<SubsequentEvent> {
  const updated = await repo.updateDisposition(pool, tenantId, eventId, input);
  if (!updated) {
    throw new SubsequentEventError('Subsequent event not found', 'NOT_FOUND');
  }
  await recordMaterialEvent(pool, {
    tenantId,
    eventType: 'subsequent_event_disposition_set',
    deterministicFlagSnapshot: {
      eventId,
      disposition: input.disposition,
      impactAssessment: input.impactAssessment,
    },
    createdBy: input.reviewedBy,
  });
  return updated;
}

/**
 * Check if subsequent events review is complete.
 * Complete when: all events have a disposition, OR the session has an explicit
 * "no subsequent events" confirmation.
 */
export async function isReviewComplete(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  confirmedBy: string | null | undefined
): Promise<{ complete: boolean; reason?: string }> {
  if (confirmedBy) {
    return { complete: true };
  }
  const events = await repo.listBySession(pool, tenantId, closeSessionId);
  if (events.length === 0) {
    return { complete: false, reason: 'No subsequent events recorded and no explicit confirmation provided' };
  }
  const unresolved = events.filter((e) => !e.disposition);
  if (unresolved.length > 0) {
    return { complete: false, reason: `${unresolved.length} subsequent event(s) without disposition` };
  }
  return { complete: true };
}
