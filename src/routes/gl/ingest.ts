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
    if (mime === 'text/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed for GL upload.'));
    }
  },
});

/**
 * POST /api/gl/parse
 * Parse CSV for preview (no persist). Body: file, optional columnMapping (JSON string).
 */
router.post(
  '/parse',
  upload.single('file'),
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
      const result = parseGLPreview(file.buffer, columnMapping);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Parse failed';
      res.status(400).json({ success: false, error: `Failed to parse CSV: ${msg}` });
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
  upload.single('file'),
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

      const periodLabel =
        (req.query.period as string)?.trim() || getDefaultPeriod();
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
          return res.status(207).json({
            status: 'partial',
            message: `${result.balancedCount} entries saved, ${result.imbalancedCount} entries imbalanced`,
            ...result,
          });
        }
        return res.status(400).json(result);
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

    const totalDebits = lines.reduce((sum, l) => sum + (l.debit ?? 0), 0);
    const totalCredits = lines.reduce((sum, l) => sum + (l.credit ?? 0), 0);

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

export default router;
