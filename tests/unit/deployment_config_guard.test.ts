/**
 * Unit tests for deployment config guard logic.
 * Tests wouldDeploymentConfigPass (no process.exit) to verify env parsing.
 * Uses MODE (dev|demo|prod); MODE overrides NODE_ENV when set.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  wouldDeploymentConfigPass,
  printDevModeEnforcementWarning,
} from '../../src/lib/deployment_config_guard.js';
import { resetModeCache } from '../../src/lib/runtime_mode.js';

describe('Deployment config guard', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRequireAuth = process.env.REQUIRE_AUTH;
  const originalRequireTenantContext = process.env.REQUIRE_TENANT_CONTEXT;
  const originalMode = process.env.MODE;

  beforeEach(() => {
    resetModeCache();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.REQUIRE_AUTH = originalRequireAuth;
    process.env.REQUIRE_TENANT_CONTEXT = originalRequireTenantContext;
    if (originalMode !== undefined) process.env.MODE = originalMode;
    else delete process.env.MODE;
    resetModeCache();
  });

  describe('MODE=prod', () => {
    beforeEach(() => {
      process.env.MODE = 'prod';
      process.env.NODE_ENV = 'production';
    });

    it('passes when REQUIRE_AUTH unset (defaults to enforced)', () => {
      delete process.env.REQUIRE_AUTH;
      process.env.REQUIRE_TENANT_CONTEXT = 'true';
      expect(wouldDeploymentConfigPass()).toEqual({ pass: true });
    });

    it('passes when REQUIRE_AUTH=true and REQUIRE_TENANT_CONTEXT=true', () => {
      process.env.REQUIRE_AUTH = 'true';
      process.env.REQUIRE_TENANT_CONTEXT = 'true';
      expect(wouldDeploymentConfigPass()).toEqual({ pass: true });
    });

    it('fails when REQUIRE_AUTH=false', () => {
      process.env.REQUIRE_AUTH = 'false';
      process.env.REQUIRE_TENANT_CONTEXT = 'true';
      expect(wouldDeploymentConfigPass()).toEqual({
        pass: false,
        reason: 'MODE=prod requires REQUIRE_AUTH=true',
      });
    });

    it('fails when REQUIRE_TENANT_CONTEXT=false', () => {
      process.env.REQUIRE_AUTH = 'true';
      process.env.REQUIRE_TENANT_CONTEXT = 'false';
      expect(wouldDeploymentConfigPass()).toEqual({
        pass: false,
        reason: 'MODE=prod requires REQUIRE_TENANT_CONTEXT=true',
      });
    });

    it('passes when REQUIRE_TENANT_CONTEXT unset in production', () => {
      process.env.REQUIRE_AUTH = 'true';
      delete process.env.REQUIRE_TENANT_CONTEXT;
      expect(wouldDeploymentConfigPass()).toEqual({ pass: true });
    });
  });

  describe('MODE=demo', () => {
    beforeEach(() => {
      process.env.MODE = 'demo';
      process.env.NODE_ENV = 'development';
    });

    it('fails when MODE=demo and REQUIRE_AUTH=false', () => {
      process.env.REQUIRE_AUTH = 'false';
      process.env.REQUIRE_TENANT_CONTEXT = 'true';
      expect(wouldDeploymentConfigPass()).toEqual({
        pass: false,
        reason: 'MODE=demo requires REQUIRE_AUTH=true',
      });
    });

    it('fails when MODE=demo and REQUIRE_TENANT_CONTEXT=false', () => {
      process.env.REQUIRE_AUTH = 'true';
      process.env.REQUIRE_TENANT_CONTEXT = 'false';
      expect(wouldDeploymentConfigPass()).toEqual({
        pass: false,
        reason: 'MODE=demo requires REQUIRE_TENANT_CONTEXT=true',
      });
    });

    it('passes when MODE=demo and both enforced', () => {
      process.env.REQUIRE_AUTH = 'true';
      process.env.REQUIRE_TENANT_CONTEXT = 'true';
      expect(wouldDeploymentConfigPass()).toEqual({ pass: true });
    });
  });

  describe('MODE=dev', () => {
    beforeEach(() => {
      process.env.MODE = 'dev';
      process.env.NODE_ENV = 'development';
    });

    it('passes when REQUIRE_AUTH=false (dev allows relaxed config)', () => {
      process.env.REQUIRE_AUTH = 'false';
      process.env.REQUIRE_TENANT_CONTEXT = 'false';
      expect(wouldDeploymentConfigPass()).toEqual({ pass: true });
    });
  });

  describe('test', () => {
    it('assertDeploymentConfigSafe does not run in test (guard skips)', () => {
      process.env.NODE_ENV = 'test';
      process.env.MODE = 'dev';
      process.env.REQUIRE_AUTH = 'false';
      process.env.REQUIRE_TENANT_CONTEXT = 'false';
      expect(wouldDeploymentConfigPass()).toEqual({ pass: true });
    });
  });

  describe('printDevModeEnforcementWarning', () => {
    it('prints warning when dev has REQUIRE_AUTH=false', () => {
      process.env.MODE = 'dev';
      process.env.NODE_ENV = 'development';
      process.env.REQUIRE_AUTH = 'false';
      process.env.REQUIRE_TENANT_CONTEXT = 'true';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      printDevModeEnforcementWarning();
      expect(warnSpy).toHaveBeenCalled();
      const output = warnSpy.mock.calls.flat().join('\n');
      expect(output).toContain('REQUIRE_AUTH=false');
      expect(output).toContain('NEVER use this configuration in production');
      warnSpy.mockRestore();
    });

    it('does not print when dev has both enforced', () => {
      process.env.MODE = 'dev';
      process.env.NODE_ENV = 'development';
      process.env.REQUIRE_AUTH = 'true';
      process.env.REQUIRE_TENANT_CONTEXT = 'true';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      printDevModeEnforcementWarning();
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('does not print when MODE=prod', () => {
      process.env.MODE = 'prod';
      process.env.NODE_ENV = 'production';
      process.env.REQUIRE_AUTH = 'false';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      printDevModeEnforcementWarning();
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
