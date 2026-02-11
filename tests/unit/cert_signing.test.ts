/**
 * Unit tests: Ed25519 cert signing — auto-generation, sign/verify, production guards.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  signArtifactHash,
  verifyArtifactHash,
  isSigningConfigured,
  resetSigningKeysCache,
} from '../../src/lib/cert_signing.js';
import { generateEd25519KeyPairBase64 } from '../../src/crypto/keygen.js';

describe('cert_signing', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    resetSigningKeysCache();
    ['CERT_SIGNING_PRIVATE_KEY', 'CERT_SIGNING_PUBLIC_KEY', 'NODE_ENV'].forEach((k) => {
      originalEnv[k] = process.env[k];
    });
  });

  afterEach(() => {
    Object.entries(originalEnv).forEach(([k, v]) => {
      if (v !== undefined) process.env[k] = v;
      else delete process.env[k];
    });
    resetSigningKeysCache();
  });

  describe('auto-generated keys in development', () => {
    beforeEach(() => {
      delete process.env.CERT_SIGNING_PRIVATE_KEY;
      delete process.env.CERT_SIGNING_PUBLIC_KEY;
      process.env.NODE_ENV = 'development';
    });

    it('auto-generated keys produce valid signature that verifies', () => {
      const hash = 'a'.repeat(64);
      const result = signArtifactHash(hash);
      expect(result.signed).toBe(true);
      expect(result.signatureB64).toBeTruthy();
      expect(result.publicKeyB64).toBeTruthy();
      expect(result.alg).toBe('ed25519');

      const ok = verifyArtifactHash(hash, result.signatureB64, result.publicKeyB64);
      expect(ok).toBe(true);
    });

    it('isSigningConfigured returns true when auto-generated', () => {
      signArtifactHash('aa');
      expect(isSigningConfigured()).toBe(true);
    });
  });

  describe('sign with key A, verify with key B fails', () => {
    beforeEach(() => {
      const keysA = generateEd25519KeyPairBase64();
      process.env.CERT_SIGNING_PRIVATE_KEY = keysA.privateKeyB64;
      process.env.CERT_SIGNING_PUBLIC_KEY = keysA.publicKeyB64;
      process.env.NODE_ENV = 'development';
    });

    it('verification fails when using different public key', () => {
      const hash = 'b'.repeat(64);
      const result = signArtifactHash(hash);
      expect(result.signed).toBe(true);

      const keysB = generateEd25519KeyPairBase64();
      const ok = verifyArtifactHash(hash, result.signatureB64, keysB.publicKeyB64);
      expect(ok).toBe(false);
    });
  });

  describe('explicit env keys', () => {
    beforeEach(() => {
      const keys = generateEd25519KeyPairBase64();
      process.env.CERT_SIGNING_PRIVATE_KEY = keys.privateKeyB64;
      process.env.CERT_SIGNING_PUBLIC_KEY = keys.publicKeyB64;
      process.env.NODE_ENV = 'development';
    });

    it('sign and verify round-trip', () => {
      const hash = 'c'.repeat(64);
      const result = signArtifactHash(hash);
      expect(result.signed).toBe(true);
      const ok = verifyArtifactHash(hash, result.signatureB64, result.publicKeyB64);
      expect(ok).toBe(true);
    });
  });
});
