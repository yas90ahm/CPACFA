/**
 * Deployment config guards: fail fast when prod/staging/demo runs with auth/tenant disabled.
 * Uses getSecurityProfile() / getCurrentSecurityProfile() as single source of truth.
 */

import { getCurrentSecurityProfile, getSecurityProfile } from '../security/security_profile.js';

function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Fail fast at startup if prod/staging/demo has weak config.
 */
export function assertDeploymentConfigSafe(): void {
  if (isTest()) return;

  const p = getCurrentSecurityProfile();
  const isDeployment = p.appMode === 'prod' || p.appMode === 'staging' || p.appMode === 'demo';

  if (isDeployment) {
    if (!p.authRequired) {
      console.error(`[FATAL] MODE=${p.appMode}: REQUIRE_AUTH must be true. Refusing to start.`);
      process.exit(1);
    }
    if (!p.tenantContextRequired) {
      console.error(`[FATAL] MODE=${p.appMode}: REQUIRE_TENANT_CONTEXT must be true. Refusing to start.`);
      process.exit(1);
    }
    if (p.dangerousBypassAllowed) {
      console.error(`[FATAL] MODE=${p.appMode}: dangerousBypassAllowed must be false. Refusing to start.`);
      process.exit(1);
    }
    if (p.tenantInjectionAllowed) {
      console.error(`[FATAL] MODE=${p.appMode}: tenantInjectionAllowed must be false. Refusing to start.`);
      process.exit(1);
    }
  }
}

/**
 * Print warning when dev mode runs with auth/tenant enforcement off.
 */
export function printDevModeEnforcementWarning(): void {
  if (isTest()) return;

  const p = getCurrentSecurityProfile();
  if (p.appMode !== 'dev') return;

  const authOff = !p.authRequired;
  const tenantOff = !p.tenantContextRequired;
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

/** For tests: whether guard would pass. Checks raw env for invalid config in deployment modes. */
export function wouldDeploymentConfigPass(): { pass: boolean; reason?: string } {
  const profile = getSecurityProfile(process.env);
  const isDeployment = profile.appMode === 'prod' || profile.appMode === 'staging' || profile.appMode === 'demo';

  if (isDeployment) {
    if (process.env.REQUIRE_AUTH === 'false' || !profile.authRequired) {
      return { pass: false, reason: `MODE=${profile.appMode} requires REQUIRE_AUTH=true` };
    }
    if (process.env.REQUIRE_TENANT_CONTEXT === 'false' || !profile.tenantContextRequired) {
      return { pass: false, reason: `MODE=${profile.appMode} requires REQUIRE_TENANT_CONTEXT=true` };
    }
    if (profile.dangerousBypassAllowed) {
      return { pass: false, reason: `MODE=${profile.appMode} requires dangerousBypassAllowed=false` };
    }
    if (profile.tenantInjectionAllowed) {
      return { pass: false, reason: `MODE=${profile.appMode} requires tenantInjectionAllowed=false` };
    }
  }
  return { pass: true };
}
