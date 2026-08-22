import { createHash, randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { withTransaction } from '../db/transaction.js';
import * as repository from '../db/repositories/close_runbook_repository.js';
import { compileCanadianAspeRunbook } from './runbook_compiler_service.js';
import { parseRunbookFile } from './runbook_file_parser.js';
import { getEntitySettings } from './entity_settings_service.js';
import type { CloseFrequency } from '../types/accounting_close_profile.js';
import type { CloseRunbook } from '../types/close_runbook.js';

export class CloseRunbookError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'RUNBOOK_NOT_FOUND'
      | 'RUNBOOK_NOT_EXECUTABLE'
      | 'RUNBOOK_ALREADY_APPROVED'
      | 'INVALID_RUNBOOK_INPUT'
  ) {
    super(message);
    this.name = 'CloseRunbookError';
  }
}

export async function compileAndSaveRunbook(
  pool: Pool,
  input: {
    tenantId: string;
    entityId: string;
    name: string;
    frequency: CloseFrequency;
    filename: string;
    mimeType: string;
    buffer: Buffer;
    createdBy: string;
  }
): Promise<CloseRunbook> {
  const name = input.name.trim();
  const entityId = input.entityId.trim();
  if (!name || !entityId || input.buffer.byteLength === 0) {
    throw new CloseRunbookError('Runbook name, entity, and a non-empty file are required.', 'INVALID_RUNBOOK_INPUT');
  }
  if (input.buffer.byteLength > 10 * 1024 * 1024) {
    throw new CloseRunbookError('Runbook file must be 10 MB or smaller.', 'INVALID_RUNBOOK_INPUT');
  }

  const entitySettings = await getEntitySettings(pool, input.tenantId, entityId);
  if (entitySettings.functionalCurrency.toUpperCase() !== 'CAD') {
    throw new CloseRunbookError(
      `Canadian ASPE runbooks require entity ${entityId} to use CAD as its functional currency.`,
      'INVALID_RUNBOOK_INPUT'
    );
  }

  let parsed;
  try {
    parsed = await parseRunbookFile({
      buffer: input.buffer,
      filename: input.filename,
      mimeType: input.mimeType,
    });
  } catch (error) {
    throw new CloseRunbookError(
      error instanceof Error ? error.message : 'The runbook file could not be parsed.',
      'INVALID_RUNBOOK_INPUT'
    );
  }
  const compiledPlan = compileCanadianAspeRunbook({ parsed, frequency: input.frequency });
  const sourceSha256 = createHash('sha256').update(input.buffer).digest('hex');

  return withTransaction(pool, async (client) => {
    const active = await repository.getActiveRunbook(
      client,
      input.tenantId,
      entityId,
      input.frequency
    );
    const version = await repository.nextRunbookVersion(client, input.tenantId, entityId, name);
    return repository.insertDraftRunbook(client, {
      id: randomUUID(),
      tenantId: input.tenantId,
      entityId,
      name,
      version,
      frequency: input.frequency,
      profileId: compiledPlan.profileId,
      sourceFilename: input.filename,
      sourceFormat: parsed.format,
      sourceMimeType: input.mimeType,
      sourceSha256,
      sourceContent: input.buffer,
      sourceRowCount: parsed.sourceRowCount,
      compiledPlan,
      createdBy: input.createdBy,
      supersedesRunbookId: active?.id,
    });
  });
}

export async function approveAndActivateRunbook(
  pool: Pool,
  tenantId: string,
  runbookId: string,
  approvedBy: string
): Promise<CloseRunbook> {
  return withTransaction(pool, async (client) => {
    const runbook = await repository.getRunbook(client, tenantId, runbookId);
    if (!runbook) throw new CloseRunbookError('Close runbook not found.', 'RUNBOOK_NOT_FOUND');
    if (runbook.status !== 'draft') {
      throw new CloseRunbookError('Only a draft runbook can be approved.', 'RUNBOOK_ALREADY_APPROVED');
    }
    const blockingIssues = runbook.compiledPlan.issues.filter((issue) => issue.severity === 'error');
    if (!runbook.compiledPlan.executable || blockingIssues.length > 0 || runbook.compiledPlan.coverage.uncovered.length > 0) {
      throw new CloseRunbookError(
        `Runbook cannot be approved: ${blockingIssues.map((issue) => issue.message).join('; ') || 'mandatory controls are uncovered'}`,
        'RUNBOOK_NOT_EXECUTABLE'
      );
    }
    const approved = await repository.activateRunbook(client, tenantId, runbookId, approvedBy);
    if (!approved) throw new CloseRunbookError('Runbook approval did not persist.', 'RUNBOOK_NOT_FOUND');
    return approved;
  });
}

export const getRunbook = repository.getRunbook;
export const listRunbooks = repository.listRunbooks;
export const getActiveRunbook = repository.getActiveRunbook;
