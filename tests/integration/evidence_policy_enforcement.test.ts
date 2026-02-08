/**
 * Evidence Anchoring Phase 2A — policy enforcement tests.
 *
 * A) No policy → certification succeeds without evidence.
 * B) Warn-only policy → certification succeeds but warnings present.
 * C) Hard-block policy: JE above threshold without required assertion → 422 NOT_READY.
 * D) Hard-block policy: JE with correct evidence → certification succeeds.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import { isDbConfigured, queryControl } from '../../src/db/index.js';

const ENTITY_ID = 'entity-evidence-policy';

// Imbalanced TB: debits 5000, credits 5000 (actually balanced). Use staging flow then resolve.
// For simplicity: use imbalanced so we get staged, then resolve to balanced.
const IMBALANCED_TB_CSV = `AccountName,Debit,Credit
Cash,5000,0
Revenue,0,0
Equity,0,0`;

describe('Evidence policy enforcement', () => {
  let authToken: string;
  let testTenantId: string;
  let closeSessionId: string;
  let materialJeId: string;
  const ingestPath =
    process.env.NODE_ENV === 'production'
      ? '/api/trial-balance/ingest'
      : '/api-dev/trial-balance/ingest';

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Evidence policy: DATABASE_URL not set; skipping.');
      return;
    }
    testTenantId = process.env.TEST_TENANT_ID ?? `evidence-policy-tenant-${Date.now()}`;
    authToken = getTestAuthTokenWithRole(testTenantId, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [testTenantId, `Test ${testTenantId}`]
    );
  });

  async function setupSessionWithMaterialJE(periodLabel: string): Promise<void> {
    if (!isDbConfigured()) return;

    // Ingest imbalanced TB → staged
    const prevMock = process.env.AI_MOCK_CLASSIFIER;
    process.env.AI_MOCK_CLASSIFIER = 'true';
    const ingestRes = await request(app)
      .post(ingestPath)
      .set('Authorization', `Bearer ${authToken}`)
      .field('tenantId', testTenantId)
      .field('periodLabel', periodLabel)
      .attach('file', Buffer.from(IMBALANCED_TB_CSV), 'tb.csv');
    if (prevMock !== undefined) process.env.AI_MOCK_CLASSIFIER = prevMock;
    else delete process.env.AI_MOCK_CLASSIFIER;
    expect(ingestRes.status).toBe(200);
    expect(ingestRes.body?.status).toBe('staged');
    expect(ingestRes.body?.stagedId).toBeDefined();
    // Resolve with Retained Earnings to balance
    const resolveRes = await request(app)
      .post('/api/hitl/resolve-ingest')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        stagedId: ingestRes.body.stagedId,
        adjustment: [
          { accountName: 'Retained Earnings', debit: 0, credit: 5000, amountProvenance: { kind: 'human_entered' as const, enteredBy: 'test' } },
        ],
      });
    expect(resolveRes.status).toBe(200);

    const [y, m] = periodLabel.split('-').map(Number);
    const periodStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const periodEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const createRes = await request(app)
      .post('/api/close/sessions')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        entityId: ENTITY_ID,
        periodStart,
        periodEnd,
        basis: 'accrual',
      });
    expect([200, 201]).toContain(createRes.status);
    closeSessionId = createRes.body.id;

    // Create material JE (amount 5000 >= 1000 threshold)
    const jeRes = await request(app)
      .post('/api/close/journal-entries')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        closeSessionId,
        source: 'manual',
        lines: [
          {
            accountRef: 'Cash',
            debit: 5000,
            credit: 0,
            amountProvenance: { kind: 'human_entered', enteredBy: 'test-user' },
          },
          {
            accountRef: 'Revenue',
            debit: 0,
            credit: 5000,
            amountProvenance: { kind: 'human_entered', enteredBy: 'test-user' },
          },
        ],
      });
    expect([200, 201]).toContain(jeRes.status);
    materialJeId = jeRes.body?.id;
    expect(materialJeId).toBeDefined();

    // Propose, approve, post
    await request(app)
      .post(`/api/close/journal-entries/${materialJeId}/propose`)
      .set('Authorization', `Bearer ${authToken}`);
    await request(app)
      .post(`/api/close/journal-entries/${materialJeId}/approve`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ approvedBy: 'test-approver' });
    await request(app)
      .post(`/api/close/journal-entries/${materialJeId}/post`)
      .set('Authorization', `Bearer ${authToken}`);

    // Checklist + advance to locked
    await request(app)
      .post(`/api/close/sessions/${closeSessionId}/checklist/initialize`)
      .set('Authorization', `Bearer ${authToken}`);
    const listRes = await request(app)
      .get(`/api/close/sessions/${closeSessionId}/checklist`)
      .set('Authorization', `Bearer ${authToken}`);
    const items = listRes.body?.items ?? listRes.body ?? [];
    for (const item of Array.isArray(items) ? items : []) {
      const id = item.id ?? item;
      if (typeof id !== 'string') continue;
      await request(app)
        .post(`/api/close/checklist-items/${id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
    }
    for (const status of ['in_progress', 'ready_for_review', 'finalized', 'locked']) {
      await request(app)
        .patch(`/api/close/sessions/${closeSessionId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ status });
    }
    await request(app)
      .post('/api/close/period-lock')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ periodLabel, lockedBy: 'test-user', reason: 'Evidence policy test' });
  }

  it('A) No policy → certification succeeds without evidence', async () => {
    if (!isDbConfigured()) return;
    await setupSessionWithMaterialJE('2025-02');
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ certifiedBy: 'test-user', periodLabel: '2025-02' });
    expect(res.status).toBe(200);
    expect(res.body?.status).toBe('certified');
  }, 30000);

  it('B) Warn-only policy → certification succeeds but warnings present', async () => {
    if (!isDbConfigured()) return;
    await setupSessionWithMaterialJE('2025-03');
    await request(app)
      .put('/api/close/evidence-policy')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        enforcementMode: 'warn_only',
        materialityThreshold: '1000',
        requiredAssertionTypes: { manual_entry: ['approval'] },
      });
    const readinessRes = await request(app)
      .get(`/api/close/sessions/${closeSessionId}/readiness`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(readinessRes.status).toBe(200);
    // Soft warnings should include evidence requirement
    const hasEvidenceWarning = (readinessRes.body?.softWarnings ?? []).some(
      (w: string) => w.includes('evidence') || w.includes('approval')
    );
    expect(hasEvidenceWarning).toBe(true);
    const certifyRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ certifiedBy: 'test-user', periodLabel: '2025-03' });
    expect(certifyRes.status).toBe(200);
    expect(certifyRes.body?.status).toBe('certified');
  }, 30000);

  it('C) Hard-block policy: JE above threshold without required assertion → 422 NOT_READY', async () => {
    if (!isDbConfigured()) return;
    await setupSessionWithMaterialJE('2025-04');
    await request(app)
      .put('/api/close/evidence-policy')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        enforcementMode: 'hard_block',
        materialityThreshold: '1000',
        requiredAssertionTypes: { manual_entry: ['approval'] },
      });
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ certifiedBy: 'test-user', periodLabel: '2025-04' });
    expect(res.status).toBe(422);
    expect(res.body?.code).toBe('NOT_READY');
  }, 30000);

  it('D) Hard-block policy: JE with correct evidence → certification succeeds', async () => {
    if (!isDbConfigured()) return;
    await setupSessionWithMaterialJE('2025-05');
    await request(app)
      .put('/api/close/evidence-policy')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        enforcementMode: 'hard_block',
        materialityThreshold: '1000',
        requiredAssertionTypes: { manual_entry: ['approval'] },
      });
    // Attach evidence with assertion_type approval
    const evRes = await request(app)
      .post(`/api/close/journal-entries/${materialJeId}/evidence`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        hashSha256: 'abc123',
        sizeBytes: 100,
        assertionType: 'approval',
        attachedBy: 'test-user',
      });
    expect([200, 201]).toContain(evRes.status);
    const certifyRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ certifiedBy: 'test-user', periodLabel: '2025-05' });
    expect(certifyRes.status).toBe(200);
    expect(certifyRes.body?.status).toBe('certified');
  }, 30000);
});
