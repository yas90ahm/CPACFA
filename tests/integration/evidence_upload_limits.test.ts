/**
 * Evidence file upload limits: size and type enforcement.
 * POST /api/close/journal-entries/:id/attachments (multer).
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthToken } from '../helpers/testHelpers.js';
import {
  isDbConfigured,
  getTenantPool,
  queryControl,
} from '../../src/db/index.js';
import { createDraftJE } from '../../src/services/journal_entry_service.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'evidence-upload-limits-tenant';
const ENTITY_ID = `entity-upload-limits-${Date.now()}`;
const MB = 1024 * 1024;

/** Minimal valid PDF header (PDF magic bytes) */
const PDF_HEADER = Buffer.from('%PDF-1.4\n', 'utf8');

function makePdfBuffer(sizeBytes: number): Buffer {
  const buf = Buffer.alloc(sizeBytes);
  PDF_HEADER.copy(buf);
  return buf;
}

describe('Evidence upload limits', () => {
  let authToken: string;
  let jeId: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    authToken = getTestAuthToken(TEST_TENANT_ID);
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
    const pool = await getTenantPool(TEST_TENANT_ID);
    const session = await closeSessionRepo.insertCloseSession(
      pool,
      `sess-upload-limits-${Date.now()}`,
      TEST_TENANT_ID,
      ENTITY_ID,
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
    jeId = je.id;
  });

  it('1. Upload 1MB PDF → Should succeed', async () => {
    if (!isDbConfigured() || !jeId) return;
    const buf = makePdfBuffer(1 * MB);
    const res = await request(app)
      .post(`/api/close/journal-entries/${jeId}/attachments`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .attach('file', buf, { filename: 'evidence.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.fileRef).toBeDefined();
  });

  it('2. Upload 20MB PDF → Should succeed (current limit)', async () => {
    if (!isDbConfigured() || !jeId) return;
    // Multer limit is 20MB; use 19MB to stay safely under
    const buf = makePdfBuffer(19 * MB);
    const res = await request(app)
      .post(`/api/close/journal-entries/${jeId}/attachments`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .attach('file', buf, { filename: 'large.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it('3. Upload 21MB PDF → Should reject with 413 Payload Too Large', async () => {
    if (!isDbConfigured() || !jeId) return;
    const res = await request(app)
      .post(`/api/close/journal-entries/${jeId}/attachments`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Length', String(21 * MB))
      .send();
    expect(res.status).toBe(413);
    expect(res.body?.message || res.body?.error).toMatch(/file too large|maximum.*20/i);
  });

  it('4. Oversized Content-Length → Reject immediately (before body read)', async () => {
    if (!isDbConfigured() || !jeId) return;
    const res = await request(app)
      .post(`/api/close/journal-entries/${jeId}/attachments`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Length', String(100 * MB))
      .send();
    expect(res.status).toBe(413);
    expect(res.body?.message || res.body?.error).toMatch(/file too large|maximum.*20/i);
  });

  it('5. Upload non-PDF file (.exe) → Should reject', async () => {
    if (!isDbConfigured() || !jeId) return;
    const buf = Buffer.from('MZ');
    const res = await request(app)
      .post(`/api/close/journal-entries/${jeId}/attachments`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .attach('file', buf, { filename: 'malicious.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(400);
    expect(res.body?.error).toMatch(/allowed|pdf|attachment/i);
  });
});
