/**
 * Runtime mode: APP_MODE = "development" | "demo" | "production" (primary),
 * or legacy MODE = "dev" | "demo" | "prod".
 * Derives defaults for security/behavior flags.
 * In prod/demo, overrides that reduce security posture are forbidden.
 * In development, overrides allowed but logged.
 */

export type RuntimeMode = 'dev' | 'demo' | 'prod';

const VALID_MODES: RuntimeMode[] = ['dev', 'demo', 'prod'];

/** APP_MODE values; maps to RuntimeMode. */
export type AppMode = 'development' | 'demo' | 'production';

const APP_MODE_TO_RUNTIME: Record<string, RuntimeMode> = {
  development: 'dev',
  demo: 'demo',
  production: 'prod',
};

let _resolvedMode: RuntimeMode | null = null;

/**
 * Parse mode from env. APP_MODE (development|demo|production) takes precedence.
 * Fallback: MODE (dev|demo|prod), then NODE_ENV=production => 'prod', else 'dev'.
 */
function parseMode(): RuntimeMode {
  const appMode = process.env.APP_MODE?.toLowerCase().trim() ?? '';
  const mapped = appMode ? APP_MODE_TO_RUNTIME[appMode] : undefined;
  if (mapped) return mapped;

  const raw = process.env.MODE?.toLowerCase().trim();
  if (raw && VALID_MODES.includes(raw as RuntimeMode)) {
    return raw as RuntimeMode;
  }
  if (process.env.NODE_ENV === 'production') {
    return 'prod';
  }
  return 'dev';
}

/** Current APP_MODE string (development | demo | production). */
export function getAppMode(): AppMode {
  const m = getMode();
  if (m === 'dev') return 'development';
  if (m === 'demo') return 'demo';
  return 'production';
}

/** Get the resolved runtime mode (after applyModeDefaults). */
export function getMode(): RuntimeMode {
  if (_resolvedMode === null) {
    _resolvedMode = parseMode();
  }
  return _resolvedMode;
}

export function isDev(): boolean {
  return getMode() === 'dev';
}

export function isDemo(): boolean {
  return getMode() === 'demo';
}

export function isProd(): boolean {
  return getMode() === 'prod';
}

/** Reset cached mode (for tests). */
export function resetModeCache(): void {
  _resolvedMode = null;
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
 * Apply MODE-based defaults and enforce override policy.
 * Call at server startup before routes mount.
 * In prod/demo: force strict values; fail fast if env tries to override.
 * In dev: use env if set; otherwise permissive; log overrides.
 */
export function applyModeDefaults(): ModeConfig {
  _resolvedMode = parseMode();
  const mode = _resolvedMode;

  if (mode === 'prod' || mode === 'demo') {
    const strict = getStrictDefaults();

    // Fail fast: prod/demo cannot run with reduced security
    if (process.env.REQUIRE_AUTH === 'false') {
      const appModeStr = mode === 'prod' ? 'production' : 'demo';
      console.warn(`[FATAL] APP_MODE=${appModeStr}: REQUIRE_AUTH=false is not allowed. Auth is always enforced.`);
      throw new Error(
        `[FATAL] APP_MODE=${appModeStr}: REQUIRE_AUTH must not be false. Refusing to start.`
      );
    }
    if (process.env.REQUIRE_TENANT_CONTEXT === 'false') {
      throw new Error(
        `[FATAL] MODE=${mode}: REQUIRE_TENANT_CONTEXT must not be false. Refusing to start.`
      );
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
    if (process.env.AI_MOCK === 'true') {
      process.env.AI_MOCK = 'false';
    }
    if (process.env.AI_MOCK_CLASSIFIER === 'true') {
      process.env.AI_MOCK_CLASSIFIER = 'false';
    }
    if (process.env.AI_MOCK_ADVISOR === 'true') {
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

    if (mode === 'demo') {
      console.warn('\n╔══════════════════════════════════════════════════════════════╗');
      console.warn('║  Running in DEMO mode — auth enforced, demo user seeded      ║');
      console.warn('╚══════════════════════════════════════════════════════════════╝\n');
    }

    return strict;
  }

  // dev: permissive defaults, allow overrides, warn if auth/tenant off
  const cfg = getDevDefaults();
  if (!cfg.REQUIRE_AUTH || !cfg.REQUIRE_TENANT_CONTEXT) {
    console.warn(
      '[DEV] MODE=dev: Auth/tenant enforcement is OFF. NEVER use this in production.'
    );
  }
  return cfg;
}
