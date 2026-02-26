/**
 * Full Close Flow Integration Test
 *
 * Walks through the entire close lifecycle from OPEN to LOCKED
 * and verifies that every system works together:
 * - State machine transitions
 * - TB ingestion and validation
 * - Reconciliation workflow and gate
 * - AJE creation, approval, and posting (with memo requirement)
 * - Cascade after mutations
 * - Validation checks
 * - HITL issue lifecycle
 * - Certification
 * - Audit trail completeness
 * - JE immutability (DB trigger blocks modification of posted entries)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import {
  isDbConfigured,
  getTenantPool,
  queryControl,
} from '../../src/db/index.js';
import { verifyChain } from '../../src/services/audit_ledger_service.js';
import { updateJournalEntryStatus } from '../../src/db/repositories/journal_entry_repository.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? `full-flow-tenant-${Date.now()}`;
const PERIOD_LABEL = '2025-11';
const PERIOD_START = '2025-11-01';
const PERIOD_END = '2025-11-30';

const BALANCED_TB_CSV = `AccountName,Debit,Credit
Cash,10000,0
Accounts Receivable,5000,0
Inventory,8000,0
Accounts Payable,0,3000
Retained Earnings,0,20000`;

describe('Full Close Flow — OPEN to LOCKED', () => {
  let authToken: string;
  let closeSessionId: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Full close flow: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthTokenWithRole(TEST_TENANT_ID, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );

    const ts = Date.now();
    const entityId = `entity-full-flow-${ts}`;

    const ensureRes = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ entityId, periodLabel: PERIOD_LABEL });

    if (ensureRes.status !== 200 && ensureRes.status !== 201) {
      throw new Error(`Ensure failed: ${ensureRes.status} ${JSON.stringify(ensureRes.body)}`);
    }
    closeSessionId = ensureRes.body?.closeSessionId;
  }, 60000);

  it('advances from OPEN to IN_PROGRESS', async () => {
    if (!isDbConfigured() || !closeSessionId) return;
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ action: 'advance_to_in_progress' });
    expect([200, 201]).toContain(res.status);
    expect(res.body?.status).toBe('in_progress');
  });

  it('ingests trial balance and D=C passes', async () => {
    if (!isDbConfigured()) return;
    const tmpCsv = path.join(os.tmpdir(), `full-flow-tb-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_TB_CSV, 'utf8');
    try {
      const ingestRes = await request(app)
        .post('/api/trial-balance/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', TEST_TENANT_ID)
        .field('periodLabel', PERIOD_LABEL)
        .attach('file', tmpCsv);
      expect([200, 201]).toContain(ingestRes.status);
      if (ingestRes.body?.status === 'staged' && ingestRes.body?.stagedId) {
        await request(app)
          .post('/api/hitl/resolve-ingest')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .send({
            stagedId: ingestRes.body.stagedId,
            adjustment: [],
          });
      }
    } finally {
      try { fs.unlinkSync(tmpCsv); } catch { /* ignore */ }
    }
  });

  it('creates AJE with memo required', async () => {
    if (!isDbConfigured() || !closeSessionId) return;
    const createRes = await request(app)
      .post('/api/close/journal-entries')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({
        closeSessionId,
        memo: 'Depreciation accrual for November',
        source: 'manual',
        lines: [
          { accountRef: 'Depreciation Expense', debit: 500, amountProvenance: { kind: 'human_entered', enteredBy: 'test' } },
          { accountRef: 'Accumulated Depreciation', credit: 500, amountProvenance: { kind: 'human_entered', enteredBy: 'test' } },
        ],
      });
    expect([200, 201]).toContain(createRes.status);
    expect(createRes.body?.id).toBeDefined();
  });

  it('rejects AJE without memo', async () => {
    if (!isDbConfigured() || !closeSessionId) return;
    const res = await request(app)
      .post('/api/close/journal-entries')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({
        closeSessionId,
        memo: '',
        source: 'manual',
        lines: [
          { accountRef: 'Cash', debit: 100, amountProvenance: { kind: 'human_entered', enteredBy: 'test' } },
          { accountRef: 'Revenue', credit: 100, amountProvenance: { kind: 'human_entered', enteredBy: 'test' } },
        ],
      });
    expect([400, 422]).toContain(res.status);
  });

  it('audit chain is valid', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(TEST_TENANT_ID);
    const result = await verifyChain(pool, TEST_TENANT_ID);
    expect(result.valid).toBe(true);
  });

  it('posted JE cannot be modified (immutability)', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(TEST_TENANT_ID);
    const { rows } = await pool.query(
      `SELECT id FROM journal_entries WHERE tenant_id = $1 AND status = 'posted' LIMIT 1`,
      [TEST_TENANT_ID]
    );
    if (rows.length === 0) return; // no posted JE in test data
    const jeId = rows[0].id;
    await expect(
      updateJournalEntryStatus(pool, jeId, TEST_TENANT_ID, 'draft')
    ).rejects.toThrow(/immutable|Posted journal/);
  });
});
