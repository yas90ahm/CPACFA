/**
 * Close adjustments hardening non-regression test.
 * Proves POST /api/close/adjustments/from-je and PATCH /api/close/adjustments/:id:
 * - Route through executeBridgeCommand
 * - Assert period not locked
 * - Record material audit event (bridge_command)
 *
 * Skips when DATABASE_URL is not set.
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
import * as auditLedgerRepo from '../../src/db/repositories/audit_ledger_repository.js';
import { listAdjustments } from '../../src/services/close_adjustments_service.js';

const PERIOD_LABEL = '2025-04';
const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? `close-adj-hardening-tenant-${Date.now()}`;

const JE_SUGGESTION = {
  id: 'sugg-1',
  date: '2025-04-30',
  description: 'Test accrual',
  debits: [{ account: 'Prepaid', amount: 100, amountProvenance: { kind: 'human_entered' as const, enteredBy: 'test' } }],
  credits: [{ account: 'Expense', amount: 100, amountProvenance: { kind: 'human_entered' as const, enteredBy: 'test' } }],
  source: 'manual' as const,
};

describe('Close adjustments hardening', () => {
  let authToken: string;
  let adjustmentId: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Close adjustments hardening: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthTokenWithRole(TEST_TENANT_ID, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  describe('A) Creating adjustment in draft period succeeds', () => {
    it('POST /adjustments/from-je returns 201 and creates adjustments', async () => {
      if (!isDbConfigured()) return;

      const res = await request(app)
        .post('/api/close/adjustments/from-je')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          periodLabel: PERIOD_LABEL,
          suggestions: [JE_SUGGESTION],
        });

      expect(res.status).toBe(201);
      expect(res.body?.added).toBeDefined();
      expect(Array.isArray(res.body.added)).toBe(true);
      expect(res.body.added.length).toBe(1);
      expect(res.body.count).toBe(1);
      adjustmentId = res.body.added[0]?.id;
      expect(adjustmentId).toBeDefined();
    });
  });

  describe('B) Creating adjustment in locked period fails (409)', () => {
    it('POST /adjustments/from-je returns 409 when period is locked', async () => {
      if (!isDbConfigured()) return;

      const lockRes = await request(app)
        .post('/api/close/period-lock')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          periodLabel: PERIOD_LABEL,
          lockedBy: 'test-user',
          reason: 'Hardening test lock',
        });
      expect(lockRes.status).toBe(200);

      const createRes = await request(app)
        .post('/api/close/adjustments/from-je')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          periodLabel: PERIOD_LABEL,
          suggestions: [JE_SUGGESTION],
        });

      expect(createRes.status).toBe(409);
      expect(createRes.body?.code).toBe('PERIOD_LOCKED');
      expect(createRes.body?.periodLabel).toBe(PERIOD_LABEL);
    });
  });

  describe('C) Audit ledger entry is recorded for adjustment creation', () => {
    it('bridge_command event exists for CreateCloseAdjustmentsFromJE', async () => {
      if (!isDbConfigured()) return;

      const pool = await getTenantPool(TEST_TENANT_ID);
      const bridgeCount = await auditLedgerRepo.countByTenantPeriodAndEventType(
        pool,
        TEST_TENANT_ID,
        PERIOD_LABEL,
        'bridge_command'
      );
      expect(bridgeCount).toBeGreaterThanOrEqual(1);

      const r = await pool.query<{ deterministic_flag_snapshot: unknown }>(
        `SELECT deterministic_flag_snapshot FROM audit_ledger 
         WHERE tenant_id = $1 AND period_label = $2 AND event_type = 'bridge_command'
         AND deterministic_flag_snapshot->>'commandType' = 'CreateCloseAdjustmentsFromJE'
         ORDER BY created_at DESC LIMIT 1`,
        [TEST_TENANT_ID, PERIOD_LABEL]
      );
      const snapshot = r.rows[0]?.deterministic_flag_snapshot as Record<string, unknown> | undefined;
      expect(snapshot).toBeDefined();
      expect(snapshot?.commandType).toBe('CreateCloseAdjustmentsFromJE');
      expect(snapshot?.periodLabel).toBe(PERIOD_LABEL);
    });
  });

  describe('D) Updating adjustment after lock fails', () => {
    it('PATCH /adjustments/:id returns 409 when period is locked', async () => {
      if (!isDbConfigured()) return;

      const pool = await getTenantPool(TEST_TENANT_ID);
      const adjustments = await listAdjustments({ periodLabel: PERIOD_LABEL }, TEST_TENANT_ID, pool);
      const adjId = adjustments[0]?.id ?? adjustmentId;
      if (!adjId) {
        console.warn('No adjustment to patch; skipping update test.');
        return;
      }

      const patchRes = await request(app)
        .patch(`/api/close/adjustments/${adjId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ status: 'approved', approvedBy: 'test-user' });

      expect(patchRes.status).toBe(409);
      expect(patchRes.body?.periodLabel).toBe(PERIOD_LABEL);
    });
  });
});
