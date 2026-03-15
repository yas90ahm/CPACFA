/**
 * Tenant settings (BYOD): create tenant, set database_url for customer-held DB.
 * POST creates a tenant; PATCH/GET require auth and same tenant.
 */

import { Router, Request, Response } from 'express';
import type { AuthRequest } from '../auth/middleware.js';
import { requireAuth } from '../auth/middleware.js';
import { requireRole } from '../middleware/requireRole.js';
import { queryControl, isDbConfigured, getTenantPoolWithMigrations } from '../db/index.js';
import { testConnectionForUrl, runTenantMigrationsForUrl } from '../db/migrate.js';
import { randomUUID } from 'crypto';
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

/** POST /api/tenants — Create tenant. Requires admin role. Optionally validate BYOD connection and run migrations. */
router.post('/', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Tenant creation requires DATABASE_URL (control DB)' });
    }
    const body = (req.body ?? {}) as { name?: string; databaseUrl?: string };
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'New Tenant';
    const databaseUrl = typeof body.databaseUrl === 'string' ? body.databaseUrl.trim() : undefined;
    const tenantId = randomUUID();

    let databaseConfigured = false;
    let migrationsRun = false;

    if (databaseUrl && databaseUrl !== '') {
      if (!isValidPostgresUrl(databaseUrl)) {
        return res.status(400).json({
          error: 'databaseUrl must be a valid postgres/postgresql URL',
        });
      }
      try {
        await testConnectionForUrl(databaseUrl);
      } catch (e) {
        return res.status(400).json({
          error: 'Cannot connect to provided database. Verify the connection string and ensure the database is accessible.',
          message: e instanceof Error ? e.message : String(e),
        });
      }
      try {
        await runTenantMigrationsForUrl(databaseUrl);
        migrationsRun = true;
      } catch (e) {
        return res.status(400).json({
          error: 'Migrations failed on tenant database',
          message: e instanceof Error ? e.message : String(e),
        });
      }
      databaseConfigured = true;
      await queryControl(
        'INSERT INTO tenants (id, name, database_url, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())',
        [tenantId, name, databaseUrl]
      );
    } else {
      await queryControl(
        'INSERT INTO tenants (id, name, database_url, created_at, updated_at) VALUES ($1, $2, NULL, NOW(), NOW())',
        [tenantId, name]
      );
      try {
        await getTenantPoolWithMigrations(tenantId);
        migrationsRun = true;
      } catch (e) {
        send500(res, e as Error, 'Tenant migrations failed');
        return;
      }
    }

    res.status(201).json({
      tenantId,
      status: 'active',
      databaseConfigured,
      migrationsRun,
    });
  } catch (e) {
    send500(res, e as Error, 'Tenant creation failed');
  }
});

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
