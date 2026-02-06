/**
 * Integration tests for POST /api/precheck/board-ready.
 * Stateless pre-certification structural check; no DB writes, no close session, no AI.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthToken } from '../helpers/testHelpers.js';
import { isDbConfigured } from '../../src/db/index.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'precheck-board-ready-tenant';

describe('POST /api/precheck/board-ready', () => {
  let authToken: string;

  beforeAll(() => {
    authToken = getTestAuthToken(TEST_TENANT_ID);
  });

  it('returns 400 when periodLabel is missing', async () => {
    const res = await request(app)
      .post('/api/precheck/board-ready')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ trialBalance: [{ accountName: 'Cash', debit: 1000, credit: 0 }] });
    expect(res.status).toBe(400);
    expect(res.body?.message).toMatch(/periodLabel/);
  });

  it('returns 400 when trialBalance is not an array', async () => {
    const res = await request(app)
      .post('/api/precheck/board-ready')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ periodLabel: '2025-01', trialBalance: {} });
    expect(res.status).toBe(400);
    expect(res.body?.message).toMatch(/trialBalance/);
  });

  it('balanced TB => status ready and proofSummary', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post('/api/precheck/board-ready')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: '2025-01',
        trialBalance: [
          { accountName: 'Cash', debit: 1000, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: 1000 },
        ],
      });
    if (res.status === 503) return;
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ready');
    expect(res.body).toHaveProperty('blockers');
    expect(Array.isArray(res.body.blockers)).toBe(true);
    expect(res.body.blockers).toHaveLength(0);
    expect(res.body).toHaveProperty('warnings');
    expect(res.body).toHaveProperty('proofSummary');
    expect(res.body.proofSummary).toMatchObject({
      trialBalanceBalanced: true,
      balanceSheetEquationBalanced: true,
      plugDetected: false,
    });
    expect(res.body.proofSummary.computedTotalsSummary).toMatchObject({
      totalDebits: 1000,
      totalCredits: 1000,
    });
  });

  it('imbalanced TB => status not_ready with TRIAL_BALANCE_IMBALANCED blocker', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post('/api/precheck/board-ready')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: '2025-01',
        trialBalance: [
          { accountName: 'Cash', debit: 1000, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: 500 },
        ],
      });
    if (res.status === 503) return;
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'not_ready');
    const blocker = res.body.blockers?.find((b: { code: string }) => b.code === 'TRIAL_BALANCE_IMBALANCED');
    expect(blocker).toBeDefined();
    expect(blocker.message).toBeDefined();
    expect(res.body.proofSummary.trialBalanceBalanced).toBe(false);
  });

  it('plug detection (Suspense + Other) => status not_ready with PLUG_ACCOUNTS_DETECTED', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post('/api/precheck/board-ready')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: '2025-01',
        trialBalance: [
          { accountName: 'Suspense', debit: 9000, credit: 0 },
          { accountName: 'Other', debit: 0, credit: 9000 },
        ],
      });
    if (res.status === 503) return;
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'not_ready');
    const blocker = res.body.blockers?.find((b: { code: string }) => b.code === 'PLUG_ACCOUNTS_DETECTED');
    expect(blocker).toBeDefined();
    expect(res.body.proofSummary.plugDetected).toBe(true);
  });

  it('optional journalEntries are applied as hypothetical and reflected in proofSummary', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post('/api/precheck/board-ready')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: '2025-01',
        trialBalance: [
          { accountName: 'Cash', debit: 1000, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: 1000 },
        ],
        journalEntries: [
          { accountRef: 'Cash', debit: 100, credit: 0 },
          { accountRef: 'Revenue', debit: 0, credit: 100 },
        ],
      });
    if (res.status === 503) return;
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.proofSummary.computedTotalsSummary).toMatchObject({
      totalDebits: 1100,
      totalCredits: 1100,
    });
  });
});
