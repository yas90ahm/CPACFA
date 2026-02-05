/**
 * Justification service — durable IRAC linked to approved adjustment and posted JE.
 * Tests: createJustification stores; getJustificationsForPeriod reads; ensureJustificationForPostedJE auto-creates minimal memo.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import {
  createJustification,
  getJustificationsForPeriod,
  ensureJustificationForPostedJE,
} from '../../src/services/justification_service.js';
import * as justificationsRepo from '../../src/db/repositories/tenant_justifications_repository.js';
import * as db from '../../src/db/index.js';

const mockPool = {} as Pool;

describe('justification_service — createJustification', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('stores justification in DB when pool and tenantId provided', async () => {
    jest.spyOn(db, 'isDbConfigured').mockReturnValue(true);
    jest.spyOn(justificationsRepo, 'createJustification').mockResolvedValue({
      id: 'uuid-1',
      createdAt: '2025-01-15T12:00:00Z',
    });

    const result = await createJustification({
      tenantId: 't1',
      pool: mockPool,
      periodLabel: '2025-01',
      relatedType: 'hitl_staging',
      relatedId: 'hitl-1',
      memoMarkdown: 'Approved adjustment: reclass per TB row.',
      createdBy: 'user-1',
      createdByType: 'user',
    });

    expect(result.id).toBe('uuid-1');
    expect(result.createdAt).toBe('2025-01-15T12:00:00Z');
    expect(justificationsRepo.createJustification).toHaveBeenCalledWith(mockPool, expect.objectContaining({
      tenantId: 't1',
      periodLabel: '2025-01',
      relatedType: 'hitl_staging',
      relatedId: 'hitl-1',
      memoMarkdown: 'Approved adjustment: reclass per TB row.',
      createdBy: 'user-1',
      createdByType: 'user',
    }));
  });
});

describe('justification_service — getJustificationsForPeriod', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns justifications from DB when pool and tenantId provided', async () => {
    jest.spyOn(db, 'isDbConfigured').mockReturnValue(true);
    const rows = [
      {
        id: 'uuid-1',
        tenant_id: 't1',
        period_label: '2025-01',
        related_type: 'journal_entry',
        related_id: 'je-1',
        created_by: 'user-1',
        created_by_type: 'user',
        irac_json: { irac: { issue: 'JE posted', rule: '', analysis: '', conclusion: '', source: '' }, sourceTag: '', formatted: 'JE posted.' },
        memo_markdown: 'Journal entry posted. Approved by user-1.',
        prompt_version: null,
        model: null,
        inputs_hash: null,
        created_at: '2025-01-15T12:00:00Z',
      },
    ];
    jest.spyOn(justificationsRepo, 'listJustificationsForPeriodRange').mockResolvedValue(rows);

    const list = await getJustificationsForPeriod('2025-01-01', '2025-01-31', 't1', mockPool);

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('uuid-1');
    expect(list[0].question).toContain('Journal entry posted');
    expect(list[0].response.irac.issue).toBe('JE posted');
  });
});

describe('justification_service — ensureJustificationForPostedJE', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('creates minimal memo when no justification exists for JE (auto-generate policy)', async () => {
    jest.spyOn(db, 'isDbConfigured').mockReturnValue(true);
    jest.spyOn(justificationsRepo, 'getJustificationByRelated').mockResolvedValue(null);
    jest.spyOn(justificationsRepo, 'createJustification').mockResolvedValue({
      id: 'uuid-new',
      createdAt: '2025-01-15T12:00:00Z',
    });

    const result = await ensureJustificationForPostedJE(
      mockPool,
      't1',
      'je-1',
      '2025-01',
      'approver-1'
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe('uuid-new');
    expect(justificationsRepo.getJustificationByRelated).toHaveBeenCalledWith(mockPool, 't1', 'journal_entry', 'je-1');
    expect(justificationsRepo.createJustification).toHaveBeenCalledWith(mockPool, expect.objectContaining({
      tenantId: 't1',
      periodLabel: '2025-01',
      relatedType: 'journal_entry',
      relatedId: 'je-1',
      createdBy: 'approver-1',
      createdByType: 'user',
      memoMarkdown: 'Journal entry posted. Approved by approver-1.',
    }));
  });

  it('returns existing justification when one already exists for JE', async () => {
    jest.spyOn(db, 'isDbConfigured').mockReturnValue(true);
    jest.spyOn(justificationsRepo, 'getJustificationByRelated').mockResolvedValue({
      id: 'uuid-existing',
      tenant_id: 't1',
      period_label: '2025-01',
      related_type: 'journal_entry',
      related_id: 'je-1',
      created_by: 'user-1',
      created_by_type: 'user',
      irac_json: null,
      memo_markdown: 'Already had memo',
      prompt_version: null,
      model: null,
      inputs_hash: null,
      created_at: '2025-01-14T00:00:00Z',
    });
    jest.spyOn(justificationsRepo, 'createJustification').mockResolvedValue({ id: 'x', createdAt: 'x' });

    const result = await ensureJustificationForPostedJE(mockPool, 't1', 'je-1', '2025-01', 'approver-1');

    expect(result).toEqual({ id: 'uuid-existing', createdAt: '2025-01-14T00:00:00Z' });
    expect(justificationsRepo.createJustification).not.toHaveBeenCalled();
  });
});
