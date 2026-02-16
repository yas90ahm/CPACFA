/**
 * Runtime mode: delegates to security_profile for auth/tenant/bypass invariants.
 * MODE (or APP_MODE) + NODE_ENV drive getSecurityProfile(). This module provides
 * backward-compatible getters and applyModeDefaults() for startup.
 */

import {
  getCurrentSecurityProfile,
  getSecurityProfile,
  resetSecurityProfileCache,
  type SecurityAppMode,
} from '../security/security_profile.js';

export type RuntimeMode = 'dev' | 'demo' | 'staging' | 'prod';

/** Deployment modes — trusted; dev is excluded. */
export type DeploymentMode = 'demo' | 'staging' | 'prod';

const DEPLOYMENT_MODES: DeploymentMode[] = ['demo', 'staging', 'prod'];

/** APP_MODE values; maps to RuntimeMode. */
export type AppMode = 'development' | 'demo' | 'staging' | 'production';

/** Map SecurityAppMode to RuntimeMode. test is treated as dev. */
function toRuntimeMode(appMode: SecurityAppMode): RuntimeMode {
  return appMode === 'test' ? 'dev' : appMode;
}

export function getMode(): RuntimeMode {
  return toRuntimeMode(getCurrentSecurityProfile().appMode);
}

export function getRuntimeMode(): RuntimeMode {
  return getMode();
}

export function isDeploymentMode(): boolean {
  return DEPLOYMENT_MODES.includes(getMode() as DeploymentMode);
}

export function isStrictTrustMode(): boolean {
  const m = getMode();
  return m === 'prod' || m === 'staging';
}

export function isDev(): boolean {
  return getMode() === 'dev';
}

export function isDemo(): boolean {
  return getMode() === 'demo';
}

export function isStaging(): boolean {
  return getMode() === 'staging';
}

export function isProd(): boolean {
  return getMode() === 'prod';
}

export function getAppMode(): AppMode {
  const m = getMode();
  if (m === 'dev') return 'development';
  if (m === 'demo') return 'demo';
  if (m === 'staging') return 'staging';
  return 'production';
}

/** Reset cached profile (for tests). */
export function resetModeCache(): void {
  resetSecurityProfileCache();
}

export interface ModeConfig {
  REQUIRE_AUTH: boolean;
  REQUIRE_TENANT_CONTEXT: boolean;
  ENABLE_DEV_API: boolean;
  ALLOW_LEGACY_CERTIFIED_SOURCE: boolean;
  ALLOW_IMBALANCED_DRAFT_EXPORT: boolean;
  AI_MOCK: boolean;
  AI_MOCK_CLASSIFIER: boolean;
  AI_MOCK_ADVISOR: boolean;
  ABSOLUTE_URLS: boolean;
}

/** Build ModeConfig from profile + env (for AI/ABSOLUTE_URLS not in profile). */
function buildModeConfig(): ModeConfig {
  const p = getCurrentSecurityProfile();
  const isDeployment = p.appMode === 'prod' || p.appMode === 'staging' || p.appMode === 'demo';
  return {
    REQUIRE_AUTH: p.authRequired,
    REQUIRE_TENANT_CONTEXT: p.tenantContextRequired,
    ENABLE_DEV_API: p.enableDevApi,
    ALLOW_LEGACY_CERTIFIED_SOURCE: p.allowLegacyCertifiedSource,
    ALLOW_IMBALANCED_DRAFT_EXPORT: p.allowImbalancedDraftExport,
    AI_MOCK: isDeployment ? false : process.env.AI_MOCK === 'true',
    AI_MOCK_CLASSIFIER: isDeployment ? false : process.env.AI_MOCK_CLASSIFIER === 'true',
    AI_MOCK_ADVISOR: isDeployment ? false : process.env.AI_MOCK_ADVISOR === 'true',
    ABSOLUTE_URLS: process.env.ABSOLUTE_URLS === 'true',
  };
}

export function getEffectiveConfig(): ModeConfig {
  return buildModeConfig();
}

export function requireAuth(): boolean {
  return getCurrentSecurityProfile().authRequired;
}

export function requireTenantContext(): boolean {
  return getCurrentSecurityProfile().tenantContextRequired;
}

export function enableDevApi(): boolean {
  return getCurrentSecurityProfile().enableDevApi;
}

export function allowLegacyCertifiedSource(): boolean {
  return getCurrentSecurityProfile().allowLegacyCertifiedSource;
}

/**
 * Effective allowLegacyCertifiedSource for export/binder routes.
 * In prod/staging/demo: always false. In dev: profile value OR query param allowLegacyCertifiedSource=1.
 */
export function effectiveAllowLegacyCertifiedSource(req?: { query?: Record<string, unknown> }): boolean {
  const p = getCurrentSecurityProfile();
  if (p.appMode === 'prod' || p.appMode === 'staging' || p.appMode === 'demo') return false;
  return p.allowLegacyCertifiedSource || req?.query?.allowLegacyCertifiedSource === '1';
}

export function allowImbalancedDraftExport(): boolean {
  return getCurrentSecurityProfile().allowImbalancedDraftExport;
}

export function aiMock(): boolean {
  return getEffectiveConfig().AI_MOCK;
}

export function aiMockClassifier(): boolean {
  return getEffectiveConfig().AI_MOCK_CLASSIFIER;
}

export function aiMockAdvisor(): boolean {
  return getEffectiveConfig().AI_MOCK_ADVISOR;
}

export function absoluteUrls(): boolean {
  return getEffectiveConfig().ABSOLUTE_URLS;
}

function setEnv(key: string, value: boolean): void {
  process.env[key] = value ? 'true' : 'false';
}

/**
 * Apply MODE-based defaults and enforce override policy.
 * Call at server startup before routes mount.
 * Mutates process.env; then resets profile cache so next getCurrentSecurityProfile uses fresh env.
 */
export function applyModeDefaults(): ModeConfig {
  const profile = getSecurityProfile(process.env);
  const mode = toRuntimeMode(profile.appMode);

  if (mode === 'prod' || mode === 'staging' || mode === 'demo') {
    if (process.env.REQUIRE_AUTH === 'false') {
      console.warn(`[CRITICAL] MODE=${mode}: REQUIRE_AUTH=false is ignored. Auth is always enforced.`);
      setEnv('REQUIRE_AUTH', true);
    }
    if (process.env.REQUIRE_TENANT_CONTEXT === 'false') {
      throw new Error(`[FATAL] MODE=${mode}: REQUIRE_TENANT_CONTEXT must not be false. Refusing to start.`);
    }
    if (process.env.ENABLE_DEV_API === 'true') process.env.ENABLE_DEV_API = 'false';
    if (process.env.ALLOW_LEGACY_CERTIFIED_SOURCE === 'true') process.env.ALLOW_LEGACY_CERTIFIED_SOURCE = 'false';
    if (process.env.ALLOW_IMBALANCED_DRAFT_EXPORT === 'true') process.env.ALLOW_IMBALANCED_DRAFT_EXPORT = 'false';
    if (process.env.AI_MOCK === 'true' || process.env.AI_MOCK_CLASSIFIER === 'true' || process.env.AI_MOCK_ADVISOR === 'true') {
      process.env.AI_MOCK = 'false';
      process.env.AI_MOCK_CLASSIFIER = 'false';
      process.env.AI_MOCK_ADVISOR = 'false';
    }
    setEnv('REQUIRE_AUTH', true);
    setEnv('REQUIRE_TENANT_CONTEXT', true);
    process.env.ENABLE_DEV_API = 'false';
    process.env.ALLOW_LEGACY_CERTIFIED_SOURCE = 'false';
    process.env.ALLOW_IMBALANCED_DRAFT_EXPORT = 'false';
    process.env.AI_MOCK = 'false';
    process.env.AI_MOCK_CLASSIFIER = 'false';
    process.env.AI_MOCK_ADVISOR = 'false';

    if (mode === 'demo') {
      console.warn('\n╔══════════════════════════════════════════════════════════════╗');
      console.warn('║  Running in DEMO mode — auth enforced, demo user seeded      ║');
      console.warn('╚══════════════════════════════════════════════════════════════╝\n');
    }
    if (mode === 'staging') {
      console.warn('[MODE] STAGING — same trust posture as production.');
    }
  } else {
    const authRequired = process.env.REQUIRE_AUTH === 'true';
    const tenantRequired = process.env.REQUIRE_TENANT_CONTEXT === 'true';
    setEnv('REQUIRE_AUTH', authRequired);
    setEnv('REQUIRE_TENANT_CONTEXT', tenantRequired);
    if (!authRequired || !tenantRequired) {
      console.warn('[DEV] MODE=dev: Auth/tenant enforcement is OFF. NEVER use this in production.');
    }
  }

  resetSecurityProfileCache();
  return buildModeConfig();
}
