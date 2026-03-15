/**
 * Excel export routes for close session data (GAP I7).
 * Mounted at /api/close.
 *
 * Endpoints:
 * - GET /sessions/:sessionId/export/trial-balance.xlsx
 * - GET /sessions/:sessionId/export/statements.xlsx
 * - GET /sessions/:sessionId/export/reconciliations.xlsx
 * - GET /sessions/:sessionId/export/variances.xlsx
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import {
  exportTrialBalance,
  exportStatements,
  exportReconciliations,
  exportVariances,
  type TrialBalanceExportRow,
  type StatementsExportData,
  type ReconciliationExportRow,
  type VarianceExportRow,
  type StatementLineExport,
} from '../../services/excel_export_service.js';
import { round2 } from '../../utils/decimal.js';

const router = Router();

/** Send xlsx buffer with proper Content-Type and Content-Disposition headers. */
function sendXlsx(res: Response, buffer: Buffer, filename: string): void {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}

/** GET /sessions/:sessionId/export/trial-balance.xlsx */
router.get(
  '/sessions/:sessionId/export/trial-balance.xlsx',
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const sessionId = req.params.sessionId ?? '';
      if (!tenantId || !pool || !sessionId) {
        res.status(400).json({ error: 'Tenant context and sessionId required' });
        return;
      }

      // Get session metadata
      const sessResult = await pool.query<{
        period_end: string | null;
        entity_id: string;
      }>(
        `SELECT period_end, entity_id FROM close_sessions WHERE id = $1 AND tenant_id = $2`,
        [sessionId, tenantId]
      );
      const session = sessResult.rows[0];
      if (!session) {
        res.status(404).json({ error: 'Close session not found' });
        return;
      }
      const periodLabel = (session.period_end ?? '').slice(0, 7);

      // Get entity name
      const entityResult = await pool.query<{ name: string }>(
        `SELECT name FROM entities WHERE id = $1 AND tenant_id = $2`,
        [session.entity_id, tenantId]
      );
      const entityName = entityResult.rows[0]?.name ?? session.entity_id;

      // Get adjusted trial balance
      const tbResult = await pool.query<{
        account_code: string;
        account_name: string;
        account_type: string | null;
        debit: string;
        credit: string;
      }>(
        `SELECT account_code, account_name, account_type,
                COALESCE(debit, 0)::text AS debit,
                COALESCE(credit, 0)::text AS credit
         FROM tenant_trial_balance
         WHERE tenant_id = $1 AND period_label = $2
         ORDER BY account_code`,
        [tenantId, periodLabel]
      );

      const rows: TrialBalanceExportRow[] = tbResult.rows.map((r) => ({
        accountCode: r.account_code,
        accountName: r.account_name,
        accountType: r.account_type ?? undefined,
        debit: Number(r.debit),
        credit: Number(r.credit),
      }));

      const buffer = exportTrialBalance(rows, { entityName, periodLabel });
      sendXlsx(res, buffer, `trial-balance-${periodLabel}.xlsx`);
    } catch (e) {
      send500(res, e, 'Export trial balance xlsx failed');
    }
  }
);

/** GET /sessions/:sessionId/export/statements.xlsx */
router.get(
  '/sessions/:sessionId/export/statements.xlsx',
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const sessionId = req.params.sessionId ?? '';
      if (!tenantId || !pool || !sessionId) {
        res.status(400).json({ error: 'Tenant context and sessionId required' });
        return;
      }

      const sessResult = await pool.query<{
        period_end: string | null;
        entity_id: string;
      }>(
        `SELECT period_end, entity_id FROM close_sessions WHERE id = $1 AND tenant_id = $2`,
        [sessionId, tenantId]
      );
      const session = sessResult.rows[0];
      if (!session) {
        res.status(404).json({ error: 'Close session not found' });
        return;
      }
      const periodLabel = (session.period_end ?? '').slice(0, 7);

      const entityResult = await pool.query<{ name: string }>(
        `SELECT name FROM entities WHERE id = $1 AND tenant_id = $2`,
        [session.entity_id, tenantId]
      );
      const entityName = entityResult.rows[0]?.name ?? session.entity_id;

      // Get statement lines grouped by statement type
      const linesResult = await pool.query<{
        fs_line_id: string;
        label: string;
        amount: string;
        statement: string;
        sort_order: number | null;
        is_subtotal: boolean | null;
        indent_level: number | null;
      }>(
        `SELECT sl.fs_line_id, sl.label, sl.amount::text, sl.statement,
                sl.sort_order, sl.is_subtotal, sl.indent_level
         FROM statement_lines sl
         JOIN statement_packages sp ON sp.id = sl.package_id
         WHERE sp.close_session_id = $1 AND sp.tenant_id = $2
         ORDER BY sl.statement, sl.sort_order NULLS LAST, sl.fs_line_id`,
        [sessionId, tenantId]
      );

      const byStatement: Record<string, StatementLineExport[]> = {
        income_statement: [],
        balance_sheet: [],
        cash_flow: [],
        equity_changes: [],
      };

      for (const line of linesResult.rows) {
        const stmtKey = line.statement?.toLowerCase().replace(/\s+/g, '_') ?? 'income_statement';
        const bucket = byStatement[stmtKey] ?? byStatement.income_statement;
        bucket.push({
          lineId: line.fs_line_id,
          label: line.label,
          amount: Number(line.amount),
          isSubtotal: line.is_subtotal ?? false,
          indent: line.indent_level ?? 0,
        });
      }

      const data: StatementsExportData = {
        entityName,
        periodLabel,
        incomeStatement: byStatement.income_statement,
        balanceSheet: byStatement.balance_sheet,
        cashFlow: byStatement.cash_flow,
        equityChanges: byStatement.equity_changes,
      };

      const buffer = exportStatements(data);
      sendXlsx(res, buffer, `financial-statements-${periodLabel}.xlsx`);
    } catch (e) {
      send500(res, e, 'Export statements xlsx failed');
    }
  }
);

/** GET /sessions/:sessionId/export/reconciliations.xlsx */
router.get(
  '/sessions/:sessionId/export/reconciliations.xlsx',
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const sessionId = req.params.sessionId ?? '';
      if (!tenantId || !pool || !sessionId) {
        res.status(400).json({ error: 'Tenant context and sessionId required' });
        return;
      }

      const sessResult = await pool.query<{
        period_end: string | null;
        entity_id: string;
      }>(
        `SELECT period_end, entity_id FROM close_sessions WHERE id = $1 AND tenant_id = $2`,
        [sessionId, tenantId]
      );
      const session = sessResult.rows[0];
      if (!session) {
        res.status(404).json({ error: 'Close session not found' });
        return;
      }
      const periodLabel = (session.period_end ?? '').slice(0, 7);

      const entityResult = await pool.query<{ name: string }>(
        `SELECT name FROM entities WHERE id = $1 AND tenant_id = $2`,
        [session.entity_id, tenantId]
      );
      const entityName = entityResult.rows[0]?.name ?? session.entity_id;

      const reconResult = await pool.query<{
        account_code: string;
        account_name: string | null;
        gl_balance: string | null;
        supporting_balance: string | null;
        variance: string | null;
        reconciling_items_total: string;
        unexplained_variance: string | null;
        tolerance_amount: string;
        is_within_tolerance: boolean | null;
        status: string;
        prepared_by: string | null;
        reviewed_by: string | null;
      }>(
        `SELECT r.account_code, req.account_name,
                r.gl_balance::text, r.supporting_balance::text,
                r.variance::text, r.reconciling_items_total::text,
                r.unexplained_variance::text, r.tolerance_amount::text,
                r.is_within_tolerance, r.status,
                r.prepared_by, r.reviewed_by
         FROM tenant_period_reconciliations r
         LEFT JOIN tenant_recon_requirements req ON r.requirement_id = req.requirement_id
         WHERE r.tenant_id = $1 AND r.period_id = $2
         ORDER BY r.account_code`,
        [tenantId, sessionId]
      );

      const rows: ReconciliationExportRow[] = reconResult.rows.map((r) => ({
        accountCode: r.account_code,
        accountName: r.account_name ?? r.account_code,
        glBalance: Number(r.gl_balance ?? 0),
        supportingBalance: Number(r.supporting_balance ?? 0),
        variance: Number(r.variance ?? 0),
        reconcilingItems: Number(r.reconciling_items_total ?? 0),
        unexplainedVariance: Number(r.unexplained_variance ?? 0),
        tolerance: Number(r.tolerance_amount ?? 0),
        withinTolerance: r.is_within_tolerance ?? false,
        status: r.status,
        preparedBy: r.prepared_by,
        reviewedBy: r.reviewed_by,
      }));

      const buffer = exportReconciliations(rows, { entityName, periodLabel });
      sendXlsx(res, buffer, `reconciliations-${periodLabel}.xlsx`);
    } catch (e) {
      send500(res, e, 'Export reconciliations xlsx failed');
    }
  }
);

/** GET /sessions/:sessionId/export/variances.xlsx */
router.get(
  '/sessions/:sessionId/export/variances.xlsx',
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const sessionId = req.params.sessionId ?? '';
      if (!tenantId || !pool || !sessionId) {
        res.status(400).json({ error: 'Tenant context and sessionId required' });
        return;
      }

      const sessResult = await pool.query<{
        period_end: string | null;
        entity_id: string;
      }>(
        `SELECT period_end, entity_id FROM close_sessions WHERE id = $1 AND tenant_id = $2`,
        [sessionId, tenantId]
      );
      const session = sessResult.rows[0];
      if (!session) {
        res.status(404).json({ error: 'Close session not found' });
        return;
      }
      const periodLabel = (session.period_end ?? '').slice(0, 7);

      const entityResult = await pool.query<{ name: string }>(
        `SELECT name FROM entities WHERE id = $1 AND tenant_id = $2`,
        [session.entity_id, tenantId]
      );
      const entityName = entityResult.rows[0]?.name ?? session.entity_id;

      const varResult = await pool.query<{
        account_code: string;
        account_name: string | null;
        current_amount: string;
        prior_amount: string;
        variance_amount: string;
        variance_percent: string | null;
        is_material: boolean;
        explanation: string | null;
        explained_by: string | null;
      }>(
        `SELECT account_code, account_name,
                current_amount::text, prior_amount::text,
                variance_amount::text, variance_percent::text,
                is_material, explanation, explained_by
         FROM tenant_variance_analysis
         WHERE tenant_id = $1 AND close_session_id = $2
         ORDER BY ABS(variance_amount) DESC`,
        [tenantId, sessionId]
      );

      const rows: VarianceExportRow[] = varResult.rows.map((r) => ({
        accountCode: r.account_code,
        accountName: r.account_name ?? r.account_code,
        currentAmount: Number(r.current_amount),
        priorAmount: Number(r.prior_amount),
        varianceAmount: Number(r.variance_amount),
        variancePercent: r.variance_percent != null ? Number(r.variance_percent) : null,
        isMaterial: r.is_material,
        explanation: r.explanation,
        explainedBy: r.explained_by,
      }));

      const buffer = exportVariances(rows, { entityName, periodLabel });
      sendXlsx(res, buffer, `variance-analysis-${periodLabel}.xlsx`);
    } catch (e) {
      send500(res, e, 'Export variances xlsx failed');
    }
  }
);

export default router;
