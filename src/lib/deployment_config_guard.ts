/**
 * Deployment config guards: fail fast when prod/demo runs with auth/tenant enforcement disabled.
 * Uses MODE (dev|demo|prod) from runtime_mode. applyModeDefaults() must run first.
 */

import { getMode, isDev, isProd } from './runtime_mode.js';

function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

/** REQUIRE_AUTH is effectively false when explicitly set to 'false'. */
function isAuthEnforced(): boolean {
  return process.env.REQUIRE_AUTH !== 'false';
}

/** In prod/demo, REQUIRE_TENANT_CONTEXT=false is forbidden. */
function isTenantContextDisallowedInStrict(): boolean {
  const mode = getMode();
  return (mode === 'prod' || mode === 'demo') && process.env.REQUIRE_TENANT_CONTEXT === 'false';
}

/**
 * Fail fast at startup if prod/demo runs with auth/tenant enforcement disabled.
 * Call after applyModeDefaults().
 */
export function assertDeploymentConfigSafe(): void {
  if (isTest()) return;

  if (isProd()) {
    if (!isAuthEnforced()) {
      console.error('[FATAL] MODE=prod: REQUIRE_AUTH must not be false. Refusing to start.');
      process.exit(1);
    }
    if (isTenantContextDisallowedInStrict()) {
      console.error('[FATAL] MODE=prod: REQUIRE_TENANT_CONTEXT must not be false. Refusing to start.');
      process.exit(1);
    }
  }

  if (getMode() === 'demo') {
    if (!isAuthEnforced()) {
      console.error('[FATAL] MODE=demo: REQUIRE_AUTH must not be false. Refusing to start.');
      process.exit(1);
    }
    if (process.env.REQUIRE_TENANT_CONTEXT === 'false') {
      console.error('[FATAL] MODE=demo: REQUIRE_TENANT_CONTEXT must not be false. Refusing to start.');
      process.exit(1);
    }
  }
}

/**
 * Print a loud warning banner when dev mode runs with auth/tenant enforcement off.
 * Call after assertDeploymentConfigSafe when not in test.
 */
export function printDevModeEnforcementWarning(): void {
  if (isTest() || !isDev()) return;

  const authOff = !isAuthEnforced();
  const tenantOff = process.env.REQUIRE_TENANT_CONTEXT !== 'true';

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
    banner.push('║     REQUIRE_TENANT_CONTEXT!=true — in-memory fallbacks allowed            ║');
  }
  banner.push(
    '║     NEVER use this configuration in production.                            ║',
    '╚══════════════════════════════════════════════════════════════════════════════╝',
    ''
  );
  console.warn(banner.join('\n'));
}

/** For tests: parse env and return whether guard would pass (no exit). */
export function wouldDeploymentConfigPass(): { pass: boolean; reason?: string } {
  const mode = getMode();
  if (mode === 'prod') {
    if (!isAuthEnforced()) {
      return { pass: false, reason: 'MODE=prod requires REQUIRE_AUTH=true' };
    }
    if (isTenantContextDisallowedInStrict()) {
      return { pass: false, reason: 'MODE=prod requires REQUIRE_TENANT_CONTEXT=true' };
    }
  }
  if (mode === 'demo') {
    if (!isAuthEnforced()) {
      return { pass: false, reason: 'MODE=demo requires REQUIRE_AUTH=true' };
    }
    if (process.env.REQUIRE_TENANT_CONTEXT === 'false') {
      return { pass: false, reason: 'MODE=demo requires REQUIRE_TENANT_CONTEXT=true' };
    }
  }
  return { pass: true };
}
