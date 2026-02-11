/**
 * Integration tests: AI mutation boundary enforcement.
 *
 * Proves:
 * 1. AI proposals do NOT mutate period_trial_balance
 * 2. Human approval (resolve-ingest) DOES mutate period_trial_balance
 * 3. AI code has ZERO direct imports of deterministic table repositories
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
import * as persistence from '../../src/services/persistence_service.js';
import * as periodTbRepo from '../../src/db/repositories/period_trial_balance_repository.js';
import * as aiProposalsRepo from '../../src/db/repositories/tenant_ai_proposals_repository.js';

const PERIOD_LABEL = '2025-01';
const PERIOD_START = '2025-01-01';
const PERIOD_END = '2025-01-31';
const ENTITY_ID = 'entity-ai-boundaries';

// Imbalanced: debits 1000, credits 0
const IMBALANCED_TB_CSV = `AccountName,Debit,Credit
Cash,1000,0
Revenue,0,0`;

const FORBIDDEN_IMPORTS = [
  'period_trial_balance_repository',
  'ledger_snapshot_repository',
  'close_session_repository',
  'journal_entry_repository',
] as const;

describe('AI mutation boundaries', () => {
  let authToken: string;
  let testTenantId: string;
  let stagedId: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('AI mutation boundaries: DATABASE_URL not set; skipping.');
      return;
    }
    testTenantId = process.env.TEST_TENANT_ID ?? `ai-boundaries-tenant-${Date.now()}`;
    authToken = getTestAuthTokenWithRole(testTenantId, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [testTenantId, `Test ${testTenantId}`]
    );
  });

  // ---------------------------------------------------------------------------
  // 1. AI PROPOSAL DOES NOT MUTATE PERIOD_TRIAL_BALANCE
  // ---------------------------------------------------------------------------

  it('1. AI proposal does not mutate period_trial_balance: imbalanced TB → HITL staging; AI proposals; period_trial_balance empty', async () => {
    if (!isDbConfigured()) return;

    const prevClassifier = process.env.AI_MOCK_CLASSIFIER;
    const prevAdvisor = process.env.AI_MOCK_ADVISOR;
    process.env.AI_MOCK_CLASSIFIER = 'true';
    process.env.AI_MOCK_ADVISOR = 'true';
    const tmpCsv = path.join(os.tmpdir(), `ai-boundaries-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, IMBALANCED_TB_CSV, 'utf8');
    try {
      const res = await request(app)
        .post('/api/trial-balance/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', testTenantId)
        .field('periodLabel', PERIOD_LABEL)
        .attach('file', tmpCsv);

      expect(res.status).toBe(200);
      expect(res.body?.status).toBe('staged');
      expect(res.body?.stagedId).toBeDefined();
      expect(res.body?.imbalanceAmount).toBe(1000);
      stagedId = res.body.stagedId;
    } finally {
      fs.unlinkSync(tmpCsv);
      if (prevClassifier !== undefined) process.env.AI_MOCK_CLASSIFIER = prevClassifier;
      else delete process.env.AI_MOCK_CLASSIFIER;
      if (prevAdvisor !== undefined) process.env.AI_MOCK_ADVISOR = prevAdvisor;
      else delete process.env.AI_MOCK_ADVISOR;
    }

    const pool = await getTenantPool(testTenantId);

    // Assert: period_trial_balance has zero rows for this period
    const ptbRows = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM period_trial_balance WHERE tenant_id = $1 AND period_label = $2',
      [testTenantId, PERIOD_LABEL]
    );
    expect(ptbRows.rows.length).toBe(0);

    // Assert: tenant_hitl_staging has pending item
    const stagingItem = await persistence.getStagingItem(pool, testTenantId, stagedId);
    expect(stagingItem).toBeDefined();
    expect(stagingItem?.status).toBe('pending');
    expect((stagingItem?.payload as Record<string, unknown>)?.kind).toBe('trial_balance_ingest');

    // Assert: tenant_ai_proposals has proposals
    const proposals = await aiProposalsRepo.listProposalsByStaging(pool, testTenantId, stagedId);
    expect(proposals.length).toBeGreaterThanOrEqual(1);
    expect(proposals[0].proposal).toBeDefined();
    const payload = proposals[0].proposal as { proposals?: unknown[] };
    expect(Array.isArray(payload?.proposals)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 2. HUMAN APPROVAL MUTATES PERIOD_TRIAL_BALANCE
  // ---------------------------------------------------------------------------

  it('2. Human approval mutates period_trial_balance: resolve-ingest → period_trial_balance populated; staging item approved', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(testTenantId);
    let resolveStagedId = stagedId;
    if (!resolveStagedId) {
      const existingStaging = await pool.query<{ id: string }>(
        "SELECT id FROM tenant_hitl_staging WHERE tenant_id = $1 AND status = 'pending' AND payload->>'kind' = 'trial_balance_ingest' AND payload->>'periodLabel' = $2 ORDER BY created_at DESC LIMIT 1",
        [testTenantId, PERIOD_LABEL]
      );
      resolveStagedId = existingStaging.rows[0]?.id;
    }
    if (!resolveStagedId) {
      console.warn('No staging item found from test 1; skipping test 2.');
      return;
    }

    const adjustment = [
      {
        accountName: 'Retained Earnings',
        debit: 0,
        credit: 1000,
        amountProvenance: { kind: 'human_entered' as const, enteredBy: 'test-user' },
      },
    ];

    const res = await request(app)
      .post('/api/hitl/resolve-ingest')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ stagedId: resolveStagedId, adjustment });

    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);

    // Assert: period_trial_balance now has the period (balanced)
    const record = await periodTbRepo.getUnadjusted(pool, testTenantId, PERIOD_LABEL);
    expect(record).toBeDefined();
    expect(record!.entries.length).toBeGreaterThanOrEqual(1);
    const totalDebits = record!.entries.reduce((s, e) => s + (e.debit ?? 0), 0);
    const totalCredits = record!.entries.reduce((s, e) => s + (e.credit ?? 0), 0);
    expect(Math.abs(totalDebits - totalCredits)).toBeLessThan(0.01);

    // Assert: tenant_hitl_staging item status = 'approved'
    const itemAfter = await persistence.getStagingItem(pool, testTenantId, resolveStagedId);
    expect(itemAfter).toBeDefined();
    expect(itemAfter?.status).toBe('approved');
  });

  // ---------------------------------------------------------------------------
  // 3. AI CANNOT WRITE TO DETERMINISTIC TABLES (code audit)
  // ---------------------------------------------------------------------------

  it('3. AI cannot write to deterministic tables: zero direct imports from src/ai and src/agents', () => {
    const projectRoot = path.resolve(__dirname, '..', '..');
    const aiDirs = [
      path.join(projectRoot, 'src', 'ai'),
      path.join(projectRoot, 'src', 'agents'),
    ];

    const violations: { file: string; importName: string }[] = [];

    for (const dir of aiDirs) {
      if (!fs.existsSync(dir)) continue;
      const walk = (d: string) => {
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(d, ent.name);
          if (ent.isDirectory()) {
            if (ent.name !== 'node_modules') walk(full);
          } else if (ent.name.endsWith('.ts')) {
            const content = fs.readFileSync(full, 'utf8');
            for (const forbidden of FORBIDDEN_IMPORTS) {
              const importPattern = new RegExp(
                `(?:import|require)\\s*\\(?[^)]*${forbidden}[^)]*\\)?|from\\s+['\"][^'\"]*${forbidden}[^'\"]*['\"]`,
                'i'
              );
              if (importPattern.test(content)) {
                violations.push({ file: path.relative(projectRoot, full), importName: forbidden });
              }
            }
          }
        }
      };
      walk(dir);
    }

    expect(violations).toEqual([]);
  });
});
