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

// Balanced TB: Cash + Equity (passes Truth Gate; same format as full_close_flow)
const BALANCED_TB_CSV = `Account Name,Debit,Credit
Cash,5000,0
Equity,0,5000`;

describe('Evidence policy enforcement', () => {
  let authToken: string;
  let testTenantId: string;
  let closeSessionId: string;
  let materialJeId: string;
  const ingestPath = '/api/trial-balance/ingest';

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

  async function setupSessionWithMaterialJE(periodLabel: string, opts?: { skipAdvance?: boolean; skipJe?: boolean }): Promise<void> {
    if (!isDbConfigured()) return;

    // Ingest balanced TB (or staged→resolve if imbalanced)
    const prevMock = process.env.AI_MOCK_CLASSIFIER;
    process.env.AI_MOCK_CLASSIFIER = 'true';
    const ingestRes = await request(app)
      .post(ingestPath)
      .set('Authorization', `Bearer ${authToken}`)
      .field('tenantId', testTenantId)
      .field('periodLabel', periodLabel)
      .attach('file', Buffer.from(BALANCED_TB_CSV), 'tb.csv');
    if (prevMock !== undefined) process.env.AI_MOCK_CLASSIFIER = prevMock;
    else delete process.env.AI_MOCK_CLASSIFIER;
    expect(ingestRes.status).toBe(200);

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

    if (!opts?.skipJe) {
      // Create material JE (amount 1000 >= threshold)
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
              debit: 1000,
              credit: 0,
              amountProvenance: { kind: 'human_entered', enteredBy: 'test-user' },
            },
            {
              accountRef: 'Equity',
              debit: 0,
              credit: 1000,
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
    } else {
      materialJeId = '';
    }

    // Checklist + advance to locked (use advance endpoint for atomic flow)
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
    if (!opts?.skipAdvance) {
      const advanceRes = await request(app)
        .post(`/api/close/sessions/${closeSessionId}/advance`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json');
      if (advanceRes.status !== 200 || advanceRes.body?.statusAfter !== 'locked') {
        throw new Error(`Advance to locked failed: ${advanceRes.status} ${JSON.stringify(advanceRes.body)}`);
      }
    }
  }

  it('A) No policy → certification succeeds without evidence', async () => {
    if (!isDbConfigured()) return;
    await setupSessionWithMaterialJE('2025-02', { skipJe: true });
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
    await setupSessionWithMaterialJE('2025-05', { skipAdvance: true });
    await request(app)
      .put('/api/close/evidence-policy')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        enforcementMode: 'hard_block',
        materialityThreshold: '1000',
        requiredAssertionTypes: { manual_entry: ['approval'] },
      });
    // Attach evidence BEFORE advancing to locked (session must be draft/finalized to attach)
    const evRes = await request(app)
      .post(`/api/close/journal-entries/${materialJeId}/evidence`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        hashSha256: 'a'.repeat(64),
        sizeBytes: 100,
        assertionType: 'approval',
        attachedBy: 'test-user',
      });
    expect([200, 201]).toContain(evRes.status);
    // Advance to locked (evidence already attached)
    const advanceRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json');
    expect(advanceRes.status).toBe(200);
    expect(advanceRes.body?.statusAfter).toBe('locked');
    const certifyRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ certifiedBy: 'test-user', periodLabel: '2025-05' });
    expect(certifyRes.status).toBe(200);
    expect(certifyRes.body?.status).toBe('certified');
  }, 30000);
});
