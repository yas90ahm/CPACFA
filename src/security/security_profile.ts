/**
 * Security Profile — Single source of truth for environment/security invariants.
 *
 * Deterministic, auditable. All auth, tenant injection, and bypass logic derives from
 * getSecurityProfile(env). No scattered process.env checks elsewhere.
 */

/** Canonical app mode. test = NODE_ENV=test; others from MODE/APP_MODE. */
export type SecurityAppMode = 'dev' | 'test' | 'demo' | 'staging' | 'prod';

export interface SecurityProfile {
  /** Resolved app mode. test when NODE_ENV=test; else from MODE/APP_MODE. */
  appMode: SecurityAppMode;

  /**
   * Whether API requests must be authenticated.
   * prod/staging/demo: always true. dev/test: true only when REQUIRE_AUTH === 'true'.
   */
  authRequired: boolean;

  /**
   * Whether tenant context (tenantId, tenantPool) is required on requests.
   * prod/staging/demo: always true. dev/test: true only when REQUIRE_TENANT_CONTEXT === 'true'.
   */
  tenantContextRequired: boolean;

  /**
   * Whether body.tenantId can override JWT tenant (dev/diagnostic only).
   * prod/staging/demo: always false. dev/test: true only when auth and tenant context are not required.
   */
  tenantInjectionAllowed: boolean;

  /**
   * Whether dangerous bypasses are allowed (legacy certified source, imbalanced draft export, dev API).
   * prod/staging/demo: always false. dev/test: true when any such env flag is set.
   */
  dangerousBypassAllowed: boolean;

  /**
   * Allow legacy certified source (pre-snapshot export path). prod/staging/demo: false.
   * Routes may OR with query param allowLegacyCertifiedSource=1 in dev.
   */
  allowLegacyCertifiedSource: boolean;

  /**
   * Allow draft export when ledger is imbalanced. prod/staging/demo: false.
   */
  allowImbalancedDraftExport: boolean;

  /**
   * Mount /api-dev diagnostics router. Only in dev when ENABLE_DEV_API=true.
   */
  enableDevApi: boolean;

  /**
   * AI core writes to deterministic tables. Always false — no override.
   * Exists to make the invariant explicit and auditable.
   */
  aiCoreWritesAllowed: false;
}

const VALID_MODES = ['dev', 'demo', 'staging', 'prod'] as const;
const APP_MODE_MAP: Record<string, SecurityAppMode> = {
  development: 'dev',
  dev: 'dev',
  demo: 'demo',
  staging: 'staging',
  production: 'prod',
  prod: 'prod',
};

function parseAppMode(env: NodeJS.ProcessEnv): SecurityAppMode {
  const raw = (env.MODE ?? env.APP_MODE ?? '').toString().toLowerCase().trim();
  const mapped = raw ? APP_MODE_MAP[raw] : undefined;
  if (mapped) return mapped;
  if ((VALID_MODES as readonly string[]).includes(raw)) return raw as SecurityAppMode;
  if (env.NODE_ENV === 'production') return 'prod';
  if (env.NODE_ENV === 'test') return 'test';
  return 'dev';
}

/**
 * Compute security profile from env. Pure, deterministic.
 * Use getCurrentSecurityProfile() for the running app (cached).
 */
export function getSecurityProfile(env: NodeJS.ProcessEnv): SecurityProfile {
  const appMode = parseAppMode(env);
  const isDeployment = appMode === 'prod' || appMode === 'staging' || appMode === 'demo';

  let authRequired: boolean;
  let tenantContextRequired: boolean;
  let dangerousBypassAllowed: boolean;
  let allowLegacyCertifiedSource: boolean;
  let allowImbalancedDraftExport: boolean;
  let enableDevApi: boolean;

  if (isDeployment) {
    authRequired = true;
    tenantContextRequired = true;
    dangerousBypassAllowed = false;
    allowLegacyCertifiedSource = false;
    allowImbalancedDraftExport = false;
    enableDevApi = false;
  } else {
    authRequired = env.REQUIRE_AUTH === 'true';
    tenantContextRequired = env.REQUIRE_TENANT_CONTEXT === 'true';
    allowLegacyCertifiedSource = env.ALLOW_LEGACY_CERTIFIED_SOURCE === 'true';
    allowImbalancedDraftExport = env.ALLOW_IMBALANCED_DRAFT_EXPORT === 'true';
    enableDevApi = env.ENABLE_DEV_API === 'true';
    dangerousBypassAllowed =
      allowLegacyCertifiedSource || allowImbalancedDraftExport || enableDevApi;
  }

  const tenantInjectionAllowed =
    !isDeployment && !authRequired && !tenantContextRequired;

  return {
    appMode,
    authRequired,
    tenantContextRequired,
    tenantInjectionAllowed,
    dangerousBypassAllowed,
    allowLegacyCertifiedSource,
    allowImbalancedDraftExport,
    enableDevApi,
    aiCoreWritesAllowed: false,
  };
}

let _cached: SecurityProfile | null = null;

/** Get current profile (uses process.env, cached). Call resetSecurityProfileCache() in tests. */
export function getCurrentSecurityProfile(): SecurityProfile {
  if (_cached === null) {
    _cached = getSecurityProfile(process.env);
  }
  return _cached;
}

/** Reset cache. Call in tests after changing process.env. */
export function resetSecurityProfileCache(): void {
  _cached = null;
}
