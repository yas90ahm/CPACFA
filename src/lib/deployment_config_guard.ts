/**
 * Deployment config guards: fail fast when prod/staging/demo runs with auth/tenant disabled.
 * Uses MODE from runtime_mode. applyModeDefaults() must run first.
 */

import { getMode, isDev, requireAuth, getEffectiveConfig } from './runtime_mode.js';

function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Fail fast at startup if prod/staging/demo has weak config.
 * applyModeDefaults() already enforces; this is a belt-and-suspenders check.
 */
export function assertDeploymentConfigSafe(): void {
  if (isTest()) return;

  const mode = getMode();
  if (mode === 'prod' || mode === 'staging' || mode === 'demo') {
    const cfg = getEffectiveConfig();
    if (!cfg.REQUIRE_AUTH) {
      console.error(`[FATAL] MODE=${mode}: REQUIRE_AUTH must be true. Refusing to start.`);
      process.exit(1);
    }
    if (!cfg.REQUIRE_TENANT_CONTEXT) {
      console.error(`[FATAL] MODE=${mode}: REQUIRE_TENANT_CONTEXT must be true. Refusing to start.`);
      process.exit(1);
    }
  }
}

/**
 * Print warning when dev mode runs with auth/tenant enforcement off.
 */
export function printDevModeEnforcementWarning(): void {
  if (isTest() || !isDev()) return;

  const cfg = getEffectiveConfig();
  const authOff = !cfg.REQUIRE_AUTH;
  const tenantOff = !cfg.REQUIRE_TENANT_CONTEXT;

  if (!authOff && !tenantOff) return;

  const banner = [
    '',
    '╔══════════════════════════════════════════════════════════════════════════════╗',
    '║  ⚠️  DEV MODE: Auth/tenant enforcement is OFF                                ║',
  ];
  if (authOff) {
    banner.push('║     REQUIRE_AUTH=false — API accepts unauthenticated requests           ║');
  }
  if (tenantOff) {
    banner.push('║     REQUIRE_TENANT_CONTEXT=false — in-memory fallbacks allowed          ║');
  }
  banner.push(
    '║     NEVER use this configuration in production.                            ║',
    '╚══════════════════════════════════════════════════════════════════════════════╝',
    ''
  );
  console.warn(banner.join('\n'));
}

/** For tests: whether guard would pass. */
export function wouldDeploymentConfigPass(): { pass: boolean; reason?: string } {
  const mode = getMode();
  if (mode === 'prod' || mode === 'staging' || mode === 'demo') {
    if (!requireAuth()) {
      return { pass: false, reason: `MODE=${mode} requires REQUIRE_AUTH=true` };
    }
    const cfg = getEffectiveConfig();
    if (!cfg.REQUIRE_TENANT_CONTEXT) {
      return { pass: false, reason: `MODE=${mode} requires REQUIRE_TENANT_CONTEXT=true` };
    }
  }
  return { pass: true };
}

