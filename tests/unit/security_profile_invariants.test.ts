/**
 * Green gate: security_profile invariants for demo/prod.
 * CI runs these with MODE=demo and MODE=prod to ensure no unsafe profile.
 *
 * Invariants (demo/staging/prod):
 * - authRequired=true
 * - dangerousBypassAllowed=false
 * - tenantInjectionAllowed=false
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getSecurityProfile, resetSecurityProfileCache } from '../../src/security/security_profile.js';

const DEPLOYMENT_MODES = ['demo', 'staging', 'prod'] as const;

function envForMode(mode: (typeof DEPLOYMENT_MODES)[number]): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env };
  e.MODE = mode;
  e.NODE_ENV = mode === 'prod' ? 'production' : 'development';
  e.DATABASE_URL = 'postgres://localhost/test';
  e.JWT_SECRET = 'test-secret';
  e.REQUIRE_AUTH = 'true';
  e.REQUIRE_TENANT_CONTEXT = 'true';
  return e;
}

describe('Security profile invariants (demo/prod green gate)', () => {
  beforeEach(() => {
    resetSecurityProfileCache();
  });

  afterEach(() => {
    resetSecurityProfileCache();
  });

  for (const mode of DEPLOYMENT_MODES) {
    describe(`MODE=${mode}`, () => {
      it('authRequired must be true', () => {
        const env = envForMode(mode);
        const profile = getSecurityProfile(env);
        expect(profile.authRequired).toBe(true);
      });

      it('dangerousBypassAllowed must be false', () => {
        const env = envForMode(mode);
        env.ALLOW_LEGACY_CERTIFIED_SOURCE = 'true';
        env.ALLOW_IMBALANCED_DRAFT_EXPORT = 'true';
        env.ENABLE_DEV_API = 'true';
        const profile = getSecurityProfile(env);
        expect(profile.dangerousBypassAllowed).toBe(false);
      });

      it('tenantInjectionAllowed must be false', () => {
        const env = envForMode(mode);
        const profile = getSecurityProfile(env);
        expect(profile.tenantInjectionAllowed).toBe(false);
      });

      it('tenantContextRequired must be true', () => {
        const env = envForMode(mode);
        const profile = getSecurityProfile(env);
        expect(profile.tenantContextRequired).toBe(true);
      });
    });
  }
});
