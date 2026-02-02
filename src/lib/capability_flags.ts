/**
 * Product capability flags for commercialization: CPA-only, CFA-only, or Integrated.
 * Read from env; default true for full build so existing deployments behave unchanged.
 */

function envBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return defaultValue;
  return v === '1' || v.toLowerCase() === 'true' || v === 'yes';
}

/** CPA module (professional review, consolidation, disclosure, audit binder). */
export const ENABLE_CPA_MODULE = envBool('ENABLE_CPA_MODULE', true);

/** CFA module (DCF, LBO, portfolio, ratios, liquidity). */
export const ENABLE_CFA_MODULE = envBool('ENABLE_CFA_MODULE', true);

/** Integrated Supervisor: conflict detection, veto, export gate on unresolved conflicts. Only meaningful when both CPA and CFA are enabled. */
export const ENABLE_INTEGRATED_SUPERVISOR =
  ENABLE_CPA_MODULE && ENABLE_CFA_MODULE && envBool('ENABLE_INTEGRATED_SUPERVISOR', true);
