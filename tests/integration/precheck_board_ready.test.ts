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

  it('when periodLabel omitted, returns 200 and periodLabel "unspecified"', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post('/api/precheck/board-ready')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        trialBalance: [
          { accountName: 'Cash', debit: 1000, credit: 0 },
          { accountName: 'Retained Earnings', debit: 0, credit: 1000 },
        ],
      });
    if (res.status === 503) return;
    expect(res.status).toBe(200);
    expect(res.body?.periodLabel).toBe('unspecified');
    expect(res.body?.status).toBe('ready');
  });

  it('returns 400 when trialBalance is not an array', async () => {
    const res = await request(app)
      .post('/api/precheck/board-ready')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ periodLabel: '2025-01', trialBalance: {} });
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('TRIAL_BALANCE_NOT_ARRAY');
  });

  it('balanced TB => status ready, contractVersion v1, and stable proofSummary shape', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post('/api/precheck/board-ready')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: '2025-01',
        trialBalance: [
          { accountName: 'Cash', debit: 1000, credit: 0 },
          { accountName: 'Retained Earnings', debit: 0, credit: 1000 },
        ],
      });
    if (res.status === 503) return;
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('periodLabel', '2025-01');
    expect(res.body).toHaveProperty('contractVersion', 'v1');
    expect(res.body).toHaveProperty('status', 'ready');
    expect(res.body).toHaveProperty('blockers');
    expect(Array.isArray(res.body.blockers)).toBe(true);
    expect(res.body.blockers).toHaveLength(0);
    expect(res.body).toHaveProperty('warnings');
    expect(Array.isArray(res.body.warnings)).toBe(true);
    expect(res.body).toHaveProperty('proofSummary');
    expect(res.body.proofSummary).toMatchObject({
      trialBalanceBalanced: true,
      balanceSheetEquationBalanced: true,
      plugDetected: false,
    });
    expect(res.body.proofSummary).toHaveProperty('roundingToleranceUsed');
    expect(res.body.proofSummary).toHaveProperty('computedTotalsSummary');
    expect(res.body.proofSummary.computedTotalsSummary).toMatchObject({
      totalDebits: 1000,
      totalCredits: 1000,
    });
    expect(Object.keys(res.body.proofSummary.computedTotalsSummary).sort()).toEqual([
      'totalAssets',
      'totalCredits',
      'totalDebits',
      'totalEquity',
      'totalLiabilities',
    ]);
  });

  it('imbalanced TB => status not_ready with TRIAL_BALANCE_IMBALANCED blocker (stable shape)', async () => {
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
    expect(res.body).toHaveProperty('contractVersion', 'v1');
    expect(res.body).toHaveProperty('status', 'not_ready');
    const blocker = res.body.blockers?.find((b: { code: string }) => b.code === 'TRIAL_BALANCE_IMBALANCED');
    expect(blocker).toBeDefined();
    expect(blocker).toHaveProperty('code', 'TRIAL_BALANCE_IMBALANCED');
    expect(blocker).toHaveProperty('details');
    expect(blocker.details).toEqual(expect.any(Object));
    expect(res.body.proofSummary.trialBalanceBalanced).toBe(false);
  });

  it('balanced TB but Assets != L+E (e.g. Revenue not in BS buckets) => status not_ready with BALANCE_SHEET_EQUATION_FAILED', async () => {
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
    expect(res.body).toHaveProperty('contractVersion', 'v1');
    expect(res.body).toHaveProperty('status', 'not_ready');
    const blocker = res.body.blockers?.find((b: { code: string }) => b.code === 'BALANCE_SHEET_EQUATION_FAILED');
    expect(blocker).toBeDefined();
    expect(blocker).toHaveProperty('details');
    expect(blocker.details).toEqual(expect.any(Object));
    expect(res.body.proofSummary.trialBalanceBalanced).toBe(true);
    expect(res.body.proofSummary.balanceSheetEquationBalanced).toBe(false);
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
    expect(res.body).toHaveProperty('contractVersion', 'v1');
    expect(res.body).toHaveProperty('status', 'not_ready');
    const blocker = res.body.blockers?.find((b: { code: string }) => b.code === 'PLUG_ACCOUNTS_DETECTED');
    expect(blocker).toBeDefined();
    expect(blocker).toHaveProperty('details');
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
          { accountName: 'Retained Earnings', debit: 0, credit: 1000 },
        ],
        journalEntries: [
          { accountRef: 'Cash', debit: 100, credit: 0 },
          { accountRef: 'Retained Earnings', debit: 0, credit: 100 },
        ],
      });
    if (res.status === 503) return;
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('contractVersion', 'v1');
    expect(res.body.status).toBe('ready');
    expect(res.body.proofSummary.computedTotalsSummary).toMatchObject({
      totalDebits: 1100,
      totalCredits: 1100,
    });
  });

  describe('format query param', () => {
    it('default and format=json return JSON with same shape', async () => {
      if (!isDbConfigured()) return;
      const payload = {
        periodLabel: '2025-01',
        trialBalance: [
          { accountName: 'Cash', debit: 1000, credit: 0 },
          { accountName: 'Retained Earnings', debit: 0, credit: 1000 },
        ],
      };
      const resDefault = await request(app)
        .post('/api/precheck/board-ready')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send(payload);
      const resJson = await request(app)
        .post('/api/precheck/board-ready?format=json')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send(payload);
      if (resDefault.status === 503 || resJson.status === 503) return;
      expect(resDefault.status).toBe(200);
      expect(resJson.status).toBe(200);
      expect(resDefault.headers['content-type']).toMatch(/application\/json/);
      expect(resJson.headers['content-type']).toMatch(/application\/json/);
      expect(resDefault.body).toHaveProperty('contractVersion', 'v1');
      expect(resDefault.body).toHaveProperty('status');
      expect(resDefault.body).toHaveProperty('blockers');
      expect(resDefault.body).toHaveProperty('warnings');
      expect(resDefault.body).toHaveProperty('proofSummary');
      expect(resJson.body).toMatchObject({
        contractVersion: resDefault.body.contractVersion,
        status: resDefault.body.status,
      });
    });

    it('format=text returns text/plain with period, status, blockers, warnings, proof summary', async () => {
      if (!isDbConfigured()) return;
      const res = await request(app)
        .post('/api/precheck/board-ready?format=text')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          periodLabel: '2025-01',
          trialBalance: [
            { accountName: 'Cash', debit: 1000, credit: 0 },
            { accountName: 'Retained Earnings', debit: 0, credit: 1000 },
          ],
        });
      if (res.status === 503) return;
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      const text = res.text;
      expect(text).toContain('Period: 2025-01');
      expect(text).toContain('Status: ready');
      expect(text).toContain('Blockers:');
      expect(text).toContain('Warnings:');
      expect(text).toContain('Proof summary:');
      expect(text).toContain('Totals: Debits 1000  Credits 1000');
    });

    it('format=text with not_ready includes blocker code and remediation', async () => {
      if (!isDbConfigured()) return;
      const res = await request(app)
        .post('/api/precheck/board-ready?format=text')
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
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      const text = res.text;
      expect(text).toContain('Status: not_ready');
      expect(text).toContain('TRIAL_BALANCE_IMBALANCED');
      expect(text).toContain('Reconcile debits and credits');
    });
  });
});
