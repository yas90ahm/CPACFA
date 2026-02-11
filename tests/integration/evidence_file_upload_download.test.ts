/**
 * Integration: Evidence file upload and download.
 * - Upload via POST /journal-entries/:id/evidence/upload (multipart)
 * - Download via GET /journal-entries/:jeId/evidence/:evidenceId/download
 * - SHA-256 matches after round-trip
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { createHash } from 'crypto';
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

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'evidence-file-tenant';

function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

describe('Evidence file upload and download', () => {
  let authToken: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    process.env.STORAGE_ADAPTER = 'local';
    process.env.EVIDENCE_STORAGE_PATH = process.env.EVIDENCE_STORAGE_PATH ?? './data/evidence-test';
    authToken = getTestAuthTokenWithRole(TEST_TENANT_ID);
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  it('upload evidence via API, download via API, SHA-256 matches', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(TEST_TENANT_ID);

    const session = await closeSessionRepo.insertCloseSession(
      pool,
      `sess-ev-file-${Date.now()}`,
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

    const fileContent = Buffer.from('sample PDF content for evidence round-trip test');
    const expectedHash = computeSha256(fileContent);

    const uploadRes = await request(app)
      .post(`/api/close/journal-entries/${je.id}/evidence/upload`)
      .set('Authorization', `Bearer ${authToken}`)
      .field('assertionType', 'invoice_support')
      .attach('file', fileContent, { filename: 'invoice.pdf' });

    expect(uploadRes.status).toBe(201);
    const { evidenceId } = uploadRes.body;
    expect(evidenceId).toBeDefined();

    const listed = await listEvidenceForJournalEntry(pool, TEST_TENANT_ID, je.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(evidenceId);
    expect(listed[0].hashSha256).toBe(expectedHash);
    expect(listed[0].storagePath).toBeDefined();

    const downloadRes = await request(app)
      .get(`/api/close/journal-entries/${je.id}/evidence/${evidenceId}/download`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(downloadRes.status).toBe(200);
    const downloadedBuffer = Buffer.from(downloadRes.body);
    const actualHash = computeSha256(downloadedBuffer);
    expect(actualHash).toBe(expectedHash);
    expect(downloadedBuffer.equals(fileContent)).toBe(true);
  });

  it('download returns 404 for metadata-only evidence (no storage_path)', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(TEST_TENANT_ID);

    const session = await closeSessionRepo.insertCloseSession(
      pool,
      `sess-ev-meta-${Date.now()}`,
      TEST_TENANT_ID,
      'e1',
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
        { accountRef: 'Cash', debit: 10, credit: 0, amountProvenance: { kind: 'human_entered', enteredBy: 'u' } },
        { accountRef: 'Revenue', debit: 0, credit: 10, amountProvenance: { kind: 'human_entered', enteredBy: 'u' } },
      ],
    });

    const metaRes = await request(app)
      .post(`/api/close/journal-entries/${je.id}/evidence`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        hashSha256: 'meta-only-hash',
        sizeBytes: 100,
        assertionType: 'other',
        attachedBy: 'user@test.com',
      });

    expect(metaRes.status).toBe(201);
    const { evidenceId } = metaRes.body;

    const downloadRes = await request(app)
      .get(`/api/close/journal-entries/${je.id}/evidence/${evidenceId}/download`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(downloadRes.status).toBe(404);
    expect(downloadRes.body?.error).toContain('metadata-only');
  });
});
