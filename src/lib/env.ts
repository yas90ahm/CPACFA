/**
 * Environment config: NODE_ENV=production disallows in-memory stores to prevent silent data loss.
 * Use for HITL, trial balance, audit log, and any service that falls back to memory when DB/storage is missing.
 */

import { getMode } from './runtime_mode.js';

/** True when NODE_ENV is production. */
export const isProduction = (): boolean =>
  process.env.NODE_ENV === 'production';

/**
 * True only when body tenant injection is allowed (dev/diagnostic mode).
 * In prod/demo, or when REQUIRE_AUTH/REQUIRE_TENANT_CONTEXT is true, returns false.
 * Centralized policy: tenantId must NEVER come from request body in strict modes.
 */
export function isBodyTenantInjectionAllowed(): boolean {
  const mode = getMode();
  if (mode === 'prod' || mode === 'demo') return false;
  if (process.env.REQUIRE_AUTH === 'true') return false;
  if (process.env.REQUIRE_TENANT_CONTEXT === 'true') return false;
  return true;
}

/** Policy B: when true, draft export allows imbalanced ledger and adds IMBALANCED watermark. Default false (Policy A: require balance). */
export const ALLOW_IMBALANCED_DRAFT_EXPORT = (): boolean =>
  process.env.ALLOW_IMBALANCED_DRAFT_EXPORT === 'true';

/** When true, certified binder/export may use legacy source (last registered statements) when no certified snapshot exists. Default false: require certified snapshot. */
export const ALLOW_LEGACY_CERTIFIED_SOURCE = (): boolean =>
  process.env.ALLOW_LEGACY_CERTIFIED_SOURCE === 'true';

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
