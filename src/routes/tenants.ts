/**
 * Tenant settings (BYOD): set database_url for customer-held DB.
 * Admin can only update their own tenant (tenantId from JWT).
 */

import { Router, Request, Response } from 'express';
import type { AuthRequest } from '../auth/middleware.js';
import { requireAuth } from '../auth/middleware.js';
import { queryControl, isDbConfigured } from '../db/index.js';
import { runTenantMigrationsForUrl } from '../db/migrate.js';
import { send500 } from '../lib/errorHandler.js';

const router = Router();

function isValidPostgresUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'postgres:' || u.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

/** PATCH /api/tenants/:id — Set or update database_url for BYOD. Require auth; caller must be in same tenant. */
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Tenant settings require DATABASE_URL (control DB)' });
    }
    const tenantId = (req as AuthRequest).tenantId;
    const targetId = req.params.id;
    if (tenantId !== targetId) {
      return res.status(403).json({ error: 'Forbidden: can only update your own tenant' });
    }
    const { databaseUrl, testConnection } = req.body ?? {};
    if (databaseUrl !== undefined && databaseUrl !== null) {
      if (typeof databaseUrl !== 'string') {
        return res.status(400).json({ error: 'databaseUrl must be a string' });
      }
      const trimmed = databaseUrl.trim();
      if (trimmed !== '' && !isValidPostgresUrl(trimmed)) {
        return res.status(400).json({ error: 'databaseUrl must be a valid postgres/postgresql URL' });
      }
      if (testConnection === true && trimmed !== '') {
        try {
          await runTenantMigrationsForUrl(trimmed);
        } catch (e) {
          return res.status(400).json({
            error: 'Connection test failed',
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
      const value = trimmed === '' ? null : trimmed;
      await queryControl(
        'UPDATE tenants SET database_url = $2, updated_at = NOW() WHERE id = $1',
        [targetId, value]
      );
    }
    const r = await queryControl<{ id: string; name: string; database_url: string | null }>(
      'SELECT id, name, database_url FROM tenants WHERE id = $1',
      [targetId]
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Tenant not found' });
    res.json({
      id: row.id,
      name: row.name,
      databaseUrlConfigured: Boolean(row.database_url && row.database_url.trim() !== ''),
    });
  } catch (e) {
    send500(res, e, 'Tenant update failed');
  }
});

/** GET /api/tenants/:id — Get tenant settings (databaseUrl not echoed). Caller must be in same tenant. */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Tenant settings require DATABASE_URL' });
    }
    const tenantId = (req as AuthRequest).tenantId;
    const targetId = req.params.id;
    if (tenantId !== targetId) {
      return res.status(403).json({ error: 'Forbidden: can only read your own tenant' });
    }
    const r = await queryControl<{ id: string; name: string; database_url: string | null }>(
      'SELECT id, name, database_url FROM tenants WHERE id = $1',
      [targetId]
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Tenant not found' });
    res.json({
      id: row.id,
      name: row.name,
      databaseUrlConfigured: Boolean(row.database_url && row.database_url.trim() !== ''),
    });
  } catch (e) {
    send500(res, e, 'Tenant fetch failed');
  }
});

export default router;
