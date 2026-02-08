/**
 * Integration: Evidence repository — create, link, list.
 * Skips when DATABASE_URL not set.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  isDbConfigured,
  getTenantPool,
  queryControl,
} from '../../src/db/index.js';
import {
  createEvidenceRecord,
  linkEvidenceToJournalEntry,
  listEvidenceForJournalEntry,
  listEvidenceForCloseSession,
} from '../../src/db/repositories/evidence_repository.js';
import { createDraftJE } from '../../src/services/journal_entry_service.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'evidence-repo-tenant';

describe('Evidence repository', () => {
  beforeAll(async () => {
    if (!isDbConfigured()) return;
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  it('createEvidenceRecord inserts and returns record', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(TEST_TENANT_ID);
    const record = await createEvidenceRecord(pool, TEST_TENANT_ID, {
      hashSha256: 'abc123def456',
      sizeBytes: 1024,
      mimeType: 'application/pdf',
      externalUri: 'https://drive.example.com/file/1',
      externalProvider: 'google_drive',
      label: 'Invoice PDF',
      attachedBy: 'user@test.com',
    });
    expect(record.id).toBeDefined();
    expect(record.tenantId).toBe(TEST_TENANT_ID);
    expect(record.hashSha256).toBe('abc123def456');
    expect(record.sizeBytes).toBe(1024);
    expect(record.mimeType).toBe('application/pdf');
    expect(record.externalUri).toBe('https://drive.example.com/file/1');
    expect(record.attachedBy).toBe('user@test.com');
    expect(record.integrityVersion).toBe('v1');
  });

  it('linkEvidenceToJournalEntry and listEvidenceForJournalEntry', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(TEST_TENANT_ID);

    const session = await closeSessionRepo.insertCloseSession(
      pool,
      `sess-evidence-${Date.now()}`,
      TEST_TENANT_ID,
      'e1',
      '2025-01-01',
      '2025-01-31',
      'accrual',
      'GAAP',
      'draft'
    );
    const je = await createDraftJE(pool, {
      closeSessionId: session.id,
      tenantId: TEST_TENANT_ID,
      source: 'manual',
      createdBy: 'user@test.com',
      lines: [
        { accountRef: 'Cash', debit: 100, credit: 0, amountProvenance: { kind: 'human_entered', enteredBy: 'u' } },
        { accountRef: 'Revenue', debit: 0, credit: 100, amountProvenance: { kind: 'human_entered', enteredBy: 'u' } },
      ],
    });

    const record = await createEvidenceRecord(pool, TEST_TENANT_ID, {
      hashSha256: 'hash789',
      sizeBytes: 512,
      attachedBy: 'user@test.com',
    });
    const link = await linkEvidenceToJournalEntry(pool, TEST_TENANT_ID, {
      evidenceId: record.id,
      objectType: 'journal_entry',
      objectId: je.id,
      role: 'support',
      requiredness: 'optional',
      createdBy: 'user@test.com',
    });
    expect(link.id).toBeDefined();
    expect(link.evidenceId).toBe(record.id);
    expect(link.objectId).toBe(je.id);
    expect(link.objectType).toBe('journal_entry');

    const listed = await listEvidenceForJournalEntry(pool, TEST_TENANT_ID, je.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(record.id);
    expect(listed[0].link.objectId).toBe(je.id);
  });

  it('listEvidenceForCloseSession returns evidence for JEs in session', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(TEST_TENANT_ID);

    const session = await closeSessionRepo.insertCloseSession(
      pool,
      `sess-evidence-2-${Date.now()}`,
      TEST_TENANT_ID,
      'e1',
      '2025-02-01',
      '2025-02-28',
      'accrual',
      'GAAP',
      'draft'
    );
    const je = await createDraftJE(pool, {
      closeSessionId: session.id,
      tenantId: TEST_TENANT_ID,
      source: 'manual',
      createdBy: 'user@test.com',
      lines: [
        { accountRef: 'Cash', debit: 50, credit: 0, amountProvenance: { kind: 'human_entered', enteredBy: 'u' } },
        { accountRef: 'Expense', debit: 0, credit: 50, amountProvenance: { kind: 'human_entered', enteredBy: 'u' } },
      ],
    });

    const record = await createEvidenceRecord(pool, TEST_TENANT_ID, {
      hashSha256: 'hash-session',
      sizeBytes: 256,
      attachedBy: 'user@test.com',
    });
    await linkEvidenceToJournalEntry(pool, TEST_TENANT_ID, {
      evidenceId: record.id,
      objectId: je.id,
      role: 'support',
      createdBy: 'user@test.com',
    });

    const listed = await listEvidenceForCloseSession(pool, TEST_TENANT_ID, session.id);
    expect(listed.length).toBeGreaterThanOrEqual(1);
    expect(listed.some((e) => e.id === record.id)).toBe(true);
  });
});
