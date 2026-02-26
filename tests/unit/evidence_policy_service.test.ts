/**
 * Unit tests for evidence policy service (Phase 2A).
 * Uses jest.mock for repository mocks.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockGetEvidencePolicy = jest.fn();
const mockListJournalEntries = jest.fn();
const mockListJournalEntryLines = jest.fn();
const mockListAssertionTypesByJournalEntryForSession = jest.fn();

jest.mock('../../src/db/repositories/evidence_policy_repository.js', () => ({
  getEvidencePolicy: (...args: unknown[]) => mockGetEvidencePolicy(...args),
  upsertEvidencePolicy: jest.fn(),
}));
jest.mock('../../src/db/repositories/journal_entry_repository.js', () => ({
  listJournalEntries: (...args: unknown[]) => mockListJournalEntries(...args),
  listJournalEntryLines: (...args: unknown[]) => mockListJournalEntryLines(...args),
}));
jest.mock('../../src/db/repositories/evidence_repository.js', () => ({
  listAssertionTypesByJournalEntryForSession: (...args: unknown[]) =>
    mockListAssertionTypesByJournalEntryForSession(...args),
}));

import {
  checkEvidencePolicyForCertification,
  computeEvidenceSummary,
} from '../../src/services/evidence_policy_service.js';

describe('Evidence policy service', () => {
  const pool = {} as import('pg').Pool;
  const tenantId = 't1';
  const closeSessionId = 's1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no policy → returns empty blockers and warnings', async () => {
    mockGetEvidencePolicy.mockResolvedValue(null as never);
    const result = await checkEvidencePolicyForCertification(pool, tenantId, closeSessionId);
    expect(result.hardBlockers).toHaveLength(0);
    expect(result.softWarnings).toHaveLength(0);
  });

  it('policy off → returns empty', async () => {
    mockGetEvidencePolicy.mockResolvedValue({ enforcementMode: 'off' } as never);
    const result = await checkEvidencePolicyForCertification(pool, tenantId, closeSessionId);
    expect(result.hardBlockers).toHaveLength(0);
    expect(result.softWarnings).toHaveLength(0);
  });

  it('hard_block, material JE without required assertion → adds hard blocker', async () => {
    mockGetEvidencePolicy.mockResolvedValue({
      enforcementMode: 'hard_block',
      materialityThreshold: '1000',
      requiredAssertionTypes: { manual_entry: ['approval'] },
    } as never);
    mockListJournalEntries.mockResolvedValue([{ id: 'je1', source: 'manual' }] as never);
    mockListJournalEntryLines.mockResolvedValue([
      { debit: 5000, credit: 0 },
      { debit: 0, credit: 5000 },
    ] as never);
    mockListAssertionTypesByJournalEntryForSession.mockResolvedValue(new Map() as never);
    const result = await checkEvidencePolicyForCertification(pool, tenantId, closeSessionId);
    expect(result.hardBlockers.length).toBeGreaterThan(0);
    expect(result.hardBlockers[0].code).toBe('EVIDENCE_REQUIRED');
    expect(result.softWarnings).toHaveLength(0);
  });

  it('hard_block, material JE with correct evidence → no blockers', async () => {
    mockGetEvidencePolicy.mockResolvedValue({
      enforcementMode: 'hard_block',
      materialityThreshold: '1000',
      requiredAssertionTypes: { manual_entry: ['approval'] },
    } as never);
    mockListJournalEntries.mockResolvedValue([{ id: 'je1', source: 'manual' }] as never);
    mockListJournalEntryLines.mockResolvedValue([
      { debit: 5000, credit: 0 },
      { debit: 0, credit: 5000 },
    ] as never);
    mockListAssertionTypesByJournalEntryForSession.mockResolvedValue(
      new Map([['je1', ['approval']]]) as never
    );
    const result = await checkEvidencePolicyForCertification(pool, tenantId, closeSessionId);
    expect(result.hardBlockers).toHaveLength(0);
    expect(result.softWarnings).toHaveLength(0);
  });

  it('warn_only, material JE without assertion → adds soft warning only', async () => {
    mockGetEvidencePolicy.mockResolvedValue({
      enforcementMode: 'warn_only',
      materialityThreshold: '1000',
      requiredAssertionTypes: { manual_entry: ['approval'] },
    } as never);
    mockListJournalEntries.mockResolvedValue([{ id: 'je1', source: 'manual' }] as never);
    mockListJournalEntryLines.mockResolvedValue([
      { debit: 5000, credit: 0 },
      { debit: 0, credit: 5000 },
    ] as never);
    mockListAssertionTypesByJournalEntryForSession.mockResolvedValue(new Map() as never);
    const result = await checkEvidencePolicyForCertification(pool, tenantId, closeSessionId);
    expect(result.hardBlockers).toHaveLength(0);
    expect(result.softWarnings.length).toBeGreaterThan(0);
  });
});

describe('Evidence visibility (Phase 2D) — computeEvidenceSummary', () => {
  const pool = {} as import('pg').Pool;
  const tenantId = 't1';
  const closeSessionId = 's1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('A) No policy → evidenceSummary.enforcementMode = "off"', async () => {
    mockGetEvidencePolicy.mockResolvedValue(null as never);
    mockListJournalEntries.mockResolvedValue([{ id: 'je1', source: 'manual' }] as never);
    mockListJournalEntryLines.mockResolvedValue([
      { debit: 5000, credit: 0 },
      { debit: 0, credit: 5000 },
    ] as never);
    mockListAssertionTypesByJournalEntryForSession.mockResolvedValue(new Map() as never);

    const summary = await computeEvidenceSummary(pool, tenantId, closeSessionId);
    expect(summary.enforcementMode).toBe('off');
    expect(summary.missingEvidenceDetails).toHaveLength(0);
    expect(summary.totalJournalEntries).toBe(1);
  });

  it('B) Hard-block policy + missing evidence → journalEntriesMissingRequiredEvidence > 0', async () => {
    mockGetEvidencePolicy.mockResolvedValue({
      enforcementMode: 'hard_block',
      materialityThreshold: '1000',
      requiredAssertionTypes: { manual_entry: ['approval'] },
    } as never);
    mockListJournalEntries.mockResolvedValue([{ id: 'je1', source: 'manual' }] as never);
    mockListJournalEntryLines.mockResolvedValue([
      { debit: 5000, credit: 0 },
      { debit: 0, credit: 5000 },
    ] as never);
    mockListAssertionTypesByJournalEntryForSession.mockResolvedValue(new Map() as never);

    const summary = await computeEvidenceSummary(pool, tenantId, closeSessionId);
    expect(summary.enforcementMode).toBe('hard_block');
    expect(summary.journalEntriesMissingRequiredEvidence).toBeGreaterThan(0);
    expect(summary.missingEvidenceDetails.length).toBeGreaterThan(0);
    expect(summary.missingEvidenceDetails[0].journalEntryId).toBe('je1');
    expect(summary.missingEvidenceDetails[0].requiredAssertionTypes).toContain('approval');
    expect(summary.missingEvidenceDetails[0].amount).toMatch(/^\d+\.\d{2}$/);
  });

  it('C) Hard-block policy + correct evidence → missing = 0', async () => {
    mockGetEvidencePolicy.mockResolvedValue({
      enforcementMode: 'hard_block',
      materialityThreshold: '1000',
      requiredAssertionTypes: { manual_entry: ['approval'] },
    } as never);
    mockListJournalEntries.mockResolvedValue([{ id: 'je1', source: 'manual' }] as never);
    mockListJournalEntryLines.mockResolvedValue([
      { debit: 5000, credit: 0 },
      { debit: 0, credit: 5000 },
    ] as never);
    mockListAssertionTypesByJournalEntryForSession.mockResolvedValue(
      new Map([['je1', ['approval']]]) as never
    );

    const summary = await computeEvidenceSummary(pool, tenantId, closeSessionId);
    expect(summary.enforcementMode).toBe('hard_block');
    expect(summary.journalEntriesMissingRequiredEvidence).toBe(0);
    expect(summary.missingEvidenceDetails).toHaveLength(0);
  });
});
