/**
 * Snapshot reproducibility integration test.
 *
 * Proves that a certified session snapshot can be rebuilt deterministically:
 * same inputs → same canonical payload → same hash. Guardrail against future nondeterministic drift.
 *
 * Scenario:
 * 1) Ingest TB
 * 2) Create close session
 * 3) Lock
 * 4) Certify (snapshot created automatically)
 * 5) Retrieve snapshot payload and snapshot_hash from DB
 * 6) Rebuild adjusted ledger state using the same deterministic services used during certification
 * 7) Re-serialize using canonical serializer and recompute hash
 * 8) Assert recomputed hash === stored snapshot_hash (test fails on mismatch)
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
import { getAdjustedTrialBalance } from '../../src/services/adjusted_trial_balance_service.js';
import { buildSnapshotPayloadFromInput } from '../../src/services/ledger_snapshot_service.js';
import { buildEvidenceManifest } from '../../src/services/evidence_manifest_service.js';
import {
  hashSnapshotPayload,
  HASH_VERSION_WITH_EVIDENCE_MANIFEST,
} from '../../src/lib/snapshot_hash.js';
import { sumRound2 } from '../../src/utils/decimal.js';
import type { CreateLedgerSnapshotInput } from '../../src/types/ledger_snapshot.js';
import { getSession } from '../../src/services/close_session_service.js';
import { getLedgerSnapshotById } from '../../src/db/repositories/ledger_snapshot_repository.js';

const PERIOD_LABEL = '2025-02';
const PERIOD_START = '2025-02-01';
const PERIOD_END = '2025-02-28';
const ENTITY_ID = 'entity-snapshot-repro';

// Balanced TB so no HITL resolve required
const BALANCED_TB_CSV = `AccountName,Debit,Credit
Cash,1000,0
Retained Earnings,0,1000`;

describe('Snapshot reproducibility', () => {
  let testTenantId: string;
  let authToken: string;
  let closeSessionId: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Snapshot reproducibility: DATABASE_URL not set; skipping.');
      return;
    }
    testTenantId =
      process.env.TEST_TENANT_ID ?? `snapshot-repro-tenant-${Date.now()}`;
    authToken = getTestAuthTokenWithRole(testTenantId, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [testTenantId, `Test ${testTenantId}`]
    );
  });

  it(
    'certified session snapshot can be rebuilt deterministically; recomputed hash === stored snapshot_hash',
    async () => {
      if (!isDbConfigured()) return;

      const ingestPath = '/api/trial-balance/ingest';

      const tmpCsv = path.join(os.tmpdir(), `snapshot-repro-${Date.now()}.csv`);
      fs.writeFileSync(tmpCsv, BALANCED_TB_CSV, 'utf8');
      try {
        const ingestRes = await request(app)
          .post(ingestPath)
          .set('Authorization', `Bearer ${authToken}`)
          .field('tenantId', testTenantId)
          .field('periodLabel', PERIOD_LABEL)
          .attach('file', tmpCsv);
        expect(ingestRes.status).toBe(200);
      } finally {
        fs.unlinkSync(tmpCsv);
      }

      const createSessionRes = await request(app)
        .post('/api/close/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          entityId: ENTITY_ID,
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          basis: 'accrual',
          standard: 'GAAP',
        });
      expect([200, 201]).toContain(createSessionRes.status);
      expect(createSessionRes.body?.id).toBeDefined();
      closeSessionId = createSessionRes.body.id;

      const initChecklistRes = await request(app)
        .post(`/api/close/sessions/${closeSessionId}/checklist/initialize`)
        .set('Authorization', `Bearer ${authToken}`);
      expect([200, 201]).toContain(initChecklistRes.status);

      const listChecklistRes = await request(app)
        .get(`/api/close/sessions/${closeSessionId}/checklist`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(listChecklistRes.status).toBe(200);
      const items = listChecklistRes.body?.items ?? listChecklistRes.body ?? [];
      for (const item of Array.isArray(items) ? items : []) {
        const id = item.id ?? item;
        if (typeof id !== 'string') continue;
        const completeRes = await request(app)
          .post(`/api/close/checklist-items/${id}/complete`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .send({ completedBy: 'test-user' });
        if (completeRes.status === 200) continue;
        const skipRes = await request(app)
          .post(`/api/close/checklist-items/${id}/skip`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .send({ completedBy: 'test-user' });
        expect([200, 404]).toContain(skipRes.status);
      }

      for (const status of ['in_progress', 'ready_for_review', 'finalized', 'locked']) {
        const patchRes = await request(app)
          .patch(`/api/close/sessions/${closeSessionId}/status`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .send({ status });
        expect(patchRes.status).toBe(200);
      }

      const lockRes = await request(app)
        .post('/api/close/period-lock')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          periodLabel: PERIOD_LABEL,
          lockedBy: 'test-user',
          reason: 'Snapshot reproducibility test',
        });
      expect(lockRes.status).toBe(200);

      const certifyRes = await request(app)
        .post(`/api/close/sessions/${closeSessionId}/certify`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          certifiedBy: 'test-user',
          periodLabel: PERIOD_LABEL,
          memo: 'Reproducibility test',
        });
      expect(certifyRes.status).toBe(200);
      expect(certifyRes.body?.status).toBe('certified');

      const pool = await getTenantPool(testTenantId);
      const session = await getSession(pool, testTenantId, closeSessionId);
      expect(session?.certifiedSnapshotId).toBeDefined();
      const snapshot = await getLedgerSnapshotById(
        pool,
        session!.certifiedSnapshotId!
      );
      expect(snapshot).toBeDefined();
      const storedHash = snapshot!.snapshotHash;

      // Rebuild adjusted ledger state using the same deterministic services used during certification
      const adjustedEntries = await getAdjustedTrialBalance(
        testTenantId,
        PERIOD_LABEL,
        pool,
        closeSessionId
      );
      const totalDebits = sumRound2(adjustedEntries.map((e) => e.debit ?? 0));
      const totalCredits = sumRound2(adjustedEntries.map((e) => e.credit ?? 0));
      const evidenceManifest =
        snapshot!.hashVersion >= HASH_VERSION_WITH_EVIDENCE_MANIFEST
          ? await buildEvidenceManifest(pool, testTenantId, closeSessionId)
          : undefined;

      const input: CreateLedgerSnapshotInput = {
        tenantId: testTenantId,
        periodLabel: PERIOD_LABEL,
        createdBy: 'test-user',
        source: 'close_session',
        trialBalance: {
          entries: adjustedEntries.map((e) => ({
            accountName: e.accountName,
            debit: e.debit ?? 0,
            credit: e.credit ?? 0,
            ...(e.accountCode != null && { accountCode: e.accountCode }),
          })),
          totalDebits,
          totalCredits,
        },
        evidenceManifest,
      };

      const rebuiltPayload = buildSnapshotPayloadFromInput(input);
      const recomputedHash = hashSnapshotPayload(rebuiltPayload, {
        hashVersion: snapshot!.hashVersion,
      });

      // If this fails: nondeterministic drift (key order, timestamps, or extra fields in hashed payload).
      expect(recomputedHash).toBe(storedHash);
    },
    30_000
  );
});
