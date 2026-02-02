/**
 * Optional script to purge audit log rows older than retention (e.g. 7 years).
 * Run with: npx tsx scripts/purge_audit_log.ts (or ts-node). Requires DATABASE_URL.
 * Optionally set PURGE_TENANT_ID to purge only that tenant; otherwise purges all tenants.
 */

import { queryControl, getTenantPool, isDbConfigured } from '../src/db/index.js';
import { purgeRetention } from '../src/services/audit_log_service.js';
import { log } from '../src/lib/logger.js';

async function main(): Promise<void> {
  if (!isDbConfigured()) {
    log('error', 'DATABASE_URL is not set');
    process.exit(1);
  }
  const singleTenantId = process.env.PURGE_TENANT_ID;

  const tenantIds = singleTenantId
    ? [singleTenantId]
    : (await queryControl<{ id: string }>('SELECT id FROM tenants')).rows.map((row) => row.id);

  let totalDeleted = 0;
  for (const tenantId of tenantIds) {
    try {
      const pool = await getTenantPool(tenantId);
      const { deleted } = await purgeRetention({ pool, tenantId });
      totalDeleted += deleted;
      if (deleted > 0) {
        log('info', 'Purge complete for tenant', { tenantId, deleted });
      }
    } catch (err) {
      log('error', 'Purge failed for tenant', { tenantId, err: String(err) });
    }
  }
  log('info', 'Audit log retention purge finished', { tenants: tenantIds.length, totalDeleted });
  process.exit(0);
}

main().catch((err) => {
  log('error', 'Purge script failed', { err: String(err) });
  process.exit(1);
});
