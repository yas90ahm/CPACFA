/**
 * Settings API: entity general settings, entity list.
 * Mounted at /api/settings.
 * Recon requirements and AJE templates CRUD live under /api/close.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { send500 } from '../lib/errorHandler.js';
import * as entitySettingsService from '../services/entity_settings_service.js';
import { recordMaterialEvent } from '../services/audit_service.js';
import type { AuthRequest } from '../auth/middleware.js';
import settingsTeamRouter from './settings_team.js';

const router = Router();

router.use('/team', settingsTeamRouter);

/** GET /api/settings/general?entityId=X — entity general settings */
router.get('/general', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    const entityId = (req.query.entityId as string) ?? (req as { entityId?: string }).entityId;
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!entityId) {
      res.status(400).json({ error: 'entityId query required' });
      return;
    }
    const settings = await entitySettingsService.getEntitySettings(pool, tenantId, entityId);
    res.json({
      entityId: settings.entityId,
      entityName: settings.entityName,
      fiscalYearEnd: settings.fiscalYearEndMonth,
      fiscalYearEndDay: settings.fiscalYearEndDay,
      baseCurrency: settings.baseCurrency,
      autoLockDays: settings.autoLockDays,
      varianceMaterialityDollar: settings.varianceMaterialityDollar,
      varianceMaterialityPercent: settings.varianceMaterialityPercent,
      functionalCurrency: settings.functionalCurrency,
    });
  } catch (e) {
    send500(res, e, 'Get entity settings failed');
  }
});

/** PUT /api/settings/general?entityId=X — update entity general settings */
router.put('/general', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    const entityId = (req.query.entityId as string) ?? (req.body as { entityId?: string }).entityId;
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!entityId) {
      res.status(400).json({ error: 'entityId query or body required' });
      return;
    }
    const body = req.body as {
      entityName?: string;
      fiscalYearEnd?: number;
      fiscalYearEndDay?: number;
      baseCurrency?: string;
      autoLockDays?: number;
      varianceMaterialityDollar?: string | number;
      varianceMaterialityPercent?: string | number;
      functionalCurrency?: string;
      allowSameUserCertify?: boolean;
    };
    const settings = await entitySettingsService.upsertEntitySettings(
      pool,
      tenantId,
      entityId,
      {
        entityName: body.entityName,
        fiscalYearEndMonth: body.fiscalYearEnd,
        fiscalYearEndDay: body.fiscalYearEndDay,
        baseCurrency: body.baseCurrency,
        autoLockDays: body.autoLockDays,
        varianceMaterialityDollar: body.varianceMaterialityDollar,
        varianceMaterialityPercent: body.varianceMaterialityPercent,
        functionalCurrency: body.functionalCurrency,
        allowSameUserCertify: body.allowSameUserCertify,
      }
    );
    await recordMaterialEvent(pool, {
      tenantId,
      eventType: 'mapping_rule_update',
      deterministicFlagSnapshot: {
        event: 'entity_settings_updated',
        entityId,
        userId: (req as AuthRequest).userId ?? 'anonymous',
        targetType: 'entity_settings',
        afterState: body,
      },
    });
    res.json({
      entityId: settings.entityId,
      entityName: settings.entityName,
      fiscalYearEnd: settings.fiscalYearEndMonth,
      fiscalYearEndDay: settings.fiscalYearEndDay,
      baseCurrency: settings.baseCurrency,
      functionalCurrency: settings.functionalCurrency,
      autoLockDays: settings.autoLockDays,
      varianceMaterialityDollar: settings.varianceMaterialityDollar,
      varianceMaterialityPercent: settings.varianceMaterialityPercent,
    });
  } catch (e) {
    send500(res, e, 'Update entity settings failed');
  }
});

/** GET /api/settings/entities — list entity IDs for tenant (from close_sessions); when none, return one default from tenant name */
router.get('/entities', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const r = await pool.query<{ entity_id: string }>(
      `SELECT DISTINCT entity_id FROM close_sessions WHERE tenant_id = $1 ORDER BY entity_id`,
      [tenantId]
    );
    const entityIds = r.rows.map((row) => row.entity_id);
    const entities: Array<{ id: string; name: string }> = [];
    if (entityIds.length === 0) {
      const control = await import('../db/index.js').then((m) => m.getControlPool());
      const tenantRow = await control.query<{ name: string }>('SELECT name FROM tenants WHERE id = $1', [tenantId]);
      const tenantName = tenantRow.rows[0]?.name ?? 'Default';
      entities.push({ id: 'default', name: tenantName });
    } else {
      let tenantName: string | null = null;
      for (const id of entityIds) {
        const settings = await entitySettingsService.getEntitySettings(pool, tenantId, id);
        const name = settings.entityName || id;
        if (id === 'default' && !settings.entityName) {
          if (tenantName == null) {
            const control = await import('../db/index.js').then((m) => m.getControlPool());
            const tenantRow = await control.query<{ name: string }>('SELECT name FROM tenants WHERE id = $1', [tenantId]);
            tenantName = tenantRow.rows[0]?.name ?? 'Default';
          }
          entities.push({ id, name: tenantName });
        } else {
          entities.push({ id, name });
        }
      }
    }
    res.json({ entities });
  } catch (e) {
    send500(res, e, 'List entities failed');
  }
});

/** GET /api/settings/cross-tenant-learning — get cross-tenant learning opt-in status */
router.get('/cross-tenant-learning', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const result = await pool.query<{ cross_tenant_learning_enabled: boolean }>(
      `SELECT cross_tenant_learning_enabled FROM tenant_financial_config WHERE tenant_id = $1`,
      [tenantId]
    );
    res.json({ enabled: result.rows[0]?.cross_tenant_learning_enabled ?? false });
  } catch {
    // Column may not exist yet
    res.json({ enabled: false });
  }
});

/** PUT /api/settings/cross-tenant-learning — toggle cross-tenant learning (admin only) */
router.put('/cross-tenant-learning', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const role = (req as AuthRequest).role;
    if (role !== 'system_admin') {
      res.status(403).json({ error: 'Only system admin can change cross-tenant learning settings' });
      return;
    }
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled (boolean) required' });
      return;
    }
    await pool.query(
      `UPDATE tenant_financial_config SET cross_tenant_learning_enabled = $1 WHERE tenant_id = $2`,
      [enabled, tenantId]
    );
    // Audit trail
    try {
      await recordMaterialEvent(pool, {
        tenantId,
        eventType: 'mapping_rule_update',
        deterministicFlagSnapshot: { crossTenantLearningEnabled: enabled, changedBy: (req as AuthRequest).userId },
        createdBy: (req as AuthRequest).userId,
      });
    } catch { /* non-fatal */ }
    res.json({ enabled });
  } catch (e) {
    send500(res, e, 'Update cross-tenant learning failed');
  }
});

/** POST /api/settings/demo-reset — Wipe all period data for the tenant (preserves users, COA, templates). */
router.post('/demo-reset', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Demo reset is not available in production environments' });
    return;
  }

  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const authReq = req as AuthRequest;
    const userId = authReq.userId ?? 'unknown';

    // Audit log BEFORE any destructive action — persists even if reset fails
    try {
      await recordMaterialEvent(pool, {
        tenantId,
        periodLabel: 'n/a',
        eventType: 'close_session_transition',
        deterministicFlagSnapshot: { action: 'demo_reset_initiated', initiatedBy: userId, timestamp: new Date().toISOString() },
        createdBy: userId,
      });
    } catch { /* audit ledger may not exist yet — proceed with reset */ }

    const tables = [
      'audit_ledger', 'close_audit_trail', 'certification_artifacts', 'ledger_snapshots',
      'statement_generations', 'tenant_variance_analysis', 'evidence_links', 'evidence_records',
      'journal_entries', 'tenant_aje_template_applications',
      'reconciliation_resolutions', 'reconciliation_todos',
      'tenant_recon_source_data', 'tenant_period_reconciliations',
      'tenant_close_issue_history', 'tenant_close_issues',
      'coa_mapping_history', 'coa_mapping_rules',
      'mapping_correction_proposals', 'mapping_corrections_log',
      'ai_coa_suggestions', 'ai_cf_suggestions', 'tenant_ai_proposals',
      'period_trial_balance', 'general_ledger',
      'gl_account_analysis', 'gl_health_analysis', 'gl_upload_history',
      'tenant_session_uploads', 'tenant_supervisor_sessions',
      'tenant_gate_snapshots', 'tenant_draft_adjustments', 'tenant_hitl_staging',
      'period_financial_data_state', 'tenant_close_tasks', 'close_checklist',
      'close_sessions',
    ];

    // Named triggers to disable — only the specific ones that block DELETE during reset
    const namedTriggers: Array<{ table: string; trigger: string }> = [
      { table: 'audit_ledger', trigger: 'audit_ledger_no_delete' },
      { table: 'audit_ledger', trigger: 'audit_ledger_no_update' },
      { table: 'audit_ledger', trigger: 'audit_ledger_enforce_chain' },
      { table: 'journal_entries', trigger: 'je_immutable_after_post' },
      { table: 'journal_entries', trigger: 'je_no_delete_after_post' },
      { table: 'journal_entries', trigger: 'je_balance_check_before_post' },
      { table: 'evidence_records', trigger: 'prevent_evidence_record_delete_retention' },
      { table: 'general_ledger', trigger: 'general_ledger_immutable_after_certification_update' },
      { table: 'general_ledger', trigger: 'general_ledger_immutable_after_certification_delete' },
      { table: 'certification_artifacts', trigger: 'certification_artifacts_immutable_update' },
      { table: 'certification_artifacts', trigger: 'certification_artifacts_immutable_delete' },
      { table: 'ledger_snapshots', trigger: 'ledger_snapshots_no_update' },
      { table: 'ledger_snapshots', trigger: 'ledger_snapshots_no_delete' },
    ];

    // Disable named triggers, perform reset, re-enable in finally block
    try {
      for (const { table, trigger } of namedTriggers) {
        try { await pool.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`); } catch { /* trigger/table may not exist */ }
      }

      const deleted: Record<string, number> = {};
      for (const table of tables) {
        try {
          const r = await pool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
          if (r.rowCount && r.rowCount > 0) deleted[table] = r.rowCount;
        } catch { /* skip tables that don't exist or have FK issues */ }
      }

      // Count preserved
      const usersResult = await pool.query('SELECT COUNT(*)::int AS cnt FROM users WHERE tenant_id = $1', [tenantId]);
      const coaResult = await pool.query('SELECT COUNT(*)::int AS cnt FROM tenant_chart_of_accounts WHERE tenant_id = $1', [tenantId]);

      res.json({
        success: true,
        deleted,
        preserved: {
          users: usersResult.rows[0]?.cnt ?? 0,
          coaAccounts: coaResult.rows[0]?.cnt ?? 0,
        },
      });
    } finally {
      // Re-enable named triggers — always fires, even on crash
      for (const { table, trigger } of namedTriggers) {
        try { await pool.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`); } catch { /* ignore */ }
      }
    }
  } catch (e) {
    send500(res, e, 'Demo reset failed');
  }
});

export default router;
