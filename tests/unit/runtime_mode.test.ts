/**
 * Runtime mode: MODE parsing, applyModeDefaults, enforcement.
 * A) MODE=prod + REQUIRE_AUTH=false => warns and forces true (does not throw)
 * B) MODE=demo + ENABLE_DEV_API=true => forces false
 * C) MODE=dev default => permissive but warns (config state)
 * D) NODE_ENV=production and MODE unset => mode resolves to prod
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  getMode,
  isDev,
  isDemo,
  isProd,
  resetModeCache,
  applyModeDefaults,
} from '../../src/lib/runtime_mode.js';

describe('Runtime mode', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMode = process.env.MODE;
  const originalRequireAuth = process.env.REQUIRE_AUTH;
  const originalRequireTenantContext = process.env.REQUIRE_TENANT_CONTEXT;
  const originalEnableDevApi = process.env.ENABLE_DEV_API;
  const originalAllowLegacy = process.env.ALLOW_LEGACY_CERTIFIED_SOURCE;
  const originalAllowImbalanced = process.env.ALLOW_IMBALANCED_DRAFT_EXPORT;
  const originalAiMock = process.env.AI_MOCK;

  beforeEach(() => resetModeCache());
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalMode !== undefined) process.env.MODE = originalMode;
    else delete process.env.MODE;
    process.env.REQUIRE_AUTH = originalRequireAuth;
    process.env.REQUIRE_TENANT_CONTEXT = originalRequireTenantContext;
    process.env.ENABLE_DEV_API = originalEnableDevApi;
    process.env.ALLOW_LEGACY_CERTIFIED_SOURCE = originalAllowLegacy;
    process.env.ALLOW_IMBALANCED_DRAFT_EXPORT = originalAllowImbalanced;
    process.env.AI_MOCK = originalAiMock;
    resetModeCache();
  });

  describe('parseMode / getMode', () => {
    it('D) NODE_ENV=production and MODE unset => mode resolves to prod', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.MODE;
      const mode = getMode();
      expect(mode).toBe('prod');
      expect(isProd()).toBe(true);
      expect(isDev()).toBe(false);
      expect(isDemo()).toBe(false);
    });

    it('MODE=dev overrides NODE_ENV', () => {
      process.env.NODE_ENV = 'production';
      process.env.MODE = 'dev';
      expect(getMode()).toBe('dev');
      expect(isDev()).toBe(true);
    });

    it('MODE=demo overrides NODE_ENV', () => {
      process.env.NODE_ENV = 'test';
      process.env.MODE = 'demo';
      expect(getMode()).toBe('demo');
      expect(isDemo()).toBe(true);
    });

    it('NODE_ENV=test and MODE unset => dev', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.MODE;
      expect(getMode()).toBe('dev');
    });
  });

  describe('applyModeDefaults', () => {
    it('A) MODE=prod + REQUIRE_AUTH=false => warns and forces true (does not throw)', () => {
      process.env.MODE = 'prod';
      process.env.NODE_ENV = 'production';
      process.env.REQUIRE_AUTH = 'false';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      expect(() => applyModeDefaults()).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/MODE=prod.*REQUIRE_AUTH=false is ignored/)
      );
      warnSpy.mockRestore();
    });

    it('A) MODE=prod + REQUIRE_TENANT_CONTEXT=false => throws', () => {
      process.env.MODE = 'prod';
      process.env.NODE_ENV = 'production';
      process.env.REQUIRE_AUTH = 'true';
      process.env.REQUIRE_TENANT_CONTEXT = 'false';
      expect(() => applyModeDefaults()).toThrow(/MODE=prod.*REQUIRE_TENANT_CONTEXT must not be false/);
    });

    it('B) MODE=demo + ENABLE_DEV_API=true => forces false', () => {
      process.env.MODE = 'demo';
      process.env.NODE_ENV = 'development';
      process.env.REQUIRE_AUTH = 'true';
      process.env.REQUIRE_TENANT_CONTEXT = 'true';
      process.env.ENABLE_DEV_API = 'true';
      applyModeDefaults();
      expect(process.env.ENABLE_DEV_API).toBe('false');
    });

    it('MODE=prod forces strict values', () => {
      process.env.MODE = 'prod';
      process.env.NODE_ENV = 'production';
      process.env.REQUIRE_AUTH = 'true';
      process.env.REQUIRE_TENANT_CONTEXT = 'true';
      process.env.ALLOW_LEGACY_CERTIFIED_SOURCE = 'true';
      process.env.ALLOW_IMBALANCED_DRAFT_EXPORT = 'true';
      process.env.AI_MOCK = 'true';
      applyModeDefaults();
      expect(process.env.ALLOW_LEGACY_CERTIFIED_SOURCE).toBe('false');
      expect(process.env.ALLOW_IMBALANCED_DRAFT_EXPORT).toBe('false');
      expect(process.env.AI_MOCK).toBe('false');
    });

    it('C) MODE=dev default => permissive (config state)', () => {
      process.env.MODE = 'dev';
      process.env.NODE_ENV = 'test';
      process.env.REQUIRE_AUTH = 'false';
      process.env.REQUIRE_TENANT_CONTEXT = 'false';
      const cfg = applyModeDefaults();
      expect(cfg.REQUIRE_AUTH).toBe(false);
      expect(cfg.REQUIRE_TENANT_CONTEXT).toBe(false);
      expect(cfg.ENABLE_DEV_API).toBe(false);
      expect(process.env.REQUIRE_AUTH).toBe('false');
    });

    it('C) MODE=dev with ENABLE_DEV_API=true => allows it', () => {
      process.env.MODE = 'dev';
      process.env.NODE_ENV = 'test';
      process.env.ENABLE_DEV_API = 'true';
      const cfg = applyModeDefaults();
      expect(cfg.ENABLE_DEV_API).toBe(true);
      expect(process.env.ENABLE_DEV_API).toBe('true');
    });

    it('MODE=demo shows banner', () => {
      process.env.MODE = 'demo';
      process.env.REQUIRE_AUTH = 'true';
      process.env.REQUIRE_TENANT_CONTEXT = 'true';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      applyModeDefaults();
      expect(warnSpy).toHaveBeenCalled();
      const output = warnSpy.mock.calls.flat().join('\n');
      expect(output).toContain('DEMO');
      expect(output).toContain('auth enforced');
      warnSpy.mockRestore();
    });
  });
});
