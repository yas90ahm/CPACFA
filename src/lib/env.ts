/**
 * Environment config: NODE_ENV=production disallows in-memory stores to prevent silent data loss.
 * Use for HITL, trial balance, audit log, and any service that falls back to memory when DB/storage is missing.
 *
 * Trust-critical flags (auth, certification, legacy) come from runtime_mode — MODE is the single source of truth.
 */

import { getMode, getEffectiveConfig, allowLegacyCertifiedSource as allowLegacyFromMode, allowImbalancedDraftExport as allowImbalancedFromMode } from './runtime_mode.js';

/** True when NODE_ENV is production. */
export const isProduction = (): boolean =>
  process.env.NODE_ENV === 'production';

/**
 * True only when body tenant injection is allowed (dev/diagnostic mode).
 * In prod/staging/demo: always false. In dev: when auth/tenant not strictly required.
 */
export function isBodyTenantInjectionAllowed(): boolean {
  const mode = getMode();
  if (mode === 'prod' || mode === 'staging' || mode === 'demo') return false;
  const cfg = getEffectiveConfig();
  if (cfg.REQUIRE_AUTH || cfg.REQUIRE_TENANT_CONTEXT) return false;
  return true;
}

/** Policy B: draft export allows imbalanced ledger. From runtime_mode — in prod/staging/demo always false. */
export const ALLOW_IMBALANCED_DRAFT_EXPORT = (): boolean => allowImbalancedFromMode();

/** Legacy certified source. From runtime_mode — in prod/staging/demo always false. */
export const ALLOW_LEGACY_CERTIFIED_SOURCE = (): boolean => allowLegacyFromMode();

/**
 * When in production, throw if the caller would use an in-memory path (e.g. missing pool/tenantId or storage).
 * Call this before using any in-memory fallback.
 */
export function disallowMemoryStoreInProduction(context: {
  /** Human-readable name of the store or operation (e.g. 'audit log', 'HITL staging'). */
  storeName: string;
  /** If false, we are about to use memory; if true, we have a durable path. */
  hasDurableContext: boolean;
}): void {
  if (!isProduction()) return;
  if (context.hasDurableContext) return;
  throw new Error(
    `Production: in-memory store not allowed. ${context.storeName} requires durable context (DB pool/tenantId or storage).`
  );
}
