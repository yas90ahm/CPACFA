/**
 * Audit binder routes: register-statements, binder, binder/export/pdf, binder/export/csv.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import {
  buildAuditBinder,
  registerStatementGeneration,
} from '../../services/audit_export_service.js';
import { exportAuditBinderToPdf, exportAuditBinderToCsv } from '../../services/audit_binder_export_service.js';
import { validateBody } from '../../middleware/validationMiddleware.js';
import { registerStatementsBodySchema } from '../../schemas/auditSchemas.js';
import { handleAuditError, handleAuditOrIntegrityError } from './audit_shared.js';

const router = Router();

/** POST /api/audit/register-statements */
router.post('/register-statements', validateBody(registerStatementsBodySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    await registerStatementGeneration(body.statements as Parameters<typeof registerStatementGeneration>[0], {
      sourceDocumentId: body.sourceDocumentId,
      sourceDocumentName: body.sourceDocumentName,
      reasoningChainId: body.reasoningChainId,
      tenantId: getTenantId(req),
      pool: getTenantPool(req),
    });
    res.json({ ok: true, message: 'Statement generation registered for Audit Binder.' });
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Registration error');
  }
});

/** GET /api/audit/binder */
router.get('/binder', async (req: Request, res: Response) => {
  try {
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const entityName = (req.query.entityName as string) ?? 'Entity';
    const host = req.get('host');
    const baseUrl = req.protocol + '://' + (host ?? '');
    const binder = await buildAuditBinder({
      periodStart,
      periodEnd,
      entityName,
      baseSourceDocumentUrl: `${baseUrl}/api/audit/source-document`,
      baseReasoningUrl: `${baseUrl}/api/audit/reasoning`,
      tenantId: getTenantId(req),
      pool: getTenantPool(req),
    });
    res.json(binder);
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Binder error');
  }
});

/** GET /api/audit/binder/export/pdf */
router.get('/binder/export/pdf', async (req: Request, res: Response) => {
  try {
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const entityName = (req.query.entityName as string) ?? 'Entity';
    const host = req.get('host');
    const baseUrl = req.protocol + '://' + (host ?? '');
    const binder = await buildAuditBinder({
      periodStart,
      periodEnd,
      entityName,
      baseSourceDocumentUrl: `${baseUrl}/api/audit/source-document`,
      baseReasoningUrl: `${baseUrl}/api/audit/reasoning`,
      tenantId: getTenantId(req),
      pool: getTenantPool(req),
    });
    const buffer = await exportAuditBinderToPdf(binder);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit-binder-${periodStart}-${periodEnd}.pdf"`);
    res.send(buffer);
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Binder export error');
  }
});

/** GET /api/audit/binder/export/csv */
router.get('/binder/export/csv', async (req: Request, res: Response) => {
  try {
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const entityName = (req.query.entityName as string) ?? 'Entity';
    const host = req.get('host');
    const baseUrl = req.protocol + '://' + (host ?? '');
    const binder = await buildAuditBinder({
      periodStart,
      periodEnd,
      entityName,
      baseSourceDocumentUrl: `${baseUrl}/api/audit/source-document`,
      baseReasoningUrl: `${baseUrl}/api/audit/reasoning`,
      tenantId: getTenantId(req),
      pool: getTenantPool(req),
    });
    const buffer = exportAuditBinderToCsv(binder);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-binder-${periodStart}-${periodEnd}.csv"`);
    res.send(buffer);
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Binder export error');
  }
});

export default router;
