/**
 * Evidence attachment service — attach evidence to journal entries.
 * Supports metadata-only (external) and file-upload (storage) evidence.
 * Enforces period lock / certified session rules.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  getEvidenceStorageAdapterAsync,
  computeSha256,
} from './evidence_storage_service.js';
import * as jeRepo from '../db/repositories/journal_entry_repository.js';
import * as closeSessionRepo from '../db/repositories/close_session_repository.js';
import {
  createEvidenceRecord,
  linkEvidenceToJournalEntry,
  linkEvidenceToObject,
  listEvidenceForObject,
} from '../db/repositories/evidence_repository.js';
import { isPeriodLocked } from './period_lock_service.js';
import { recordMaterialEvent } from './audit_service.js';
import type { CloseSessionStatus } from '../types/close_session.js';
import type { AssertionType } from '../types/evidence.js';

export interface AttachEvidenceInput {
  hashSha256: string;
  sizeBytes: number;
  assertionType: AssertionType;
  mimeType?: string;
  externalUri?: string;
  externalProvider?: string;
  label?: string;
  role?: string;
  requiredness?: 'optional' | 'required';
  attachedBy: string;
  claimedAmount?: string;
  claimedCurrency?: string;
  claimedPeriod?: string;
  note?: string;
  storagePath?: string;
  originalFilename?: string;
}

export interface AttachEvidenceResult {
  evidenceId: string;
  linkId: string;
}

export class EvidenceAttachmentError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'PERIOD_LOCKED' | 'VALIDATION'
  ) {
    super(message);
    this.name = 'EvidenceAttachmentError';
  }
}

/** Block when period is locked or close session is locked/certified. */
const BLOCKED_SESSION_STATUSES: CloseSessionStatus[] = ['locked', 'certified'];

/**
 * Attach evidence to a journal entry.
 * Creates evidence_record + evidence_link, records audit ledger event.
 * Blocks when period is locked or session is locked/certified.
 */
export async function attachEvidenceToJournalEntry(
  pool: Pool,
  tenantId: string,
  journalEntryId: string,
  input: AttachEvidenceInput
): Promise<AttachEvidenceResult> {
  const je = await jeRepo.getJournalEntryById(pool, journalEntryId, tenantId);
  if (!je) {
    throw new EvidenceAttachmentError('Journal entry not found', 'NOT_FOUND');
  }

  const session = await closeSessionRepo.getCloseSessionById(pool, tenantId, je.closeSessionId);
  if (!session) {
    throw new EvidenceAttachmentError('Close session not found for journal entry', 'NOT_FOUND');
  }

  if (BLOCKED_SESSION_STATUSES.includes(session.status as CloseSessionStatus)) {
    throw new EvidenceAttachmentError(
      `Cannot attach evidence: close session is ${session.status}`,
      'PERIOD_LOCKED'
    );
  }

  const periodLabel = session.periodEnd?.slice(0, 7);
  if (periodLabel) {
    const locked = await isPeriodLocked(periodLabel, tenantId, pool);
    if (locked) {
      throw new EvidenceAttachmentError(
        `Cannot attach evidence: period ${periodLabel} is locked`,
        'PERIOD_LOCKED'
      );
    }
  }

  const record = await createEvidenceRecord(pool, tenantId, {
    hashSha256: input.hashSha256,
    sizeBytes: input.sizeBytes,
    mimeType: input.mimeType,
    externalUri: input.externalUri,
    externalProvider: input.externalProvider,
    label: input.label,
    attachedBy: input.attachedBy,
    storagePath: input.storagePath,
    originalFilename: input.originalFilename,
  });

  const link = await linkEvidenceToJournalEntry(pool, tenantId, {
    evidenceId: record.id,
    objectType: 'journal_entry',
    objectId: journalEntryId,
    assertionType: input.assertionType,
    role: input.role ?? 'support',
    requiredness: input.requiredness ?? 'optional',
    createdBy: input.attachedBy,
    claimedAmount: input.claimedAmount,
    claimedCurrency: input.claimedCurrency,
    claimedPeriod: input.claimedPeriod,
    note: input.note,
  });

  await recordMaterialEvent(pool, {
    tenantId,
    periodLabel: periodLabel ?? undefined,
    eventType: 'evidence_link',
    deterministicFlagSnapshot: {
      journalEntryId,
      evidenceId: record.id,
      linkId: link.id,
      hashSha256: input.hashSha256,
    },
    createdBy: input.attachedBy,
  });

  return {
    evidenceId: record.id,
    linkId: link.id,
  };
}

export interface AttachEvidenceWithFileInput {
  buffer: Buffer;
  mimeType?: string;
  originalFilename?: string;
  assertionType: AssertionType;
  role?: string;
  requiredness?: 'optional' | 'required';
  attachedBy: string;
  claimedAmount?: string;
  claimedCurrency?: string;
  claimedPeriod?: string;
  note?: string;
}

/**
 * Attach evidence with file upload: compute hash, store file, create record, link to JE.
 */
export async function attachEvidenceWithFile(
  pool: Pool,
  tenantId: string,
  journalEntryId: string,
  input: AttachEvidenceWithFileInput
): Promise<AttachEvidenceResult> {
  const je = await jeRepo.getJournalEntryById(pool, journalEntryId, tenantId);
  if (!je) {
    throw new EvidenceAttachmentError('Journal entry not found', 'NOT_FOUND');
  }

  const session = await closeSessionRepo.getCloseSessionById(pool, tenantId, je.closeSessionId);
  if (!session) {
    throw new EvidenceAttachmentError('Close session not found for journal entry', 'NOT_FOUND');
  }

  if (BLOCKED_SESSION_STATUSES.includes(session.status as CloseSessionStatus)) {
    throw new EvidenceAttachmentError(
      `Cannot attach evidence: close session is ${session.status}`,
      'PERIOD_LOCKED'
    );
  }

  const periodLabel = session.periodEnd?.slice(0, 7);
  if (periodLabel) {
    const locked = await isPeriodLocked(periodLabel, tenantId, pool);
    if (locked) {
      throw new EvidenceAttachmentError(
        `Cannot attach evidence: period ${periodLabel} is locked`,
        'PERIOD_LOCKED'
      );
    }
  }

  const hashSha256 = computeSha256(input.buffer);
  const sizeBytes = input.buffer.length;
  const evidenceId = randomUUID();
  const adapter = await getEvidenceStorageAdapterAsync();
  const { storagePath } = await adapter.store(
    tenantId,
    evidenceId,
    input.buffer,
    {
      mimeType: input.mimeType,
      originalFilename: input.originalFilename,
    }
  );
  const record = await createEvidenceRecord(
    pool,
    tenantId,
    {
      hashSha256,
      sizeBytes,
      mimeType: input.mimeType,
      attachedBy: input.attachedBy,
      storagePath,
      originalFilename: input.originalFilename,
    },
    { id: evidenceId }
  );
  const link = await linkEvidenceToJournalEntry(pool, tenantId, {
    evidenceId: record.id,
    objectType: 'journal_entry',
    objectId: journalEntryId,
    assertionType: input.assertionType,
    role: input.role ?? 'support',
    requiredness: input.requiredness ?? 'optional',
    createdBy: input.attachedBy,
    claimedAmount: input.claimedAmount,
    claimedCurrency: input.claimedCurrency,
    claimedPeriod: input.claimedPeriod,
    note: input.note,
  });
  await recordMaterialEvent(pool, {
    tenantId,
    periodLabel: periodLabel ?? undefined,
    eventType: 'evidence_link',
    deterministicFlagSnapshot: {
      journalEntryId,
      evidenceId: record.id,
      linkId: link.id,
      hashSha256,
    },
    createdBy: input.attachedBy,
  });

  return {
    evidenceId: record.id,
    linkId: link.id,
  };
}

export interface AttachEvidenceToReconciliationInput {
  buffer: Buffer;
  mimeType?: string;
  originalFilename?: string;
  description?: string;
  attachedBy: string;
}

/**
 * Attach evidence to a reconciliation (supporting document).
 * Blocks when recon is approved or period is locked.
 */
export async function attachEvidenceToReconciliation(
  pool: Pool,
  tenantId: string,
  reconId: string,
  input: AttachEvidenceToReconciliationInput
): Promise<AttachEvidenceResult> {
  const { getPeriodReconciliationById } = await import('../db/repositories/period_reconciliation_repository.js');
  const recon = await getPeriodReconciliationById(pool, tenantId, reconId);
  if (!recon) {
    throw new EvidenceAttachmentError('Reconciliation not found', 'NOT_FOUND');
  }
  if (recon.status === 'approved') {
    throw new EvidenceAttachmentError(
      'Cannot modify evidence on an approved reconciliation',
      'PERIOD_LOCKED'
    );
  }

  const session = await closeSessionRepo.getCloseSessionById(pool, tenantId, recon.periodId);
  if (!session) {
    throw new EvidenceAttachmentError('Close session not found for reconciliation', 'NOT_FOUND');
  }
  if (BLOCKED_SESSION_STATUSES.includes(session.status as CloseSessionStatus)) {
    throw new EvidenceAttachmentError(
      `Cannot attach evidence: close session is ${session.status}`,
      'PERIOD_LOCKED'
    );
  }

  const periodLabel = session.periodEnd?.slice(0, 7);
  if (periodLabel) {
    const locked = await isPeriodLocked(periodLabel, tenantId, pool);
    if (locked) {
      throw new EvidenceAttachmentError(
        `Cannot attach evidence: period ${periodLabel} is locked`,
        'PERIOD_LOCKED'
      );
    }
  }

  const hashSha256 = computeSha256(input.buffer);
  const sizeBytes = input.buffer.length;
  const evidenceId = randomUUID();
  const adapter = await getEvidenceStorageAdapterAsync();
  const { storagePath } = await adapter.store(
    tenantId,
    evidenceId,
    input.buffer,
    {
      mimeType: input.mimeType,
      originalFilename: input.originalFilename,
    }
  );
  const record = await createEvidenceRecord(
    pool,
    tenantId,
    {
      hashSha256,
      sizeBytes,
      mimeType: input.mimeType,
      attachedBy: input.attachedBy,
      storagePath,
      originalFilename: input.originalFilename,
    },
    { id: evidenceId }
  );
  const link = await linkEvidenceToObject(pool, tenantId, {
    evidenceId: record.id,
    objectType: 'reconciliation',
    objectId: reconId,
    assertionType: 'reconciliation',
    role: 'support',
    requiredness: 'required',
    createdBy: input.attachedBy,
    note: input.description,
  });
  await recordMaterialEvent(pool, {
    tenantId,
    periodLabel: periodLabel ?? undefined,
    eventType: 'evidence_link',
    deterministicFlagSnapshot: {
      reconId,
      evidenceId: record.id,
      linkId: link.id,
      hashSha256,
    },
    createdBy: input.attachedBy,
  });

  return {
    evidenceId: record.id,
    linkId: link.id,
  };
}

/** List evidence attachments for a reconciliation. */
export async function listEvidenceForReconciliation(
  pool: Pool,
  tenantId: string,
  reconId: string
): Promise<Array<{ evidenceId: string; linkId: string; hashSha256: string; sizeBytes: number; originalFilename?: string; attachedBy: string; attachedAt: string }>> {
  const items = await listEvidenceForObject(pool, tenantId, 'reconciliation', reconId);
  return items.map((e) => ({
    evidenceId: e.id,
    linkId: e.link.id,
    hashSha256: e.hashSha256,
    sizeBytes: e.sizeBytes,
    originalFilename: e.originalFilename,
    attachedBy: e.attachedBy,
    attachedAt: e.attachedAt,
  }));
}
