/**
 * Certification gates: session readiness gate structure and cert_signing module.
 */

import assert from 'node:assert/strict';

describe('certification — Ed25519 signing module', () => {
  it('cert_signing exports sign and verify functions', async () => {
    const mod = await import('../../src/lib/cert_signing.js');
    assert.equal(typeof mod.signArtifactHash, 'function');
    assert.equal(typeof mod.verifyArtifactHash, 'function');
    assert.equal(typeof mod.getPublicKeyB64, 'function');
    assert.equal(typeof mod.isSigningConfigured, 'function');
  });

  it('sign → verify round-trip produces valid signature', async () => {
    const { signArtifactHash, verifyArtifactHash, resetSigningKeysCache } = await import('../../src/lib/cert_signing.js');
    const { createHash } = await import('crypto');
    resetSigningKeysCache();
    const payload = JSON.stringify({ test: 'certification', amount: '1234.56' });
    const hashHex = createHash('sha256').update(payload).digest('hex');
    const result = signArtifactHash(hashHex);
    assert.equal(typeof result.signatureB64, 'string');
    assert.ok(result.signatureB64.length > 0);
    const valid = verifyArtifactHash(hashHex, result.signatureB64, result.publicKeyB64);
    assert.equal(valid, true);
  });

  it('tampered hash fails verification', async () => {
    const { signArtifactHash, verifyArtifactHash, resetSigningKeysCache } = await import('../../src/lib/cert_signing.js');
    const { createHash } = await import('crypto');
    resetSigningKeysCache();
    const payload = JSON.stringify({ amount: '5000.00' });
    const hashHex = createHash('sha256').update(payload).digest('hex');
    const result = signArtifactHash(hashHex);
    const tamperedHash = createHash('sha256').update('tampered').digest('hex');
    const valid = verifyArtifactHash(tamperedHash, result.signatureB64, result.publicKeyB64);
    assert.equal(valid, false);
  });
});

describe('certification — session readiness gates structure', () => {
  it('session_readiness_gates_service exports getReadinessGates', async () => {
    const mod = await import('../../src/services/session_readiness_gates_service.js');
    assert.equal(typeof mod.getReadinessGates, 'function');
  });
});

describe('certification — cross-statement validation', () => {
  it('cross_statement_validation exports runCrossStatementValidationForCertification', async () => {
    const mod = await import('../../src/services/cross_statement_validation.js');
    assert.equal(typeof mod.runCrossStatementValidationForCertification, 'function');
  });

  it('A=L+E check catches imbalance', async () => {
    const { runCrossStatementValidationForCertification } = await import('../../src/services/cross_statement_validation.js');
    const bs = {
      totalAssets: 1000,
      totalLiabilities: 400,
      totalEquity: 500,
      assets: [{ label: 'Cash', amount: 1000 }],
      liabilities: [{ label: 'AP', amount: 400 }],
      equity: [{ label: 'RE', amount: 500 }],
    };
    const pl = { totalRevenue: 500, totalExpenses: 300, netIncome: 200, revenue: [], expenses: [] };
    const checks = runCrossStatementValidationForCertification(bs as any, pl as any, null, null);
    const bsCheck = checks.find((c) => c.check_name === 'balance_sheet_equation');
    assert.ok(bsCheck);
    assert.equal(bsCheck.passes, false);
  });

  it('A=L+E check passes when balanced', async () => {
    const { runCrossStatementValidationForCertification } = await import('../../src/services/cross_statement_validation.js');
    const bs = {
      totalAssets: 1000,
      totalLiabilities: 400,
      totalEquity: 600,
      assets: [{ label: 'Cash', amount: 1000 }],
      liabilities: [{ label: 'AP', amount: 400 }],
      equity: [{ label: 'RE', amount: 600 }],
    };
    const pl = { totalRevenue: 500, totalExpenses: 300, netIncome: 200, revenue: [], expenses: [] };
    const checks = runCrossStatementValidationForCertification(bs as any, pl as any, null, null);
    const bsCheck = checks.find((c) => c.check_name === 'balance_sheet_equation');
    assert.ok(bsCheck);
    assert.equal(bsCheck.passes, true);
  });
});
