/**
 * Tenant injection policy — isBodyTenantInjectionAllowed().
 * Body tenantId must NEVER be used in strict modes (MODE=prod/demo, REQUIRE_AUTH, REQUIRE_TENANT_CONTEXT).
 */

import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import { isBodyTenantInjectionAllowed } from '../../src/lib/env.js';
import { resetModeCache } from '../../src/lib/runtime_mode.js';

describe('isBodyTenantInjectionAllowed', () => {
  const originalMode = process.env.MODE;
  const originalRequireAuth = process.env.REQUIRE_AUTH;
  const originalRequireTenantContext = process.env.REQUIRE_TENANT_CONTEXT;

  beforeEach(() => resetModeCache());
  afterEach(() => {
    if (originalMode !== undefined) process.env.MODE = originalMode;
    else delete process.env.MODE;
    process.env.REQUIRE_AUTH = originalRequireAuth;
    process.env.REQUIRE_TENANT_CONTEXT = originalRequireTenantContext;
    resetModeCache();
  });

  it('returns false when MODE=prod', () => {
    process.env.MODE = 'prod';
    process.env.REQUIRE_AUTH = 'false';
    process.env.REQUIRE_TENANT_CONTEXT = 'false';
    expect(isBodyTenantInjectionAllowed()).toBe(false);
  });

  it('returns false when REQUIRE_AUTH=true', () => {
    process.env.MODE = 'dev';
    process.env.REQUIRE_AUTH = 'true';
    process.env.REQUIRE_TENANT_CONTEXT = 'false';
    expect(isBodyTenantInjectionAllowed()).toBe(false);
  });

  it('returns false when REQUIRE_TENANT_CONTEXT=true', () => {
    process.env.MODE = 'dev';
    process.env.REQUIRE_AUTH = 'false';
    process.env.REQUIRE_TENANT_CONTEXT = 'true';
    expect(isBodyTenantInjectionAllowed()).toBe(false);
  });

  it('returns false when MODE=demo', () => {
    process.env.MODE = 'demo';
    process.env.REQUIRE_AUTH = 'false';
    process.env.REQUIRE_TENANT_CONTEXT = 'false';
    expect(isBodyTenantInjectionAllowed()).toBe(false);
  });

  it('returns true only when MODE=dev and strict flags falsy (dev/diagnostic mode)', () => {
    process.env.MODE = 'dev';
    process.env.REQUIRE_AUTH = 'false';
    process.env.REQUIRE_TENANT_CONTEXT = 'false';
    expect(isBodyTenantInjectionAllowed()).toBe(true);
  });

  it('returns true when MODE=dev and env vars unset (lenient default)', () => {
    process.env.MODE = 'dev';
    delete process.env.REQUIRE_AUTH;
    delete process.env.REQUIRE_TENANT_CONTEXT;
    expect(isBodyTenantInjectionAllowed()).toBe(true);
  });
});
