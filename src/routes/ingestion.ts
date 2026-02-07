/**
 * Ingestion Agent API — auto-detect file type, classify (bank statement / tax form),
 * route to specialist, and apply data cleaning (dates, negative numbers).
 * Tenant ID comes exclusively from JWT; query.tenantId is ignored to prevent tenant IDOR.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { getTenantId } from '../lib/tenant_context.js';
import { runIngestionAgent } from '../services/ingestion_agent.js';
import { buildIngestionPipeline } from '../services/ingestion_pipeline.js';
import { runAllFetchers, runAllFetchersAndIngest } from '../services/ingestion_fetchers.js';
import { getUsage, getQuota } from '../services/fetcher_run_tracker.js';
import { validateBody, validateQuery } from '../middleware/validationMiddleware.js';
import { ingestionAgentBodySchema, fetchersRunQuerySchema } from '../schemas/ingestionSchemas.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype ?? '').toLowerCase();
    const ext = (file.originalname ?? '').toLowerCase().split('.').pop();
    const allowed =
      mime === 'text/csv' ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel' ||
      mime === 'application/pdf' ||
      mime === 'application/json' ||
      mime.startsWith('image/') ||
      ext === 'csv' ||
      ext === 'xlsx' ||
      ext === 'xls' ||
      ext === 'pdf' ||
      ext === 'json' ||
      ext === 'png' ||
      ext === 'jpg' ||
      ext === 'jpeg' ||
      ext === 'webp';
    if (allowed) cb(null, true);
    else cb(new Error('Only .xlsx, .csv, .pdf, and .json files are allowed.'));
  },
});

/**
 * POST /api/ingestion/agent
 * Body: multipart/form-data with file (field name: file)
 * Optional: dataCleaning = { normalizeNegativeNumbers, normalizeDates, dateOutputFormat }
 * Optional: includeRows=true to include cleaned rows (limited)
 * Optional: rowLimit=number to cap returned rows per sheet
 * Returns: IngestionAgentResult (fileType, classification, route, cleanedSheets, cleaningApplied)
 */
router.post('/agent', upload.single('file'), validateBody(ingestionAgentBodySchema), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: 'Missing file',
        message: 'Upload a file (field name "file") — .xlsx, .csv, .pdf, or .json.',
      });
      return;
    }
    const body = req.body;
    const dc = body.dataCleaning;
    const dateFormat = dc?.dateOutputFormat;
    const dataCleaning = dc != null && typeof dc === 'object'
      ? {
          normalizeNegativeNumbers: dc.normalizeNegativeNumbers === true || dc.normalizeNegativeNumbers === 'true',
          normalizeDates: dc.normalizeDates === true || dc.normalizeDates === 'true',
          dateOutputFormat: dateFormat === 'us' || dateFormat === 'uk' || dateFormat === 'iso' ? dateFormat : undefined,
        }
      : undefined;
    const result = await runIngestionAgent(file.buffer, {
      filename: file.originalname,
      dataCleaning,
    });
    const includeRows = body.includeRows === true || body.includeRows === 'true' || body.includeRows === '1';
    const rowLimit = body.rowLimit != null ? Number(body.rowLimit) : 300;
    const safeLimit = Number.isFinite(rowLimit) && rowLimit > 0 ? Math.min(rowLimit, 1000) : 300;
    res.json({
      fileType: result.fileType,
      filename: result.filename,
      classification: result.classification,
      route: result.route,
      confidence: result.confidence,
      signals: result.signals,
      jurisdiction: result.jurisdiction,
      normalized: {
        apCount: result.normalized?.apItems?.length ?? 0,
        arCount: result.normalized?.arItems?.length ?? 0,
        payrollCount: result.normalized?.payrollItems?.length ?? 0,
      },
      cleaningApplied: result.cleaningApplied,
      errors: result.errors,
      sheetCount: result.cleanedSheets.length,
      sheets: result.cleanedSheets.map((s) => ({
        name: s.name,
        headers: s.headers,
        rowCount: s.rows.length,
        ...(includeRows ? { rows: s.rows.slice(0, safeLimit) } : {}),
      })),
      parsed: {
        rawTextPreview: result.parsed.rawText.slice(0, 500),
        byteLength: result.parsed.byteLength,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion agent failed';
    res.status(500).json({ error: 'Ingestion error', message });
  }
});

/**
 * POST /api/ingestion/pipeline
 * Body: multipart/form-data with file (field name: file)
 * Returns: split + de-dup pipeline summary
 */
router.post('/pipeline', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: 'Missing file',
        message: 'Upload a file (field name "file") — .xlsx, .csv, .pdf, or .json.',
      });
      return;
    }
    const ingestion = await runIngestionAgent(file.buffer, {
      filename: file.originalname,
    });
    const pipeline = buildIngestionPipeline(ingestion.parsed, file.originalname);
    res.json({
      filename: file.originalname,
      fileType: ingestion.fileType,
      classification: ingestion.classification,
      confidence: ingestion.confidence,
      jurisdiction: ingestion.jurisdiction,
      pipeline,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion pipeline failed';
    res.status(500).json({ error: 'Ingestion error', message });
  }
});

/**
 * GET /api/ingestion/fetchers/status
 * Returns available fetchers and last-run placeholder status.
 */
router.get('/fetchers/status', (_req: Request, res: Response) => {
  res.json({
    fetchers: [
      { name: 'email', enabled: false, lastRunAt: null },
      { name: 'drive', enabled: false, lastRunAt: null },
    ],
  });
});

/**
 * POST /api/ingestion/fetchers/run
 * Runs all fetchers (placeholder).
 */
router.post('/fetchers/run', validateQuery(fetchersRunQuerySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'Tenant context required', message: 'Authenticate with a valid token to run fetchers.' });
      return;
    }
    const mode = String(req.query.mode ?? 'fetch');
    if (mode === 'ingest') {
      const results = await runAllFetchersAndIngest(tenantId);
      res.json({ ok: true, ...results });
      return;
    }
    const results = await runAllFetchers(tenantId);
    res.json({ ok: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fetcher run failed';
    res.status(500).json({ error: 'Fetcher error', message });
  }
});

/**
 * GET /api/ingestion/fetchers/usage
 * Returns daily usage for tenant.
 */
router.get('/fetchers/usage', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  if (!tenantId) {
    res.status(403).json({ error: 'Tenant context required', message: 'Authenticate with a valid token to view fetcher usage.' });
    return;
  }
  res.json({ ok: true, usage: getUsage(tenantId), quota: getQuota(tenantId) });
});

export default router;
