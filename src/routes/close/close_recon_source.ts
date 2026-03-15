/**
 * Reconciliation source data routes (bank statement / subledger upload + auto-match).
 * Mounted at /api/close.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import type { AuthRequest } from '../../auth/middleware.js';
import {
  uploadReconSource,
  getReconSourceData,
  autoMatchEntries,
  ReconSourceError,
} from '../../services/recon_source_ingestion_service.js';

const router = Router();

function getUserId(req: Request): string {
  return (req as AuthRequest).userId ?? (req as { userId?: string }).userId ?? 'api';
}

/**
 * POST /sessions/:sessionId/reconciliations/:reconId/source-upload
 * Body: { csvContent: string, sourceType?: string, fileName?: string }
 */
router.post(
  '/sessions/:sessionId/reconciliations/:reconId/source-upload',
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const sessionId = req.params.sessionId ?? '';
      const reconId = req.params.reconId ?? '';
      if (!tenantId || !pool || !sessionId || !reconId) {
        res.status(400).json({ error: 'Tenant context, sessionId, and reconId required' });
        return;
      }

      if (!(await guardSessionWritable(res, pool, tenantId, sessionId))) return;

      const { csvContent, sourceType, fileName } = req.body as {
        csvContent?: string;
        sourceType?: string;
        fileName?: string;
      };

      if (!csvContent || typeof csvContent !== 'string') {
        res.status(400).json({ error: 'csvContent (string) is required' });
        return;
      }

      const userId = getUserId(req);
      const result = await uploadReconSource(
        pool,
        tenantId,
        reconId,
        sessionId,
        csvContent,
        sourceType ?? 'bank_statement',
        fileName ?? 'upload.csv',
        userId
      );

      res.status(201).json({ sourceData: result });
    } catch (e) {
      if (e instanceof ReconSourceError) {
        const status = e.code === 'PARSE_ERROR' ? 400 : e.code === 'NOT_FOUND' ? 404 : 422;
        res.status(status).json({ error: e.message, code: e.code });
        return;
      }
      send500(res, e, 'Upload recon source failed');
    }
  }
);

/**
 * GET /sessions/:sessionId/reconciliations/:reconId/source-data
 */
router.get(
  '/sessions/:sessionId/reconciliations/:reconId/source-data',
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const sessionId = req.params.sessionId ?? '';
      const reconId = req.params.reconId ?? '';
      if (!tenantId || !pool || !sessionId || !reconId) {
        res.status(400).json({ error: 'Tenant context, sessionId, and reconId required' });
        return;
      }

      const data = await getReconSourceData(pool, tenantId, reconId, sessionId);
      res.json({ sourceData: data });
    } catch (e) {
      send500(res, e, 'Get recon source data failed');
    }
  }
);

/**
 * POST /sessions/:sessionId/reconciliations/:reconId/auto-match
 */
router.post(
  '/sessions/:sessionId/reconciliations/:reconId/auto-match',
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const sessionId = req.params.sessionId ?? '';
      const reconId = req.params.reconId ?? '';
      if (!tenantId || !pool || !sessionId || !reconId) {
        res.status(400).json({ error: 'Tenant context, sessionId, and reconId required' });
        return;
      }

      if (!(await guardSessionWritable(res, pool, tenantId, sessionId))) return;

      const matches = await autoMatchEntries(pool, tenantId, reconId, sessionId);
      res.json({
        matches,
        matchCount: matches.length,
        highConfidence: matches.filter((m) => m.confidence >= 0.85).length,
      });
    } catch (e) {
      if (e instanceof ReconSourceError) {
        const status = e.code === 'NOT_FOUND' ? 404 : 422;
        res.status(status).json({ error: e.message, code: e.code });
        return;
      }
      send500(res, e, 'Auto-match recon source failed');
    }
  }
);

export default router;
