/**
 * Runtime mode: MODE is the single source of truth.
 * Allowed deployment values: demo | staging | prod
 * Dev (dev) is for local development and tests only — never in production.
 *
 * In prod/staging/demo: no env flag may weaken trust posture.
 * If MODE=prod and required crypto/security flags are missing, server refuses to start.
 */

export type RuntimeMode = 'dev' | 'demo' | 'staging' | 'prod';

/** Deployment modes — trusted; dev is excluded. */
export type DeploymentMode = 'demo' | 'staging' | 'prod';

const VALID_MODES: RuntimeMode[] = ['dev', 'demo', 'staging', 'prod'];
const DEPLOYMENT_MODES: DeploymentMode[] = ['demo', 'staging', 'prod'];

/** APP_MODE values; maps to RuntimeMode. */
export type AppMode = 'development' | 'demo' | 'staging' | 'production';

const APP_MODE_TO_RUNTIME: Record<string, RuntimeMode> = {
  development: 'dev',
  dev: 'dev',
  demo: 'demo',
  staging: 'staging',
  production: 'prod',
  prod: 'prod',
};

let _resolvedMode: RuntimeMode | null = null;
let _resolvedConfig: ModeConfig | null = null;

/**
 * Parse mode from env. MODE (primary) or APP_MODE.
 * Fallback: NODE_ENV=production => 'prod', else 'dev'.
 */
function parseMode(): RuntimeMode {
  const modeRaw = process.env.MODE?.toLowerCase().trim() ?? process.env.APP_MODE?.toLowerCase().trim() ?? '';
  const mapped = modeRaw ? APP_MODE_TO_RUNTIME[modeRaw] : undefined;
  if (mapped) return mapped;

  if (VALID_MODES.includes(modeRaw as RuntimeMode)) {
    return modeRaw as RuntimeMode;
  }
  if (process.env.NODE_ENV === 'production') {
    return 'prod';
  }
  return 'dev';
}

/** Get the resolved runtime mode. Call after applyModeDefaults() at startup. */
export function getMode(): RuntimeMode {
  if (_resolvedMode === null) {
    _resolvedMode = parseMode();
  }
  return _resolvedMode;
}

/**
 * Get runtime mode. For deployment, returns demo | staging | prod.
 * Alias for getMode() — use when you need the canonical mode.
 */
export function getRuntimeMode(): RuntimeMode {
  return getMode();
}

/** True when mode is a deployment mode (demo, staging, prod). */
export function isDeploymentMode(): boolean {
  return DEPLOYMENT_MODES.includes(getMode() as DeploymentMode);
}

/** True when mode is prod or staging — strictest trust. */
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

/** Current APP_MODE string. */
export function getAppMode(): AppMode {
  const m = getMode();
  if (m === 'dev') return 'development';
  if (m === 'demo') return 'demo';
  if (m === 'staging') return 'staging';
  return 'production';
}

/** Reset cached mode and config (for tests). */
export function resetModeCache(): void {
  _resolvedMode = null;
  _resolvedConfig = null;
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

function getStrictDefaults(): ModeConfig {
  return {
    REQUIRE_AUTH: true,
    REQUIRE_TENANT_CONTEXT: true,
    ENABLE_DEV_API: false,
    ALLOW_LEGACY_CERTIFIED_SOURCE: false,
    ALLOW_IMBALANCED_DRAFT_EXPORT: false,
    AI_MOCK: false,
    AI_MOCK_CLASSIFIER: false,
    AI_MOCK_ADVISOR: false,
    ABSOLUTE_URLS: false,
  };
}

function getDevDefaults(): ModeConfig {
  return {
    REQUIRE_AUTH: process.env.REQUIRE_AUTH !== 'false',
    REQUIRE_TENANT_CONTEXT: process.env.REQUIRE_TENANT_CONTEXT === 'true',
    ENABLE_DEV_API: process.env.ENABLE_DEV_API === 'true',
    ALLOW_LEGACY_CERTIFIED_SOURCE: process.env.ALLOW_LEGACY_CERTIFIED_SOURCE === 'true',
    ALLOW_IMBALANCED_DRAFT_EXPORT: process.env.ALLOW_IMBALANCED_DRAFT_EXPORT === 'true',
    AI_MOCK: process.env.AI_MOCK === 'true',
    AI_MOCK_CLASSIFIER: process.env.AI_MOCK_CLASSIFIER === 'true',
    AI_MOCK_ADVISOR: process.env.AI_MOCK_ADVISOR === 'true',
    ABSOLUTE_URLS: process.env.ABSOLUTE_URLS === 'true',
  };
}

function setEnv(key: string, value: boolean): void {
  process.env[key] = value ? 'true' : 'false';
}

/**
 * Centralized helpers — use these instead of process.env.
 * Values come from cached _resolvedConfig after applyModeDefaults().
 * Auto-invokes applyModeDefaults() if not yet run (e.g. in tests).
 */
export function getEffectiveConfig(): ModeConfig {
  if (_resolvedConfig === null) {
    applyModeDefaults();
  }
  return _resolvedConfig!;
}

export function requireAuth(): boolean {
  return getEffectiveConfig().REQUIRE_AUTH;
}

export function requireTenantContext(): boolean {
  return getEffectiveConfig().REQUIRE_TENANT_CONTEXT;
}

export function enableDevApi(): boolean {
  return getEffectiveConfig().ENABLE_DEV_API;
}

/** In prod/staging/demo: always false. In dev: from env. */
export function allowLegacyCertifiedSource(): boolean {
  return getEffectiveConfig().ALLOW_LEGACY_CERTIFIED_SOURCE;
}

/**
 * Effective allowLegacyCertifiedSource for export/binder routes.
 * In prod/staging/demo: always false — query param is IGNORED (trust cannot be weakened).
 * In dev: config value OR query param allowLegacyCertifiedSource=1.
 */
export function effectiveAllowLegacyCertifiedSource(req?: { query?: Record<string, unknown> }): boolean {
  if (isProd() || isStaging() || isDemo()) return false;
  return allowLegacyCertifiedSource() || req?.query?.allowLegacyCertifiedSource === '1';
}

/** In prod/staging/demo: always false. In dev: from env. */
export function allowImbalancedDraftExport(): boolean {
  return getEffectiveConfig().ALLOW_IMBALANCED_DRAFT_EXPORT;
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

/**
 * Apply MODE-based defaults and enforce override policy.
 * Call at server startup before routes mount.
 * In prod/staging/demo: force strict values; env overrides are ignored or cause throw.
 * In dev: use env if set; otherwise permissive.
 */
export function applyModeDefaults(): ModeConfig {
  _resolvedMode = parseMode();
  const mode = _resolvedMode;

  if (mode === 'prod' || mode === 'staging' || mode === 'demo') {
    const strict = getStrictDefaults();

    if (process.env.REQUIRE_AUTH === 'false') {
      console.warn(`[CRITICAL] MODE=${mode}: REQUIRE_AUTH=false is ignored. Auth is always enforced.`);
      setEnv('REQUIRE_AUTH', true);
    }
    if (process.env.REQUIRE_TENANT_CONTEXT === 'false') {
      throw new Error(`[FATAL] MODE=${mode}: REQUIRE_TENANT_CONTEXT must not be false. Refusing to start.`);
    }
    if (process.env.ENABLE_DEV_API === 'true') {
      process.env.ENABLE_DEV_API = 'false';
    }
    if (process.env.ALLOW_LEGACY_CERTIFIED_SOURCE === 'true') {
      process.env.ALLOW_LEGACY_CERTIFIED_SOURCE = 'false';
    }
    if (process.env.ALLOW_IMBALANCED_DRAFT_EXPORT === 'true') {
      process.env.ALLOW_IMBALANCED_DRAFT_EXPORT = 'false';
    }
    if (process.env.AI_MOCK === 'true' || process.env.AI_MOCK_CLASSIFIER === 'true' || process.env.AI_MOCK_ADVISOR === 'true') {
      process.env.AI_MOCK = 'false';
      process.env.AI_MOCK_CLASSIFIER = 'false';
      process.env.AI_MOCK_ADVISOR = 'false';
    }

    setEnv('REQUIRE_AUTH', strict.REQUIRE_AUTH);
    setEnv('REQUIRE_TENANT_CONTEXT', strict.REQUIRE_TENANT_CONTEXT);
    process.env.ENABLE_DEV_API = 'false';
    process.env.ALLOW_LEGACY_CERTIFIED_SOURCE = 'false';
    process.env.ALLOW_IMBALANCED_DRAFT_EXPORT = 'false';
    process.env.AI_MOCK = 'false';
    process.env.AI_MOCK_CLASSIFIER = 'false';
    process.env.AI_MOCK_ADVISOR = 'false';

    _resolvedConfig = strict;

    if (mode === 'demo') {
      console.warn('\n╔══════════════════════════════════════════════════════════════╗');
      console.warn('║  Running in DEMO mode — auth enforced, demo user seeded      ║');
      console.warn('╚══════════════════════════════════════════════════════════════╝\n');
    }
    if (mode === 'staging') {
      console.warn('[MODE] STAGING — same trust posture as production.');
    }

    return strict;
  }

  // dev: permissive defaults, allow overrides
  const cfg = getDevDefaults();
  _resolvedConfig = cfg;
  setEnv('REQUIRE_AUTH', cfg.REQUIRE_AUTH);
  setEnv('REQUIRE_TENANT_CONTEXT', cfg.REQUIRE_TENANT_CONTEXT);
  if (!cfg.REQUIRE_AUTH || !cfg.REQUIRE_TENANT_CONTEXT) {
    console.warn('[DEV] MODE=dev: Auth/tenant enforcement is OFF. NEVER use this in production.');
  }
  return cfg;
}
