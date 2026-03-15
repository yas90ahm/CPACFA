/**
 * GL Account Analysis routes — quality gate for account-level intelligence.
 * GET  /sessions/:sessionId/account-analysis           — Load stored analysis
 * POST /sessions/:sessionId/account-analysis/run       — Run (or re-run) analysis
 * POST /sessions/:sessionId/account-analysis/:accountCode/action — Record action on account
 * POST /sessions/:sessionId/account-analysis/bulk-exclude — Exclude all auto-excludable
 * GET  /sessions/:sessionId/account-analysis/summary   — Summary with grade
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import {
  analyzeAccounts,
  computeQualityGrade,
  type AccountAnalysis,
} from '../../services/account_intelligence_service.js';

const router = Router();

/* ── GET /sessions/:sessionId/account-analysis ─────────────────── */

router.get('/sessions/:sessionId/account-analysis', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, account_code, account_name,
              balance_debit::text, balance_credit::text, balance_net::text,
              flags, clean_name, duplicate_of, suggested_contra_of,
              suggested_action, action_taken, action_taken_by, action_taken_at, created_at
       FROM core.gl_account_analysis
       WHERE tenant_id = $1 AND close_session_id = $2
       ORDER BY account_code`,
      [tenantId, req.params.sessionId],
    );

    const accounts = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      accountCode: r.account_code,
      accountName: r.account_name,
      balance: {
        debit: r.balance_debit,
        credit: r.balance_credit,
        net: r.balance_net,
      },
      flags: r.flags,
      cleanName: r.clean_name,
      duplicateOf: r.duplicate_of,
      suggestedContraOf: r.suggested_contra_of,
      suggestedAction: r.suggested_action,
      actionTaken: r.action_taken,
      actionTakenBy: r.action_taken_by,
      actionTakenAt: r.action_taken_at,
      createdAt: r.created_at,
    }));

    res.json({ accounts });
  } catch (err) {
    send500(res, err as Error, 'Failed to load account analysis');
  }
});

/* ── POST /sessions/:sessionId/account-analysis/run ────────────── */

router.post('/sessions/:sessionId/account-analysis/run', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const sessionId = req.params.sessionId;

    // Verify session exists
    const sessionResult = await pool.query(
      `SELECT id, period_label FROM core.close_sessions WHERE id = $1 AND tenant_id = $2`,
      [sessionId, tenantId],
    );
    if (sessionResult.rows.length === 0) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }

    const periodLabel = sessionResult.rows[0].period_label;

    // Fetch current period TB accounts from general_ledger
    const { rows: glRows } = await pool.query(
      `SELECT account_code AS code, account_name AS name,
              COALESCE(SUM(debit), 0)::text AS debit,
              COALESCE(SUM(credit), 0)::text AS credit
       FROM core.general_ledger
       WHERE tenant_id = $1 AND period_label = $2
       GROUP BY account_code, account_name
       ORDER BY account_code`,
      [tenantId, periodLabel],
    );

    // Optionally fetch COA for account types
    const { rows: coaRows } = await pool.query(
      `SELECT account_code AS code, account_name AS name, account_type AS type
       FROM core.tenant_chart_of_accounts
       WHERE tenant_id = $1`,
      [tenantId],
    );
    const coaTypeMap = new Map<string, string>();
    for (const row of coaRows) {
      coaTypeMap.set(row.code as string, row.type as string);
    }

    const accounts = glRows.map((r: Record<string, unknown>) => ({
      code: r.code as string,
      name: r.name as string,
      type: coaTypeMap.get(r.code as string),
      debit: r.debit as string,
      credit: r.credit as string,
    }));

    // Optionally fetch prior period accounts
    const priorPeriodLabel = typeof req.body?.priorPeriodLabel === 'string'
      ? req.body.priorPeriodLabel
      : undefined;
    let priorAccounts: Array<{ code: string; name: string; debit: string; credit: string }> | undefined;
    if (priorPeriodLabel) {
      const { rows: priorRows } = await pool.query(
        `SELECT account_code AS code, account_name AS name,
                COALESCE(SUM(debit), 0)::text AS debit,
                COALESCE(SUM(credit), 0)::text AS credit
         FROM core.general_ledger
         WHERE tenant_id = $1 AND period_label = $2
         GROUP BY account_code, account_name`,
        [tenantId, priorPeriodLabel],
      );
      priorAccounts = priorRows.map((r: Record<string, unknown>) => ({
        code: r.code as string,
        name: r.name as string,
        debit: r.debit as string,
        credit: r.credit as string,
      }));
    }

    // COA codes for orphan detection
    const chartOfAccounts = coaRows.length > 0
      ? coaRows.map((r: Record<string, unknown>) => ({ code: r.code as string }))
      : undefined;

    // Run analysis
    const analyses = await analyzeAccounts(pool, tenantId, accounts, priorAccounts, chartOfAccounts);

    // Persist results (upsert)
    for (const a of analyses) {
      // Determine primary suggested action
      const suggestedAction = a.flags.length > 0
        ? a.flags[0]!.suggestedAction
        : null;

      await pool.query(
        `INSERT INTO core.gl_account_analysis
           (tenant_id, close_session_id, account_code, account_name,
            balance_debit, balance_credit, balance_net,
            flags, clean_name, duplicate_of, suggested_contra_of, suggested_action)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (tenant_id, close_session_id, account_code)
         DO UPDATE SET
           account_name = $4,
           balance_debit = $5,
           balance_credit = $6,
           balance_net = $7,
           flags = $8,
           clean_name = $9,
           duplicate_of = $10,
           suggested_contra_of = $11,
           suggested_action = $12,
           created_at = NOW()`,
        [
          tenantId, sessionId, a.accountCode, a.accountName,
          a.balance.debit, a.balance.credit, a.balance.net,
          JSON.stringify(a.flags), a.cleanName ?? null,
          a.duplicateOf ?? null, a.suggestedContraOf ?? null,
          suggestedAction,
        ],
      );
    }

    const gradeResult = computeQualityGrade(analyses);

    res.json({
      total: analyses.length,
      flagged: analyses.filter((a: AccountAnalysis) => a.flags.length > 0).length,
      grade: gradeResult,
      accounts: analyses,
    });
  } catch (err) {
    send500(res, err as Error, 'Failed to run account analysis');
  }
});

/* ── POST /sessions/:sessionId/account-analysis/:accountCode/action ── */

router.post(
  '/sessions/:sessionId/account-analysis/:accountCode/action',
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }

      const { action } = req.body ?? {};
      const validActions = ['excluded', 'kept', 'merged', 'reclassified'];
      if (!action || !validActions.includes(action)) {
        res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` });
        return;
      }

      const userId = (req as unknown as { userId?: string }).userId ?? 'system';

      const { rowCount } = await pool.query(
        `UPDATE core.gl_account_analysis
         SET action_taken = $1, action_taken_by = $2, action_taken_at = NOW()
         WHERE tenant_id = $3 AND close_session_id = $4 AND account_code = $5`,
        [action, userId, tenantId, req.params.sessionId, req.params.accountCode],
      );

      if (rowCount === 0) {
        res.status(404).json({ error: 'Account analysis record not found' });
        return;
      }

      res.json({ ok: true, accountCode: req.params.accountCode, action });
    } catch (err) {
      send500(res, err as Error, 'Failed to record account action');
    }
  },
);

/* ── POST /sessions/:sessionId/account-analysis/bulk-exclude ───── */

router.post(
  '/sessions/:sessionId/account-analysis/bulk-exclude',
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }

      const userId = (req as unknown as { userId?: string }).userId ?? 'system';

      // Find all auto-excludable accounts (flags contain autoExcludable: true) that have no action yet
      const { rows } = await pool.query(
        `SELECT account_code FROM core.gl_account_analysis
         WHERE tenant_id = $1 AND close_session_id = $2
           AND action_taken IS NULL
           AND flags @> '[{"autoExcludable": true}]'`,
        [tenantId, req.params.sessionId],
      );

      if (rows.length === 0) {
        res.json({ ok: true, excluded: 0, accountCodes: [] });
        return;
      }

      const codes = rows.map((r: Record<string, unknown>) => r.account_code as string);

      await pool.query(
        `UPDATE core.gl_account_analysis
         SET action_taken = 'excluded', action_taken_by = $1, action_taken_at = NOW()
         WHERE tenant_id = $2 AND close_session_id = $3
           AND action_taken IS NULL
           AND flags @> '[{"autoExcludable": true}]'`,
        [userId, tenantId, req.params.sessionId],
      );

      res.json({ ok: true, excluded: codes.length, accountCodes: codes });
    } catch (err) {
      send500(res, err as Error, 'Failed to bulk exclude accounts');
    }
  },
);

/* ── GET /sessions/:sessionId/account-analysis/summary ─────────── */

router.get('/sessions/:sessionId/account-analysis/summary', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT flags, action_taken
       FROM core.gl_account_analysis
       WHERE tenant_id = $1 AND close_session_id = $2`,
      [tenantId, req.params.sessionId],
    );

    if (rows.length === 0) {
      res.json({
        total: 0,
        flagged: 0,
        excluded: 0,
        kept: 0,
        pending: 0,
        grade: null,
        critical: 0,
        warning: 0,
        info: 0,
      });
      return;
    }

    let critical = 0;
    let warning = 0;
    let info = 0;
    let flagged = 0;
    let excluded = 0;
    let kept = 0;
    let pending = 0;

    for (const row of rows) {
      const flags = row.flags as Array<{ severity: string }>;
      if (flags.length > 0) flagged++;
      for (const flag of flags) {
        if (flag.severity === 'critical') critical++;
        else if (flag.severity === 'warning') warning++;
        else info++;
      }

      if (row.action_taken === 'excluded') excluded++;
      else if (row.action_taken === 'kept' || row.action_taken === 'merged' || row.action_taken === 'reclassified') kept++;
      else if (flags.length > 0) pending++;
    }

    // Compute grade
    let grade: string;
    if (critical === 0 && warning <= 2) grade = 'A';
    else if (critical === 0 && warning <= 5) grade = 'B';
    else if (critical <= 2 || warning <= 10) grade = 'C';
    else if (critical <= 5) grade = 'D';
    else grade = 'F';

    res.json({
      total: rows.length,
      flagged,
      excluded,
      kept,
      pending,
      grade,
      critical,
      warning,
      info,
    });
  } catch (err) {
    send500(res, err as Error, 'Failed to load account analysis summary');
  }
});

export default router;
