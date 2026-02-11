/**
 * Certification Artifact v1 integration tests.
 * A) After certify, close session has certification_artifact_id and artifact can be fetched.
 * B) Signature verifies: recompute artifactHash and verify signatureValid=true.
 * C) Tamper artifact (change periodLabel) -> signatureValid=false.
 * D) MODE=demo/prod: missing keys causes server startup failure.
 * E) Artifact includes snapshotId/hashVersion/hash and matches session certifiedSnapshotId.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { app } from '../../src/server.js';
import { isDbConfigured, getTenantPoolWithMigrations } from '../../src/db/index.js';
import { getTestAuthToken } from '../helpers/testHelpers.js';
import { queryControl } from '../../src/db/index.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';
import * as certArtifactRepo from '../../src/db/repositories/certification_artifact_repository.js';
import { createSnapshotFromTrialBalanceAndEntries } from '../../src/services/ledger_snapshot_service.js';
import { buildCertificationArtifact, computeArtifactHash } from '../../src/services/certification_artifact_service.js';
import { verifyArtifactHash } from '../../src/lib/cert_signing.js';
import { getArtifactByCloseSessionId } from '../../src/db/repositories/certification_artifact_repository.js';
import { assertSigningKeysInStrictMode } from '../../src/lib/cert_signing.js';
import { verifyChain } from '../../src/db/repositories/audit_ledger_repository.js';

const TENANT = 'cert-artifact-test-' + Date.now();
const BALANCED_CSV = `AccountName,Debit,Credit
Cash,100,0
Revenue,0,100`;

function generateEd25519Keys(): { privateKeyB64: string; publicKeyB64: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'pem', type: 'spki' },
  });
  return {
    privateKeyB64: Buffer.from(privateKey, 'utf8').toString('base64'),
    publicKeyB64: Buffer.from(publicKey, 'utf8').toString('base64'),
  };
}

describe('Certification Artifact v1', () => {
  let token: string;
  let keys: { privateKeyB64: string; publicKeyB64: string };
  let sessionId: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    const { resetSigningKeysCache } = await import('../../src/lib/cert_signing.js');
    resetSigningKeysCache();
    keys = generateEd25519Keys();
    process.env.CERT_SIGNING_PRIVATE_KEY = keys.privateKeyB64;
    process.env.CERT_SIGNING_PUBLIC_KEY = keys.publicKeyB64;
    await queryControl(
      "INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING",
      [TENANT, `Test ${TENANT}`]
    );
    token = getTestAuthToken(TENANT);
    const pool = await getTenantPoolWithMigrations(TENANT);
    const sess = await closeSessionRepo.insertCloseSession(
      pool,
      `sess-${Date.now()}`,
      TENANT,
      'entity-1',
      '2025-01-01',
      '2025-01-31',
      'accrual',
      'GAAP',
      'locked'
    );
    sessionId = sess.id;
    const snapshot = await createSnapshotFromTrialBalanceAndEntries(pool, {
      tenantId: TENANT,
      periodLabel: '2025-01',
      closeSessionId: sess.id,
      createdBy: 'test',
      source: 'close_session',
      trialBalance: {
        entries: [
          { accountName: 'Cash', debit: 100, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: 100 },
        ],
        totalDebits: 100,
        totalCredits: 100,
      },
    });
    const auditChainResult = await verifyChain(pool, TENANT);
    const certifiedAt = new Date().toISOString();
    const { artifact, artifactHash, signatureB64, publicKeyB64, alg } = buildCertificationArtifact({
      tenantId: TENANT,
      closeSessionId: sess.id,
      periodLabel: '2025-01',
      certifiedAt,
      certifiedBy: 'test@test.com',
      snapshotId: snapshot.id,
      snapshotHash: snapshot.snapshotHash,
      hashVersion: snapshot.hashVersion,
      snapshotPayload: snapshot.snapshotPayloadJson,
      auditChainResult,
    });
    const inserted = await certArtifactRepo.insertCertificationArtifact(pool, {
      tenantId: TENANT,
      closeSessionId: sess.id,
      periodLabel: '2025-01',
      artifact,
      artifactHash,
      signatureB64: signatureB64 || '',
      publicKeyB64: publicKeyB64 || '',
      alg,
    });
    await closeSessionRepo.updateCertification(
      pool,
      TENANT,
      sess.id,
      'test@test.com',
      certifiedAt,
      'Test',
      snapshot.id,
      inserted.id
    );
  });

  afterAll(async () => {
    delete process.env.CERT_SIGNING_PRIVATE_KEY;
    delete process.env.CERT_SIGNING_PUBLIC_KEY;
  });

  it('A) Artifact can be fetched for certified session and session has certification_artifact_id', async () => {
    if (!isDbConfigured()) return;

    const getRes = await request(app)
      .get(`/api/verification/certification/artifacts/${sessionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty('contractVersion', 'v1');
    expect(getRes.body).toHaveProperty('artifact');
    expect(getRes.body.artifact.closeSessionId).toBe(sessionId);
    expect(getRes.body).toHaveProperty('artifactHash');
    expect(getRes.body).toHaveProperty('signatureB64');
    expect(getRes.body).toHaveProperty('publicKeyB64');

    const pool = await getTenantPoolWithMigrations(TENANT);
    const session = await closeSessionRepo.getCloseSessionById(pool, TENANT, sessionId);
    expect(session?.certificationArtifactId).toBeDefined();
  });

  it('B) Signature verifies: recompute artifactHash and verify signatureValid=true', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPoolWithMigrations(TENANT);
    const row = await getArtifactByCloseSessionId(pool, TENANT, sessionId);
    if (!row) return;

    const computedHash = computeArtifactHash(row.artifact);
    expect(computedHash).toBe(row.artifactHash);

    if (row.signatureB64 && row.publicKeyB64) {
      const valid = verifyArtifactHash(computedHash, row.signatureB64, row.publicKeyB64);
      expect(valid).toBe(true);
    }
  });

  it('C) Tamper artifact (change periodLabel) -> signatureValid=false', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPoolWithMigrations(TENANT);
    const row = await getArtifactByCloseSessionId(pool, TENANT, sessionId);
    if (!row || !row.signatureB64 || !row.publicKeyB64) return;

    const tampered = { ...row.artifact, periodLabel: '2025-99' };
    const tamperedHash = computeArtifactHash(tampered);
    const valid = verifyArtifactHash(tamperedHash, row.signatureB64, row.publicKeyB64);
    expect(valid).toBe(false);
  });

  it('D) MODE=demo with NODE_ENV=production: missing keys causes assertSigningKeysInStrictMode to throw', async () => {
    const { resetSigningKeysCache } = await import('../../src/lib/cert_signing.js');
    const { resetModeCache } = await import('../../src/lib/runtime_mode.js');
    const origMode = process.env.MODE;
    const origNodeEnv = process.env.NODE_ENV;
    const origPriv = process.env.CERT_SIGNING_PRIVATE_KEY;
    const origPub = process.env.CERT_SIGNING_PUBLIC_KEY;
    resetSigningKeysCache();
    process.env.MODE = 'demo';
    process.env.NODE_ENV = 'production';
    delete process.env.CERT_SIGNING_PRIVATE_KEY;
    delete process.env.CERT_SIGNING_PUBLIC_KEY;
    resetModeCache();

    expect(() => assertSigningKeysInStrictMode()).toThrow(/Ed25519 signing keys required/);

    process.env.MODE = origMode;
    if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
    else delete process.env.NODE_ENV;
    if (origPriv !== undefined) process.env.CERT_SIGNING_PRIVATE_KEY = origPriv;
    else delete process.env.CERT_SIGNING_PRIVATE_KEY;
    if (origPub !== undefined) process.env.CERT_SIGNING_PUBLIC_KEY = origPub;
    else delete process.env.CERT_SIGNING_PUBLIC_KEY;
    resetModeCache();
  });

  it('E) Artifact includes snapshotId/hashVersion/hash and matches session', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPoolWithMigrations(TENANT);
    const row = await getArtifactByCloseSessionId(pool, TENANT, sessionId);
    if (!row) return;

    expect(row.artifact.snapshot).toBeDefined();
    expect(row.artifact.snapshot.snapshotId).toBeDefined();
    expect(row.artifact.snapshot.snapshotHash).toBeDefined();
    expect(row.artifact.snapshot.hashVersion).toBeDefined();

    const session = await closeSessionRepo.getCloseSessionById(pool, TENANT, sessionId);
    if (session?.certifiedSnapshotId) {
      expect(row.artifact.snapshot.snapshotId).toBe(session.certifiedSnapshotId);
    }
  });
});
