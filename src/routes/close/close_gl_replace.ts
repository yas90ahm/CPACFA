/**
 * POST /api/close/sessions/:sessionId/gl/replace
 * Atomically replaces GL data for a session's period and resets downstream state.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { uploadGLForPeriod } from '../../services/gl_upload_service.js';
import { runGLHealthAnalysis } from '../../services/gl_health_analysis_service.js';
import { executeCascade, CascadeTriggerType } from '../../services/cascade_engine.js';
import {
  setStatementsStaleSince,
  getCloseSessionById,
} from '../../db/repositories/close_session_repository.js';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { requireValidTenantId } from '../../middleware/validationMiddleware.js';
import { send500 } from '../../lib/errorHandler.js';
import type { GLColumnMapping } from '../../services/gl_upload_service.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
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

router.post(
  '/sessions/:sessionId/gl/replace',
  handleMulterError,
  requireValidTenantId,
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      if (!tenantId || !pool) {
        res.status(503).json({ error: 'Tenant context required' });
        return;
      }

      // Verify session exists and is in a replaceable state
      const session = await getCloseSessionById(pool, tenantId, sessionId!);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      const sessionState = session.status.toUpperCase();
      if (sessionState !== 'OPEN' && sessionState !== 'IN_PROGRESS') {
        res.status(409).json({
          error: `Cannot replace GL in state "${session.status}". Session must be OPEN or IN_PROGRESS.`,
        });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const periodLabel = (req.query.period as string)?.trim();
      if (!periodLabel) {
        res.status(400).json({ error: 'Query parameter "period" is required (e.g. ?period=2026-02)' });
        return;
      }
      const uploadedBy = (req as { userId?: string; tenantId?: string }).userId ?? tenantId;

      let columnMapping: GLColumnMapping | null = null;
      if (req.body?.columnMapping && typeof req.body.columnMapping === 'string') {
        try {
          columnMapping = JSON.parse(req.body.columnMapping) as GLColumnMapping;
        } catch {
          res.status(400).json({ error: 'Invalid columnMapping JSON' });
          return;
        }
      }

      // Step 1: Upload GL (atomically deletes old GL rows, inserts new, derives TB)
      const uploadResult = await uploadGLForPeriod(
        pool, tenantId, periodLabel, file.buffer, uploadedBy, columnMapping,
      );

      if (!uploadResult.success) {
        if (uploadResult.imbalancedCount > 0) {
          return res.status(207).json({
            status: 'partial',
            replaced: true,
            message: `${uploadResult.balancedCount} entries saved, ${uploadResult.imbalancedCount} entries imbalanced`,
            ...uploadResult,
          });
        }
        return res.status(400).json(uploadResult);
      }

      // Step 2: Reset downstream state
      const periodId = sessionId!; // period_id used in recon tables maps to session
      try {
        // Delete reconciling items
        await pool.query(
          `DELETE FROM core.tenant_recon_items WHERE recon_id IN (
            SELECT recon_id FROM core.tenant_period_reconciliations
            WHERE tenant_id = $1 AND period_id = $2
          )`,
          [tenantId, periodId],
        );

        // Reset reconciliation rows to not_started
        await pool.query(
          `UPDATE core.tenant_period_reconciliations SET
            status = 'not_started',
            supporting_balance = NULL,
            reconciling_items_total = NULL,
            variance_explanation = NULL,
            supporting_source = NULL,
            supporting_document_refs = NULL,
            prepared_by = NULL,
            prepared_at = NULL,
            reviewed_by = NULL,
            reviewed_at = NULL
          WHERE tenant_id = $1 AND period_id = $2`,
          [tenantId, periodId],
        );

        // Clear variance explanations
        await pool.query(
          `UPDATE core.tenant_variance_analysis SET
            explanation = NULL,
            ai_draft_explanation = NULL,
            explanation_source = NULL,
            approved_at = NULL,
            approved_by = NULL
          WHERE tenant_id = $1 AND close_session_id = $2`,
          [tenantId, sessionId],
        );

        // Delete old GL health analysis
        await pool.query(
          `DELETE FROM core.gl_health_analysis WHERE tenant_id = $1 AND close_session_id = $2`,
          [tenantId, sessionId],
        );
      } catch (resetErr) {
        console.error('GL replace downstream reset error (non-blocking):', resetErr);
      }

      // Step 3: Mark statements stale
      try {
        await setStatementsStaleSince(pool, tenantId, sessionId!);
      } catch (staleErr) {
        console.error('setStatementsStaleSince failed (non-blocking):', staleErr);
      }

      // Step 4: Fire cascade to refresh recon GL balances
      try {
        await executeCascade(pool, tenantId, {
          type: CascadeTriggerType.TB_REINGESTED,
          period_id: sessionId!,
          entity_id: session.entityId,
          triggered_by: uploadedBy ?? tenantId,
          affected_accounts: [],
          details: { action: 'gl_replace' },
        });
      } catch (cascadeErr) {
        console.error('Cascade after GL replace failed (non-blocking):', cascadeErr);
      }

      // Step 5: Re-run GL health analysis (non-blocking)
      try {
        await runGLHealthAnalysis(pool, tenantId, sessionId!, periodLabel);
      } catch (healthErr) {
        console.error('GL health analysis after replace failed (non-blocking):', healthErr);
      }

      res.status(200).json({
        status: 'success',
        replaced: true,
        ...uploadResult,
      });
    } catch (err) {
      const multerErr = err as { code?: string };
      if (multerErr?.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File too large', message: 'GL file must be under 50 MB.' });
        return;
      }
      console.error('GL replace error:', err);
      send500(res, err instanceof Error ? err : new Error('GL replace failed'), 'GL replace failed');
    }
  },
);

export default router;
