/**
 * Environment config: NODE_ENV=production disallows in-memory stores to prevent silent data loss.
 * Trust-critical flags (auth, tenant injection, bypass) come from getCurrentSecurityProfile().
 */

import { getCurrentSecurityProfile } from '../security/security_profile.js';

/** True when NODE_ENV is production. */
export const isProduction = (): boolean =>
  process.env.NODE_ENV === 'production';

/**
 * True only when body tenant injection is allowed (dev/diagnostic mode).
 * Delegates to SecurityProfile.tenantInjectionAllowed.
 */
export function isBodyTenantInjectionAllowed(): boolean {
  return getCurrentSecurityProfile().tenantInjectionAllowed;
}

/** Draft export allows imbalanced ledger. From profile. */
export const ALLOW_IMBALANCED_DRAFT_EXPORT = (): boolean =>
  getCurrentSecurityProfile().allowImbalancedDraftExport;

/** Legacy certified source. From profile. */
export const ALLOW_LEGACY_CERTIFIED_SOURCE = (): boolean =>
  getCurrentSecurityProfile().allowLegacyCertifiedSource;

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
