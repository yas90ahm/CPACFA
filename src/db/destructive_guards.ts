/**
 * Guards for destructive or seeding DB scripts.
 * Refuse unless explicitly allowed and refuse when DATABASE_URL looks like production.
 * Staging and production must NEVER allow destructive ops even if ALLOW_DB_RESET is set.
 */

/**
 * Allowed to run destructive/seed scripts only when:
 * - NODE_ENV === 'test' OR (ALLOW_DB_RESET === 'true' AND NODE_ENV is not staging/production).
 * Staging and production never allow.
 */
export function isAllowedForDestructive(): boolean {
  const nodeEnv = process.env.NODE_ENV ?? '';
  if (nodeEnv === 'staging' || nodeEnv === 'production') return false;
  if (process.env.NODE_ENV === 'test') return true;
  if (process.env.ALLOW_DB_RESET === 'true') return true;
  return false;
}

/**
 * Runtime guard: if NODE_ENV is staging or production and ALLOW_DB_RESET is true, log fatal and exit.
 * Prevents UAT/staging from running with destructive flag enabled.
 */
export function assertNoDestructiveInStagingOrProduction(): void {
  const nodeEnv = process.env.NODE_ENV ?? '';
  if (nodeEnv !== 'staging' && nodeEnv !== 'production') return;
  if (process.env.ALLOW_DB_RESET === 'true') {
    console.error('[FATAL] ALLOW_DB_RESET must not be true when NODE_ENV is staging or production. Refusing to start.');
    process.exit(1);
  }
}

/**
 * Returns true if the URL appears to point at production (refuse to run destructive/seed).
 */
export function looksLikeProduction(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes('prod') || lower.includes('production')) return true;
  if (/\bprod[-.]?\w*\.(supabase|aws|azure|gcp)/i.test(url)) return true;
  return false;
}
