/**
 * Audit binder routes: register-statements, binder, binder/export/pdf, binder/export/csv.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import {
  buildAuditBinder,
  registerStatementGeneration,
  getCertifiedStatementsForBinder,
} from '../../services/audit_export_service.js';
import {
  exportAuditBinderToPdf,
  exportAuditBinderToCsv,
  exportDraftPackageToPdf,
} from '../../services/audit_binder_export_service.js';
import { checkExportGate } from '../../services/export_gate_service.js';
import { listStagingItems } from '../../services/persistence_service.js';
import { validateBody } from '../../middleware/validationMiddleware.js';
import { registerStatementsBodySchema } from '../../schemas/auditSchemas.js';
import { handleAuditError, handleAuditOrIntegrityError } from './audit_shared.js';

const router = Router();

/** Build ingest metadata for binder from staging items in period (trust boundary). */
async function getIngestMetadataForPeriod(
  pool: NonNullable<ReturnType<typeof getTenantPool>>,
  tenantId: string,
  periodLabel: string
): Promise<Array<{ source_type: string; source_hash: string; ingestion_timestamp: string }>> {
  const items = await listStagingItems(pool, tenantId, { limit: 500 });
  const out: Array<{ source_type: string; source_hash: string; ingestion_timestamp: string }> = [];
  for (const item of items) {
    const p = item.payload as Record<string, unknown> | undefined;
    if (p?.kind !== 'trial_balance_ingest' || p?.periodLabel !== periodLabel) continue;
    const st = p.source_type; const sh = p.source_hash; const it = p.ingestion_timestamp;
    if (typeof st === 'string' && typeof sh === 'string' && typeof it === 'string') out.push({ source_type: st, source_hash: sh, ingestion_timestamp: it });
  }
  return out;
}

/** Require closeSessionId (query) and session.status === 'certified'. Returns 403 if not. Binder is certified-only. */
async function requireCertifiedSession(
  req: Request,
  res: Response
): Promise<{ allowed: boolean; pool: ReturnType<typeof getTenantPool>; tenantId: string | undefined } | null> {
  const tenantId = getTenantId(req);
  const pool = getTenantPool(req);
  if (!tenantId || !pool) {
    res.status(403).json({
      error: 'Tenant context required',
      code: 'TENANT_REQUIRED',
      message: 'Binder endpoints require tenant context.',
    });
    return null;
  }
  const closeSessionId = (req.query.closeSessionId as string) ?? '';
  if (!closeSessionId) {
    res.status(400).json({
      error: 'closeSessionId required',
      code: 'CLOSE_SESSION_REQUIRED',
      message: 'Binder requires closeSessionId as query parameter. Session must be certified.',
    });
    return null;
  }
  const { getSession } = await import('../../services/close_session_service.js');
  const session = await getSession(pool, tenantId, closeSessionId);
  if (!session) {
    res.status(403).json({
      error: 'Close session not found',
      code: 'CLOSE_SESSION_NOT_FOUND',
      message: 'Binder requires an existing close session.',
    });
    return null;
  }
  if (session.status !== 'certified') {
    res.status(403).json({
      error: 'Close not certified',
      code: 'CLOSE_NOT_CERTIFIED',
      message: 'Binder is certified-only. Session must have status certified. Use /api/audit/draft-package for draft.',
    });
    return null;
  }
  return { allowed: true, pool, tenantId };
}

/** Run checkExportGate only. Certified statements (with Truth Gate) are obtained via getCertifiedStatementsForBinder. */
async function runBinderExportGates(
  req: Request,
  res: Response,
  auth: { pool: NonNullable<ReturnType<typeof getTenantPool>>; tenantId: string }
): Promise<boolean> {
  const periodLabel =
    (req.query.periodEnd as string)?.trim()?.slice(0, 7) ??
    (req.query.periodStart as string)?.trim()?.slice(0, 7) ??
    undefined;
  const gateResult = await checkExportGate({
    tenantId: auth.tenantId,
    pool: auth.pool,
    periodLabel,
  });
  if (!gateResult.allowed) {
    res.status(403).json({
      error: gateResult.alert ?? 'Export blocked',
      code: gateResult.alert,
      message: gateResult.message ?? 'Binder export blocked. Truth Gate or audit chain check failed.',
    });
    return false;
  }
  return true;
}

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

/** GET /api/audit/binder — certified only; requires closeSessionId, session.status === 'certified', checkExportGate. Uses canonical getCertifiedStatementsForBinder (snapshot or last registered + Truth Gate). */
router.get('/binder', async (req: Request, res: Response) => {
  try {
    const auth = await requireCertifiedSession(req, res);
    if (!auth || !auth.pool || auth.tenantId == null) return;
    if (!(await runBinderExportGates(req, res, { pool: auth.pool, tenantId: auth.tenantId }))) return;
    const closeSessionId = (req.query.closeSessionId as string) ?? '';
    const statements = await getCertifiedStatementsForBinder(auth.pool, auth.tenantId, closeSessionId);
    if (!statements) {
      res.status(422).json({
        error: 'Unprocessable Entity',
        code: 'FINAL_INTEGRITY_CHECK_FAILED',
        message: 'No certified statements available or Truth Gate failed. Create a ledger snapshot for this session or register statements that pass integrity check.',
      });
      return;
    }
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const periodLabel = periodEnd.slice(0, 7);
    const entityName = (req.query.entityName as string) ?? 'Entity';
    const host = req.get('host');
    const baseUrl = req.protocol + '://' + (host ?? '');
    const ingestMetadata = await getIngestMetadataForPeriod(auth.pool, auth.tenantId, periodLabel);
    const binder = await buildAuditBinder({
      periodStart,
      periodEnd,
      entityName,
      statements,
      baseSourceDocumentUrl: `${baseUrl}/api/audit/source-document`,
      baseReasoningUrl: `${baseUrl}/api/audit/reasoning`,
      tenantId: auth.tenantId,
      pool: auth.pool,
      ingestMetadata: ingestMetadata.length ? ingestMetadata : undefined,
    });
    res.json(binder);
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Binder error');
  }
});

/** GET /api/audit/binder/export/pdf — certified only; uses getCertifiedStatementsForBinder. */
router.get('/binder/export/pdf', async (req: Request, res: Response) => {
  try {
    const auth = await requireCertifiedSession(req, res);
    if (!auth || !auth.pool || auth.tenantId == null) return;
    if (!(await runBinderExportGates(req, res, { pool: auth.pool, tenantId: auth.tenantId }))) return;
    const closeSessionId = (req.query.closeSessionId as string) ?? '';
    const statements = await getCertifiedStatementsForBinder(auth.pool, auth.tenantId, closeSessionId);
    if (!statements) {
      res.status(422).json({
        error: 'Unprocessable Entity',
        code: 'FINAL_INTEGRITY_CHECK_FAILED',
        message: 'No certified statements available or Truth Gate failed.',
      });
      return;
    }
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const entityName = (req.query.entityName as string) ?? 'Entity';
    const host = req.get('host');
    const baseUrl = req.protocol + '://' + (host ?? '');
    const ingestMetadata = await getIngestMetadataForPeriod(auth.pool, auth.tenantId, periodEnd.slice(0, 7));
    const binder = await buildAuditBinder({
      periodStart,
      periodEnd,
      entityName,
      statements,
      baseSourceDocumentUrl: `${baseUrl}/api/audit/source-document`,
      baseReasoningUrl: `${baseUrl}/api/audit/reasoning`,
      tenantId: auth.tenantId,
      pool: auth.pool,
      ingestMetadata: ingestMetadata.length ? ingestMetadata : undefined,
    });
    const buffer = await exportAuditBinderToPdf(binder);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Audit_Binder-${periodStart}-${periodEnd}.pdf"`);
    res.send(buffer);
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Binder export error');
  }
});

/** GET /api/audit/binder/export/csv — certified only; uses getCertifiedStatementsForBinder. */
router.get('/binder/export/csv', async (req: Request, res: Response) => {
  try {
    const auth = await requireCertifiedSession(req, res);
    if (!auth || !auth.pool || auth.tenantId == null) return;
    if (!(await runBinderExportGates(req, res, { pool: auth.pool, tenantId: auth.tenantId }))) return;
    const closeSessionId = (req.query.closeSessionId as string) ?? '';
    const statements = await getCertifiedStatementsForBinder(auth.pool, auth.tenantId, closeSessionId);
    if (!statements) {
      res.status(422).json({
        error: 'Unprocessable Entity',
        code: 'FINAL_INTEGRITY_CHECK_FAILED',
        message: 'No certified statements available or Truth Gate failed.',
      });
      return;
    }
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const entityName = (req.query.entityName as string) ?? 'Entity';
    const host = req.get('host');
    const baseUrl = req.protocol + '://' + (host ?? '');
    const ingestMetadata = await getIngestMetadataForPeriod(auth.pool, auth.tenantId, periodEnd.slice(0, 7));
    const binder = await buildAuditBinder({
      periodStart,
      periodEnd,
      entityName,
      statements,
      baseSourceDocumentUrl: `${baseUrl}/api/audit/source-document`,
      baseReasoningUrl: `${baseUrl}/api/audit/reasoning`,
      tenantId: auth.tenantId,
      pool: auth.pool,
      ingestMetadata: ingestMetadata.length ? ingestMetadata : undefined,
    });
    const buffer = exportAuditBinderToCsv(binder);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Audit_Binder-${periodStart}-${periodEnd}.csv"`);
    res.send(buffer);
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Binder export error');
  }
});

/** GET /api/audit/draft-package — draft only; explicitly NOT the Audit Binder. Same content shape with DRAFT watermark and disclaimer. */
router.get('/draft-package', async (req: Request, res: Response) => {
  try {
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const entityName = (req.query.entityName as string) ?? 'Entity';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const host = req.get('host');
    const baseUrl = req.protocol + '://' + (host ?? '');
    const binder = await buildAuditBinder({
      periodStart,
      periodEnd,
      entityName,
      baseSourceDocumentUrl: `${baseUrl}/api/audit/source-document`,
      baseReasoningUrl: `${baseUrl}/api/audit/reasoning`,
      tenantId,
      pool,
    });
    const buffer = await exportDraftPackageToPdf(binder);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Draft_Package_NOT_CERTIFIED.pdf"');
    res.send(buffer);
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Draft package export error');
  }
});

export default router;
