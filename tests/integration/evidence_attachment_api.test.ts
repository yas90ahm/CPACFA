/**
 * Integration: Evidence attachment API — POST /api/close/journal-entries/:id/evidence
 * Skips when DATABASE_URL not set.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import {
  isDbConfigured,
  getTenantPool,
  queryControl,
} from '../../src/db/index.js';
import { createDraftJE } from '../../src/services/journal_entry_service.js';
import { listEvidenceForJournalEntry } from '../../src/db/repositories/evidence_repository.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';
import * as periodLockRepo from '../../src/db/repositories/period_lock_repository.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? `evidence-api-tenant-${Date.now()}`;

describe('Evidence attachment API', () => {
  let authToken: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    authToken = getTestAuthTokenWithRole(TEST_TENANT_ID);
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  it('can attach evidence for a JE in draft session', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(TEST_TENANT_ID);

    const session = await closeSessionRepo.insertCloseSession(
      pool,
      `sess-evidence-api-${Date.now()}`,
      TEST_TENANT_ID,
      `e1-attach-${Date.now()}`,
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

    const res = await request(app)
      .post(`/api/close/journal-entries/${je.id}/evidence`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        hashSha256: 'abc123hash',
        sizeBytes: 2048,
        assertionType: 'bank_support',
        mimeType: 'application/pdf',
        externalUri: 'https://drive.example.com/file/1',
        label: 'Bank statement March',
        role: 'support',
        requiredness: 'optional',
        attachedBy: 'user@test.com',
      });

    expect(res.status).toBe(201);
    expect(res.body.evidenceId).toBeDefined();
    expect(res.body.linkId).toBeDefined();
  });

  it('cannot attach evidence after lock (409)', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(TEST_TENANT_ID);

    const session = await closeSessionRepo.insertCloseSession(
      pool,
      `sess-evidence-lock-${Date.now()}`,
      TEST_TENANT_ID,
      `e1-lock-${Date.now()}`,
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

    const periodLabel = '2025-02';
    await periodLockRepo.lockPeriod(pool, TEST_TENANT_ID, periodLabel, 'locker', 'Test lock');

    const res = await request(app)
      .post(`/api/close/journal-entries/${je.id}/evidence`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        hashSha256: 'hash-after-lock',
        sizeBytes: 1024,
        assertionType: 'other',
        attachedBy: 'user@test.com',
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PERIOD_LOCKED');
    expect(res.body.error).toContain('locked');
  });

  it('evidence record + link exists in DB after attach', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(TEST_TENANT_ID);

    const session = await closeSessionRepo.insertCloseSession(
      pool,
      `sess-evidence-db-${Date.now()}`,
      TEST_TENANT_ID,
      `e1-db-${Date.now()}`,
      '2025-03-01',
      '2025-03-31',
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
        { accountRef: 'Cash', debit: 200, credit: 0, amountProvenance: { kind: 'human_entered', enteredBy: 'u' } },
        { accountRef: 'Revenue', debit: 0, credit: 200, amountProvenance: { kind: 'human_entered', enteredBy: 'u' } },
      ],
    });

    const res = await request(app)
      .post(`/api/close/journal-entries/${je.id}/evidence`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        hashSha256: 'hash-db-check',
        sizeBytes: 4096,
        assertionType: 'invoice_support',
        attachedBy: 'user@test.com',
      });

    expect(res.status).toBe(201);
    const { evidenceId, linkId } = res.body;

    const listed = await listEvidenceForJournalEntry(pool, TEST_TENANT_ID, je.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(evidenceId);
    expect(listed[0].link.id).toBe(linkId);
    expect(listed[0].hashSha256).toBe('hash-db-check');
    expect(listed[0].sizeBytes).toBe(4096);
  });
});
