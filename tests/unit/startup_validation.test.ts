/**
 * Unit tests for startup validation.
 * Mocks environment variables; asserts validation catches bad configs.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { validateEnv } from '../../src/startup_validation.js';
import { resetModeCache } from '../../src/lib/runtime_mode.js';
import { generateEd25519KeyPairBase64 } from '../../src/crypto/keygen.js';

describe('Startup validation', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    resetModeCache();
    // Snapshot env for restoration
    ['DATABASE_URL', 'JWT_SECRET', 'REQUIRE_AUTH', 'MODE', 'NODE_ENV', 'APP_MODE', 'ALLOW_IMBALANCED_DRAFT_EXPORT', 'ALLOW_LEGACY_CERTIFIED_SOURCE', 'CERT_SIGNING_PRIVATE_KEY', 'CERT_SIGNING_PUBLIC_KEY'].forEach(
      (k) => { originalEnv[k] = process.env[k]; }
    );
  });

  afterEach(() => {
    Object.entries(originalEnv).forEach(([k, v]) => {
      if (v !== undefined) process.env[k] = v;
      else delete process.env[k];
    });
    resetModeCache();
  });

  describe('validateEnv', () => {
    it('fails when DATABASE_URL is not set', () => {
      delete process.env.DATABASE_URL;
      process.env.MODE = 'dev';
      const result = validateEnv();
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('DATABASE_URL is not set. Set it in .env or environment.');
    });

    it('fails when DATABASE_URL is empty string', () => {
      process.env.DATABASE_URL = '   ';
      process.env.MODE = 'dev';
      const result = validateEnv();
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('DATABASE_URL'))).toBe(true);
    });

    it('passes when DATABASE_URL is set and MODE=dev', () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.MODE = 'dev';
      const result = validateEnv();
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when REQUIRE_AUTH=true and JWT_SECRET is not set', () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.REQUIRE_AUTH = 'true';
      process.env.JWT_SECRET = '';
      process.env.MODE = 'dev';
      const result = validateEnv();
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('JWT_SECRET is required when REQUIRE_AUTH=true.');
    });

    it('passes when REQUIRE_AUTH=true and JWT_SECRET is set', () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.REQUIRE_AUTH = 'true';
      process.env.JWT_SECRET = 'secret';
      process.env.MODE = 'dev';
      const result = validateEnv();
      expect(result.ok).toBe(true);
    });

    it('passes when REQUIRE_AUTH=false (JWT_SECRET not required)', () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.REQUIRE_AUTH = 'false';
      delete process.env.JWT_SECRET;
      process.env.MODE = 'dev';
      const result = validateEnv();
      expect(result.ok).toBe(true);
    });
  });

  describe('MODE=prod env consistency', () => {
    beforeEach(() => {
      process.env.MODE = 'prod';
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.JWT_SECRET = 'real-secret-for-prod-test-not-placeholder';
      process.env.AI_MOCK = 'false';
      process.env.AI_MOCK_CLASSIFIER = 'false';
      process.env.AI_MOCK_ADVISOR = 'false';
      const keys = generateEd25519KeyPairBase64();
      process.env.CERT_SIGNING_PRIVATE_KEY = keys.privateKeyB64;
      process.env.CERT_SIGNING_PUBLIC_KEY = keys.publicKeyB64;
    });

    it('fails when MODE=prod and REQUIRE_AUTH=false', () => {
      process.env.REQUIRE_AUTH = 'false';
      const result = validateEnv();
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('MODE=prod requires REQUIRE_AUTH=true.');
    });

    it('fails when MODE=prod and ALLOW_IMBALANCED_DRAFT_EXPORT=true', () => {
      process.env.REQUIRE_AUTH = 'true';
      process.env.ALLOW_IMBALANCED_DRAFT_EXPORT = 'true';
      const result = validateEnv();
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('MODE=prod requires ALLOW_IMBALANCED_DRAFT_EXPORT=false.');
    });

    it('fails when MODE=prod and ALLOW_LEGACY_CERTIFIED_SOURCE=true', () => {
      process.env.REQUIRE_AUTH = 'true';
      process.env.ALLOW_LEGACY_CERTIFIED_SOURCE = 'true';
      const result = validateEnv();
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('MODE=prod requires ALLOW_LEGACY_CERTIFIED_SOURCE=false.');
    });

    it('passes when MODE=prod with strict config', () => {
      process.env.REQUIRE_AUTH = 'true';
      process.env.ALLOW_IMBALANCED_DRAFT_EXPORT = 'false';
      process.env.ALLOW_LEGACY_CERTIFIED_SOURCE = 'false';
      const result = validateEnv();
      expect(result.ok).toBe(true);
    });
  });

  describe('MODE=dev allows relaxed config', () => {
    beforeEach(() => {
      process.env.MODE = 'dev';
      process.env.DATABASE_URL = 'postgres://localhost/test';
    });

    it('passes when MODE=dev and REQUIRE_AUTH=false', () => {
      process.env.REQUIRE_AUTH = 'false';
      const result = validateEnv();
      expect(result.ok).toBe(true);
    });

    it('passes when MODE=dev and ALLOW_IMBALANCED_DRAFT_EXPORT=true', () => {
      process.env.ALLOW_IMBALANCED_DRAFT_EXPORT = 'true';
      const result = validateEnv();
      expect(result.ok).toBe(true);
    });
  });

  describe('APP_MODE=production rejects REQUIRE_AUTH=false', () => {
    beforeEach(() => {
      process.env.APP_MODE = 'production';
      process.env.MODE = 'production';
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.JWT_SECRET = 'real-secret-for-production';
      const keys = generateEd25519KeyPairBase64();
      process.env.CERT_SIGNING_PRIVATE_KEY = keys.privateKeyB64;
      process.env.CERT_SIGNING_PUBLIC_KEY = keys.publicKeyB64;
    });

    it('fails when REQUIRE_AUTH=false in production', () => {
      process.env.REQUIRE_AUTH = 'false';
      const result = validateEnv();
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('REQUIRE_AUTH'))).toBe(true);
    });
  });

  describe('MODE=prod Ed25519 keys required', () => {
    beforeEach(() => {
      process.env.APP_MODE = 'production';
      process.env.MODE = 'prod';
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.JWT_SECRET = 'real-secret-for-production';
      process.env.REQUIRE_AUTH = 'true';
      process.env.ALLOW_IMBALANCED_DRAFT_EXPORT = 'false';
      process.env.ALLOW_LEGACY_CERTIFIED_SOURCE = 'false';
      process.env.AI_MOCK = 'false';
      process.env.AI_MOCK_CLASSIFIER = 'false';
      process.env.AI_MOCK_ADVISOR = 'false';
    });

    it('fails when CERT_SIGNING keys are missing in production', () => {
      delete process.env.CERT_SIGNING_PRIVATE_KEY;
      delete process.env.CERT_SIGNING_PUBLIC_KEY;
      const result = validateEnv();
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('Ed25519 signing keys required'))).toBe(true);
      expect(result.errors.some((e) => e.includes('keygen.ts'))).toBe(true);
    });

    it('passes when CERT_SIGNING keys are set in production', () => {
      const keys = generateEd25519KeyPairBase64();
      process.env.CERT_SIGNING_PRIVATE_KEY = keys.privateKeyB64;
      process.env.CERT_SIGNING_PUBLIC_KEY = keys.publicKeyB64;
      const result = validateEnv();
      expect(result.ok).toBe(true);
    });

    it('fails when JWT_SECRET is dev-secret-change-in-prod placeholder', () => {
      process.env.JWT_SECRET = 'dev-secret-change-in-prod';
      const keys = generateEd25519KeyPairBase64();
      process.env.CERT_SIGNING_PRIVATE_KEY = keys.privateKeyB64;
      process.env.CERT_SIGNING_PUBLIC_KEY = keys.publicKeyB64;
      const result = validateEnv();
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('JWT_SECRET') && e.includes('placeholder'))).toBe(true);
    });
  });

  describe('multiple errors', () => {
    it('collects all env errors', () => {
      delete process.env.DATABASE_URL;
      process.env.REQUIRE_AUTH = 'true';
      delete process.env.JWT_SECRET;
      process.env.MODE = 'prod';
      process.env.ALLOW_IMBALANCED_DRAFT_EXPORT = 'true';
      const result = validateEnv();
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors).toContain('DATABASE_URL is not set. Set it in .env or environment.');
      expect(result.errors).toContain('JWT_SECRET is required when REQUIRE_AUTH=true.');
    });
  });
});
