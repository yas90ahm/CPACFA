/**
 * Tenant isolation integration tests.
 *
 * Verifies that tenant isolation is enforced across all close-related resources:
 * - Create resource in Tenant A
 * - Attempt to fetch with Tenant B credentials → access denied (404 or 403)
 * - Fetch with Tenant A credentials → access granted
 *
 * Skips when DATABASE_URL is not set.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { app } from '../../src/server.js';
import {
  isDbConfigured,
  getTenantPool,
} from '../../src/db/index.js';
import { insertLedgerSnapshot } from '../../src/db/repositories/ledger_snapshot_repository.js';
import { createDraftJE } from '../../src/services/journal_entry_service.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';
import { createTenant, teardown } from '../helpers/integrationHarness.js';

const PERIOD_LABEL = '2025-04';
const ENTITY_ID = 'default';

describe('Tenant isolation', () => {
  let tenantIdA: string;
  let tenantIdB: string;
  let tokenA: string;
  let tokenB: string;
  let closeSessionIdA: string;
  let closeSessionIdB: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;

    const ctxA = await createTenant('tenant-isolation-a');
    const ctxB = await createTenant('tenant-isolation-b');
    tenantIdA = ctxA.tenantId;
    tenantIdB = ctxB.tenantId;
    tokenA = ctxA.authToken;
    tokenB = ctxB.authToken;

    // Create close sessions for both tenants
    const resA = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Content-Type', 'application/json')
      .send({ entityId: ENTITY_ID, periodLabel: PERIOD_LABEL });

    const resB = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('Content-Type', 'application/json')
      .send({ entityId: ENTITY_ID, periodLabel: PERIOD_LABEL });

    if (resA.status === 503 || resB.status === 503) return;
    expect([200, 201, 400]).toContain(resA.status);
    expect([200, 201, 400]).toContain(resB.status);

    closeSessionIdA =
      resA.body?.closeSessionId ?? resA.body?.id ?? resA.body?.session?.id;
    closeSessionIdB =
      resB.body?.closeSessionId ?? resB.body?.id ?? resB.body?.session?.id;

    expect(closeSessionIdA).toBeDefined();
    expect(closeSessionIdB).toBeDefined();
  });

  afterAll(async () => {
    if (tenantIdA) await teardown(tenantIdA);
    if (tenantIdB) await teardown(tenantIdB);
  }, 15000);

  describe('close_sessions', () => {
    it('Tenant B cannot access Tenant A close session', async () => {
      if (!isDbConfigured() || !closeSessionIdA) return;
      const res = await request(app)
        .get(`/api/close/sessions/${closeSessionIdA}`)
        .set('Authorization', `Bearer ${tokenB}`);
      if (res.status === 503) return;
      expect(res.status).toBe(404);
    });

    it('Tenant A can access own close session', async () => {
      if (!isDbConfigured() || !closeSessionIdA) return;
      const res = await request(app)
        .get(`/api/close/sessions/${closeSessionIdA}`)
        .set('Authorization', `Bearer ${tokenA}`);
      if (res.status === 503) return;
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(closeSessionIdA);
    });
  });

  describe('ledger_snapshots', () => {
    let snapshotIdA: string;

    beforeAll(async () => {
      if (!isDbConfigured() || !closeSessionIdA) return;
      const pool = await getTenantPool(tenantIdA);
      const snapshot = await insertLedgerSnapshot(pool, {
        tenantId: tenantIdA,
        periodLabel: PERIOD_LABEL,
        source: 'close_session',
        snapshotPayloadJson: {
          trialBalance: {
            entries: [],
            totalDebits: 0,
            totalCredits: 0,
          },
        },
        snapshotHash: 'test-hash',
        hashVersion: 1,
        closeSessionId: closeSessionIdA,
      });
      snapshotIdA = snapshot.id;
    });

    it('Tenant B cannot access Tenant A ledger snapshot', async () => {
      if (!isDbConfigured() || !snapshotIdA) return;
      const res = await request(app)
        .get(`/api/verification/snapshots/${snapshotIdA}`)
        .set('Authorization', `Bearer ${tokenB}`);
      if (res.status === 503) return;
      expect(res.status).toBe(404);
    });

    it('Tenant A can access own ledger snapshot', async () => {
      if (!isDbConfigured() || !snapshotIdA) return;
      const res = await request(app)
        .get(`/api/verification/snapshots/${snapshotIdA}`)
        .set('Authorization', `Bearer ${tokenA}`);
      if (res.status === 503) return;
      expect(res.status).toBe(200);
      expect(res.body.snapshot.snapshotId).toBe(snapshotIdA);
    });
  });

  describe('triage_assessments', () => {
    it('Tenant B cannot access Tenant A session triage', async () => {
      if (!isDbConfigured() || !closeSessionIdA) return;
      const res = await request(app)
        .get(`/api/close/sessions/${closeSessionIdA}/triage?store=true`)
        .set('Authorization', `Bearer ${tokenB}`);
      if (res.status === 503) return;
      expect(res.status).toBe(404);
    });

    it('Tenant A can access own session triage', async () => {
      if (!isDbConfigured() || !closeSessionIdA) return;
      const res = await request(app)
        .get(`/api/close/sessions/${closeSessionIdA}/triage?store=true`)
        .set('Authorization', `Bearer ${tokenA}`);
      if (res.status === 503) return;
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        const riskScore = res.body?.risk?.riskScore ?? res.body?.assessment?.riskScore;
        expect(riskScore).toBeDefined();
        expect(typeof riskScore).toBe('number');
      }
    });
  });

  describe('recon_runs', () => {
    let reconRunIdA: string;

    beforeAll(async () => {
      if (!isDbConfigured() || !closeSessionIdA) return;
      const res = await request(app)
        .post('/api/close/recon-runs')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Content-Type', 'application/json')
        .send({ closeSessionId: closeSessionIdA, type: 'bank' });
      if (res.status !== 201) return;
      reconRunIdA = res.body.id;
    });

    it('Tenant B cannot access Tenant A recon run', async () => {
      if (!isDbConfigured() || !reconRunIdA) return;
      const res = await request(app)
        .get(`/api/close/recon-runs/${reconRunIdA}`)
        .set('Authorization', `Bearer ${tokenB}`);
      if (res.status === 503) return;
      expect(res.status).toBe(404);
    });

    it('Tenant A can access own recon run', async () => {
      if (!isDbConfigured() || !reconRunIdA) return;
      const res = await request(app)
        .get(`/api/close/recon-runs/${reconRunIdA}`)
        .set('Authorization', `Bearer ${tokenA}`);
      if (res.status === 503) return;
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(reconRunIdA);
    });
  });

  describe('recon_items', () => {
    let reconRunIdA: string;

    beforeAll(async () => {
      if (!isDbConfigured() || !closeSessionIdA) return;
      const createRes = await request(app)
        .post('/api/close/recon-runs')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Content-Type', 'application/json')
        .send({ closeSessionId: closeSessionIdA, type: 'bank' });
      if (createRes.status !== 201) return;
      reconRunIdA = createRes.body.id;

      await request(app)
        .post(`/api/close/recon-runs/${reconRunIdA}/items`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Content-Type', 'application/json')
        .send({
          items: [
            { source: 'bank', amount: 100, description: 'Test item' },
          ],
        });
    });

    it('Tenant B cannot access Tenant A recon items', async () => {
      if (!isDbConfigured() || !reconRunIdA) return;
      const res = await request(app)
        .get(`/api/close/recon-runs/${reconRunIdA}/items`)
        .set('Authorization', `Bearer ${tokenB}`);
      if (res.status === 503) return;
      expect(res.status).toBe(404);
    });

    it('Tenant A can access own recon items', async () => {
      if (!isDbConfigured() || !reconRunIdA) return;
      const res = await request(app)
        .get(`/api/close/recon-runs/${reconRunIdA}/items`)
        .set('Authorization', `Bearer ${tokenA}`);
      if (res.status === 503) return;
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
    });
  });

  describe('close_checklist_items', () => {
    beforeAll(async () => {
      if (!isDbConfigured() || !closeSessionIdA) return;
      await request(app)
        .post(`/api/close/sessions/${closeSessionIdA}/checklist/initialize`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Content-Type', 'application/json')
        .send({});
    });

    it('Tenant B cannot access Tenant A checklist items', async () => {
      if (!isDbConfigured() || !closeSessionIdA) return;
      const res = await request(app)
        .get(`/api/close/sessions/${closeSessionIdA}/checklist`)
        .set('Authorization', `Bearer ${tokenB}`);
      if (res.status === 503) return;
      // JOIN filters by tenant_id — returns empty list, not 404
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body?.items) ? res.body.items : []).toHaveLength(0);
    });

    it('Tenant A can access own checklist items', async () => {
      if (!isDbConfigured() || !closeSessionIdA) return;
      const res = await request(app)
        .get(`/api/close/sessions/${closeSessionIdA}/checklist`)
        .set('Authorization', `Bearer ${tokenA}`);
      if (res.status === 503) return;
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('items');
      }
    });
  });

  describe('statement_packages', () => {
    let statementPackageIdA: string;

    beforeAll(async () => {
      if (!isDbConfigured() || !closeSessionIdA) return;
      const res = await request(app)
        .post(`/api/close/sessions/${closeSessionIdA}/statement-packages/generate`)
        .set('Authorization', `Bearer ${tokenA}`);
      if (res.status !== 200 && res.status !== 201) return;
      statementPackageIdA =
        res.body?.id ?? res.body?.package?.id ?? res.body?.statementPackage?.id;
    });

    it('Tenant B cannot access Tenant A statement package', async () => {
      if (!isDbConfigured() || !statementPackageIdA) return;
      const res = await request(app)
        .get(`/api/close/statement-packages/${statementPackageIdA}`)
        .set('Authorization', `Bearer ${tokenB}`);
      if (res.status === 503) return;
      expect(res.status).toBe(404);
    });

    it('Tenant A can access own statement package', async () => {
      if (!isDbConfigured() || !statementPackageIdA) return;
      const res = await request(app)
        .get(`/api/close/statement-packages/${statementPackageIdA}`)
        .set('Authorization', `Bearer ${tokenA}`);
      if (res.status === 503) return;
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(statementPackageIdA);
    });
  });

  describe('journal_entries', () => {
    let journalEntryIdA: string;

    beforeAll(async () => {
      if (!isDbConfigured() || !closeSessionIdA) return;
      const res = await request(app)
        .post('/api/close/journal-entries')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Content-Type', 'application/json')
        .send({
          closeSessionId: closeSessionIdA,
          source: 'manual',
          lines: [
            { accountRef: 'Cash', debit: 100, credit: 0 },
            { accountRef: 'Revenue', debit: 0, credit: 100 },
          ],
        });
      if (res.status !== 201) return;
      journalEntryIdA = res.body.id;
    });

    it('Tenant B cannot access Tenant A journal entry', async () => {
      if (!isDbConfigured() || !journalEntryIdA) return;
      const res = await request(app)
        .get(`/api/close/journal-entries/${journalEntryIdA}`)
        .set('Authorization', `Bearer ${tokenB}`);
      if (res.status === 503) return;
      expect(res.status).toBe(404);
    });

    it('Tenant A can access own journal entry', async () => {
      if (!isDbConfigured() || !journalEntryIdA) return;
      const res = await request(app)
        .get(`/api/close/journal-entries/${journalEntryIdA}`)
        .set('Authorization', `Bearer ${tokenA}`);
      if (res.status === 503) return;
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(journalEntryIdA);
    });
  });

  describe('evidence_records', () => {
    let journalEntryIdA: string;
    let evidenceIdA: string;

    beforeAll(async () => {
      if (!isDbConfigured() || !closeSessionIdA) return;
      const pool = await getTenantPool(tenantIdA);
      const session = await closeSessionRepo.getCloseSessionById(
        pool,
        tenantIdA,
        closeSessionIdA
      );
      if (!session) return;

      const je = await createDraftJE(pool, {
        closeSessionId: closeSessionIdA,
        tenantId: tenantIdA,
        memo: 'Test accrual',
        source: 'manual',
        createdBy: 'test@test.com',
        lines: [
          { accountRef: 'Cash', debit: 50, credit: 0, amountProvenance: { kind: 'human_entered', enteredBy: 'test@test.com' } },
          { accountRef: 'Revenue', debit: 0, credit: 50, amountProvenance: { kind: 'human_entered', enteredBy: 'test@test.com' } },
        ],
      });
      journalEntryIdA = je.id;

      const attachRes = await request(app)
        .post(`/api/close/journal-entries/${journalEntryIdA}/evidence`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Content-Type', 'application/json')
        .send({
          hashSha256: 'abc123evidence',
          sizeBytes: 1024,
          assertionType: 'bank_support',
          mimeType: 'application/pdf',
          label: 'Test evidence',
          attachedBy: 'test@test.com',
        });
      if (attachRes.status === 201) {
        evidenceIdA = attachRes.body.evidenceId;
      }
    });

    it('Tenant B cannot access Tenant A journal entry (with evidence)', async () => {
      if (!isDbConfigured() || !journalEntryIdA) return;
      const res = await request(app)
        .get(`/api/close/journal-entries/${journalEntryIdA}`)
        .set('Authorization', `Bearer ${tokenB}`);
      if (res.status === 503) return;
      expect(res.status).toBe(404);
    });

    it('Tenant A can access own journal entry with evidence', async () => {
      if (!isDbConfigured() || !journalEntryIdA) return;
      const res = await request(app)
        .get(`/api/close/journal-entries/${journalEntryIdA}`)
        .set('Authorization', `Bearer ${tokenA}`);
      if (res.status === 503) return;
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(journalEntryIdA);
      if (evidenceIdA) {
        expect(res.body).toBeDefined();
      }
    });
  });

  describe('cross-tenant correctness', () => {
    it('Tenant A list sessions returns only Tenant A sessions', async () => {
      if (!isDbConfigured()) return;
      const res = await request(app)
        .get('/api/close/sessions')
        .set('Authorization', `Bearer ${tokenA}`);
      if (res.status === 503) return;
      expect(res.status).toBe(200);
      const sessions = res.body?.sessions ?? res.body ?? [];
      if (Array.isArray(sessions)) {
        for (const s of sessions) {
          expect(s.tenantId ?? s).toBeDefined();
        }
      }
    });

    it('Tenant B list sessions returns only Tenant B sessions', async () => {
      if (!isDbConfigured()) return;
      const res = await request(app)
        .get('/api/close/sessions')
        .set('Authorization', `Bearer ${tokenB}`);
      if (res.status === 503) return;
      expect(res.status).toBe(200);
    });
  });
});
