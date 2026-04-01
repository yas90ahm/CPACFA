/**
 * General Ledger ingest — upload CSV, list entries, get by entry_id.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { uploadGLForPeriod, parseGLPreview } from '../../services/gl_upload_service.js';
import {
  buildDerivedTrialBalance,
  validateDerivedTB,
} from '../../services/gl_to_tb_aggregation_service.js';
import * as glRepository from '../../db/repositories/general_ledger_repository.js';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { requireValidTenantId } from '../../middleware/validationMiddleware.js';
import { send500 } from '../../lib/errorHandler.js';
import { sumRound2 } from '../../utils/decimal.js';
import { runGLHealthAnalysis } from '../../services/gl_health_analysis_service.js';
import { analyzeAccountsLegacy, type AccountInput, type AccountIntelligence, type LegacyAccountFlag } from '../../services/account_intelligence_service.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';

const router = Router();

function getDefaultPeriod(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const q = Math.ceil(month / 3);
  return `${year}-Q${q}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype?.toLowerCase() ?? '';
    const name = file.originalname?.toLowerCase() ?? '';
    const csvMimes = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'];
    if (csvMimes.includes(mime) || name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type "${mime}". Accepted: CSV (.csv), Excel (.xlsx, .xls).`));
    }
  },
});

/** Multer error handler — catches file filter / size errors before route handler. */
function handleMulterError(req: Request, res: Response, next: import('express').NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'File upload failed';
      res.status(400).json({ error: msg });
      return;
    }
    next();
  });
}

/**
 * POST /api/gl/parse
 * Parse CSV for preview (no persist). Body: file, optional columnMapping (JSON string).
 */
router.post(
  '/parse',
  handleMulterError,
  requireValidTenantId,
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'File is required' });
        return;
      }
      let columnMapping: import('../../services/gl_upload_service.js').GLColumnMapping | null = null;
      if (req.body?.columnMapping && typeof req.body.columnMapping === 'string') {
        try {
          columnMapping = JSON.parse(req.body.columnMapping) as import('../../services/gl_upload_service.js').GLColumnMapping;
        } catch {
          res.status(400).json({ error: 'Invalid columnMapping JSON' });
          return;
        }
      }
      const result = await parseGLPreview(file.buffer, columnMapping);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Parse failed';
      res.status(400).json({ success: false, error: `Failed to parse file: ${msg}` });
    }
  }
);

/**
 * POST /api/gl/ingest
 * Upload General Ledger (CSV).
 * Body: multipart/form-data with 'file' field, optional columnMapping (JSON string).
 * Query: ?period=2024-Q1 (optional, default to current quarter)
 */
router.post(
  '/ingest',
  handleMulterError,
  requireValidTenantId,
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({
          error: 'No file uploaded',
          message: 'Upload a CSV file with field name "file".',
        });
        return;
      }

      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      if (!tenantId || !pool) {
        res.status(503).json({
          error: 'Tenant context required',
          message: 'Authenticate with a valid token so the tenant database is attached.',
        });
        return;
      }

      // Derive period label: prefer session period if sessionId provided, then query param, then default
      let periodLabel = (req.query.period as string)?.trim() || '';
      const sessionIdParam = (req.query.sessionId as string)?.trim() || '';
      if (sessionIdParam && pool && tenantId) {
        try {
          const sess = await getCloseSessionById(pool, tenantId, sessionIdParam);
          if (sess?.periodEnd) {
            periodLabel = sess.periodEnd.length >= 7 ? sess.periodEnd.slice(0, 7) : sess.periodEnd;
          }
        } catch { /* fall through to default */ }
      }
      if (!periodLabel) periodLabel = getDefaultPeriod();
      const uploadedBy = (req as { userId?: string; tenantId?: string }).userId ?? (req as { userId?: string; tenantId?: string }).tenantId;

      let columnMapping: import('../../services/gl_upload_service.js').GLColumnMapping | null = null;
      if (req.body?.columnMapping && typeof req.body.columnMapping === 'string') {
        try {
          columnMapping = JSON.parse(req.body.columnMapping) as import('../../services/gl_upload_service.js').GLColumnMapping;
        } catch {
          res.status(400).json({ error: 'Invalid columnMapping JSON' });
          return;
        }
      }

      const result = await uploadGLForPeriod(
        pool,
        tenantId,
        periodLabel,
        file.buffer,
        uploadedBy,
        columnMapping
      );

      if (!result.success) {
        if (result.imbalancedCount > 0) {
          // Create a blocking issue for imbalanced GL entries
          const sessionId = req.query.sessionId as string | undefined;
          if (sessionId && pool && tenantId) {
            try {
              const { createIssueForSession } = await import('../../services/issue_service.js');
              await createIssueForSession(pool, {
                closeSessionId: sessionId,
                tenantId,
                category: 'ingestion',
                severity: 'blocking',
                title: `${result.imbalancedCount} GL entries could not be imported`,
                description: `${result.imbalancedCount} imbalanced GL entries are queued for review. The close cannot advance until these are resolved or explicitly excluded.`,
                issueType: 'staged_gl_entries',
                sourceRef: { imbalancedCount: result.imbalancedCount, balancedCount: result.balancedCount },
              });
            } catch { /* non-fatal */ }
          }
          return res.status(207).json({
            status: 'partial',
            message: `${result.balancedCount} entries saved, ${result.imbalancedCount} entries imbalanced`,
            ...result,
          });
        }
        return res.status(400).json(result);
      }

      // Auto-trigger GL health analysis if sessionId provided
      const sessionId = req.query.sessionId as string | undefined;
      if (sessionId && pool) {
        try {
          await runGLHealthAnalysis(pool, tenantId!, sessionId, periodLabel);
        } catch (healthErr) {
          console.error('GL health analysis failed (non-blocking):', healthErr);
        }
      }

      res.status(200).json({
        status: 'success',
        message: `${result.balancedCount} entries uploaded successfully`,
        ...result,
      });
    } catch (err) {
      const multerErr = err as { code?: string };
      if (multerErr?.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: 'File too large',
          message: 'GL CSV must be under 50 MB.',
        });
        return;
      }
      console.error('GL upload error:', err);
      send500(res, err instanceof Error ? err : new Error('GL upload failed'), 'GL upload failed');
    }
  }
);

/**
 * GET /api/gl/trial-balance
 * Derive trial balance from GL.
 * Query: ?period=2024-Q1
 */
router.get(
  '/trial-balance',
  requireValidTenantId,
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      if (!tenantId || !pool) {
        res.status(503).json({
          error: 'Tenant context required',
          message: 'Authenticate with a valid token so the tenant database is attached.',
        });
        return;
      }

      const periodLabel =
        (req.query.period as string)?.trim() || getDefaultPeriod();

      const derivedTB = await buildDerivedTrialBalance(pool, tenantId, periodLabel);
      const validation = validateDerivedTB(derivedTB);

      if (!validation.valid) {
        res.status(422).json({
          error: 'Derived trial balance failed validation',
          errors: validation.errors,
          derivedTB,
        });
        return;
      }

      res.status(200).json({
        status: 'valid',
        message: 'Trial balance derived successfully from GL',
        derivedTB,
      });
    } catch (err) {
      console.error('TB derivation error:', err);
      send500(
        res,
        err instanceof Error ? err : new Error('Failed to derive trial balance'),
        'Failed to derive trial balance'
      );
    }
  }
);

/**
 * GET /api/gl/export
 * Export GL for a period (CSV or JSON).
 * Query: ?period=2024-Q1&format=csv
 */
router.get('/export', requireValidTenantId, async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(503).json({
        error: 'Tenant context required',
        message: 'Authenticate with a valid token so the tenant database is attached.',
      });
      return;
    }

    const periodLabel = (req.query.period as string)?.trim() || getDefaultPeriod();
    const format = ((req.query.format as string) ?? 'json').toLowerCase();

    const lines = await glRepository.getGLForPeriod(pool, tenantId, periodLabel);

    if (lines.length === 0) {
      res.status(404).json({
        error: 'No GL data found for this period',
        period: periodLabel,
      });
      return;
    }

    if (format === 'csv') {
      const header = 'entry_id,line_number,entry_date,account_code,debit,credit,description\n';
      const rows = lines
        .map((line) => {
          const desc = (line.description ?? '').replace(/"/g, '""');
          const entryDate =
            typeof line.entry_date === 'string'
              ? line.entry_date
              : (line.entry_date as Date).toISOString().slice(0, 10);
          return `${line.entry_id},${line.line_number},${entryDate},${line.account_code},${line.debit ?? 0},${line.credit ?? 0},"${desc}"`;
        })
        .join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="GL_${periodLabel}.csv"`);
      return res.send(header + rows);
    }

    const entries = glRepository.groupLinesByEntry(lines);
    res.status(200).json({
      period: periodLabel,
      entryCount: entries.length,
      lineCount: lines.length,
      entries,
    });
  } catch (err) {
    console.error('GL export error:', err);
    send500(res, err instanceof Error ? err : new Error('GL export failed'), 'GL export failed');
  }
});

/**
 * GET /api/gl
 * Get all GL entries for a period.
 * Query: ?period=2024-Q1
 */
router.get('/', requireValidTenantId, async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(503).json({
        error: 'Tenant context required',
        message: 'Authenticate with a valid token so the tenant database is attached.',
      });
      return;
    }

    const periodLabel =
      (req.query.period as string)?.trim() || getDefaultPeriod();

    const lines = await glRepository.getGLForPeriod(pool, tenantId, periodLabel);
    const entries = glRepository.groupLinesByEntry(lines);

    res.status(200).json({
      period: periodLabel,
      entryCount: entries.length,
      lineCount: lines.length,
      entries,
    });
  } catch (err) {
    console.error('GL fetch error:', err);
    send500(res, err instanceof Error ? err : new Error('Failed to fetch GL'), 'Failed to fetch GL');
  }
});

/**
 * GET /api/gl/entries/:entryId
 * Get specific journal entry.
 * Query: ?period=2024-Q1
 */
router.get('/entries/:entryId', requireValidTenantId, async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(503).json({
        error: 'Tenant context required',
        message: 'Authenticate with a valid token so the tenant database is attached.',
      });
      return;
    }

    const periodLabel =
      (req.query.period as string)?.trim() || getDefaultPeriod();
    const entryId = req.params.entryId;

    const lines = await glRepository.getGLEntry(pool, tenantId, periodLabel, entryId);

    if (lines.length === 0) {
      res.status(404).json({ error: 'Entry not found', entryId });
      return;
    }

    const totalDebits = sumRound2(lines.map((l) => Number(l.debit ?? 0)));
    const totalCredits = sumRound2(lines.map((l) => Number(l.credit ?? 0)));

    res.status(200).json({
      entry: {
        entry_id: entryId,
        entry_date: lines[0]!.entry_date,
        description: lines[0]!.description,
        lines,
        totalDebits,
        totalCredits,
      },
    });
  } catch (err) {
    console.error('GL entry fetch error:', err);
    send500(res, err instanceof Error ? err : new Error('Failed to fetch entry'), 'Failed to fetch entry');
  }
});

/**
 * POST /api/gl/analyze-quality
 * Run account intelligence analysis on GL data for a session.
 * Body: { sessionId: string }
 */
router.post(
  '/analyze-quality',
  requireValidTenantId,
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }

      const { sessionId, period } = req.body as { sessionId?: string; period?: string };
      if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }

      // Resolve period label: use provided period, else derive from session dates
      let periodLabel = period;
      if (!periodLabel) {
        const session = await getCloseSessionById(pool, tenantId, sessionId);
        if (!session) {
          res.status(404).json({ error: 'Session not found' });
          return;
        }
        // Find the most recent period_label for this tenant in GL
        const { rows: periodRows } = await pool.query<{ period_label: string }>(
          `SELECT DISTINCT period_label FROM core.general_ledger
           WHERE tenant_id = $1 ORDER BY period_label DESC LIMIT 1`,
          [tenantId]
        );
        periodLabel = periodRows[0]?.period_label ?? session.periodEnd ?? '';
      }

      // Fetch distinct accounts from GL for this period
      const { rows: glAccounts } = await pool.query<{
        account_code: string;
        account_name: string;
        total_debit: string;
        total_credit: string;
      }>(
        `SELECT account_code,
                COALESCE(MAX(account_name), account_code) AS account_name,
                COALESCE(SUM(debit), 0)::text AS total_debit,
                COALESCE(SUM(credit), 0)::text AS total_credit
         FROM core.general_ledger
         WHERE tenant_id = $1 AND period_label = $2
         GROUP BY account_code`,
        [tenantId, periodLabel]
      );

      // Look up account types from COA
      const { rows: coaRows } = await pool.query<{
        account_code: string;
        account_type: string;
      }>(
        `SELECT account_code, account_type FROM core.tenant_chart_of_accounts WHERE tenant_id = $1`,
        [tenantId]
      );
      const coaTypeMap = new Map(coaRows.map((r) => [r.account_code, r.account_type]));

      const accounts: AccountInput[] = glAccounts.map((r) => ({
        code: r.account_code,
        name: r.account_name,
        type: coaTypeMap.get(r.account_code)?.toLowerCase(),
        debitBalance: parseFloat(r.total_debit),
        creditBalance: parseFloat(r.total_credit),
      }));

      const flaggedAccounts = await analyzeAccountsLegacy(pool, tenantId, accounts);
      const cleanAccounts = accounts.length - flaggedAccounts.length;

      // Build summary counts
      const summary = {
        junk: 0,
        suspense: 0,
        duplicates: 0,
        contras: 0,
        balanceMismatch: 0,
        inactive: 0,
        intercompany: 0,
      };

      for (const fa of flaggedAccounts) {
        if (fa.flags.includes('junk_account') || fa.flags.includes('test_account')) summary.junk++;
        if (fa.flags.includes('suspense_clearing')) summary.suspense++;
        if (fa.flags.includes('duplicate_candidate')) summary.duplicates++;
        if (fa.flags.includes('contra_undetected')) summary.contras++;
        if (fa.flags.includes('balance_direction_mismatch')) summary.balanceMismatch++;
        if (fa.flags.includes('inactive') || fa.flags.includes('zero_balance_zero_activity')) summary.inactive++;
        if (fa.flags.includes('intercompany')) summary.intercompany++;
      }

      res.json({
        totalAccounts: accounts.length,
        flaggedAccounts,
        cleanAccounts,
        summary,
      });
    } catch (err) {
      send500(res, err instanceof Error ? err : new Error('Quality analysis failed'), 'Quality analysis failed');
    }
  }
);

/**
 * POST /api/gl/exclude-accounts
 * Exclude accounts from mapping and financial statement generation.
 * Body: { sessionId: string, accountCodes: string[], reason: string }
 */
router.post(
  '/exclude-accounts',
  requireValidTenantId,
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }

      const { sessionId, accountCodes, reason } = req.body as {
        sessionId?: string;
        accountCodes?: string[];
        reason?: string;
      };

      if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }
      if (!Array.isArray(accountCodes) || accountCodes.length === 0) {
        res.status(400).json({ error: 'accountCodes[] is required and must not be empty' });
        return;
      }
      if (!reason || reason.trim().length === 0) {
        res.status(400).json({ error: 'reason is required' });
        return;
      }

      // Update mapping_status on tenant_chart_of_accounts
      const result = await pool.query(
        `UPDATE core.tenant_chart_of_accounts
         SET mapping_status = 'EXCLUDED', updated_at = NOW()
         WHERE tenant_id = $1 AND account_code = ANY($2)`,
        [tenantId, accountCodes]
      );

      const excluded = result.rowCount ?? 0;

      res.json({ excluded });
    } catch (err) {
      send500(res, err instanceof Error ? err : new Error('Exclude accounts failed'), 'Exclude accounts failed');
    }
  }
);

export default router;
