/**
 * Audit artifacts routes: source-document, reasoning, audit-file, readiness-one-pager, package (and exports).
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { getLastStatementGeneration } from '../../services/audit_export_service.js';
import { buildAuditFile, exportAuditFileToPdf } from '../../services/audit_file_service.js';
import { buildCloseOnePager, exportCloseOnePagerToPdf } from '../../services/close_one_pager_service.js';
import { exportClosePackageToPdf, exportClosePackageToCsv } from '../../services/close_package_export_service.js';
import { buildClosePackage } from '../../services/close_package_service.js';
import { generateCloseNarrativeAgentic } from '../../services/agentic_close_narrative.js';
import { handleAuditError } from './audit_shared.js';

const router = Router();

/** GET /api/audit/source-document/:id */
router.get('/source-document/:id', async (req: Request, res: Response) => {
  const stored = await getLastStatementGeneration(getTenantId(req), getTenantPool(req));
  if (!stored || stored.sourceDocumentId !== req.params.id) {
    res.status(404).json({
      error: 'Not found',
      message: 'Source document not found or no statement generation registered.',
    });
    return;
  }
  res.json({
    id: stored.sourceDocumentId,
    name: stored.sourceDocumentName,
    registeredAt: stored.registeredAt,
    message: 'Download or view the uploaded Trial Balance (CSV/XLSX) from the ingestion that produced this statement.',
  });
});

/** GET /api/audit/reasoning/:id */
router.get('/reasoning/:id', async (req: Request, res: Response) => {
  const stored = await getLastStatementGeneration(getTenantId(req), getTenantPool(req));
  const id = req.params.id;
  if (!stored) {
    res.status(404).json({
      error: 'Not found',
      message: 'Reasoning monologue not found or no statement generation registered.',
    });
    return;
  }
  if (stored.reasoningChainId !== id) {
    res.status(404).json({
      error: 'Not found',
      message: 'Reasoning monologue id does not match.',
    });
    return;
  }
  const chain = stored.statements.reasoningChain;
  res.json({
    id: stored.reasoningChainId,
    timestamp: stored.reasoningChainTimestamp,
    plan: chain?.plan,
    executedAt: chain?.executedAt,
    verification: chain?.verification,
    message: 'Reasoning chain (Plan-Execute-Verify) used to categorize and build the financial statements.',
  });
});

/** GET /api/audit/audit-file */
router.get('/audit-file', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId || !pool) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context (tenantId, pool)' });
      return;
    }
    const auditFile = await buildAuditFile(tenantId, periodLabel, pool);
    res.json(auditFile);
  } catch (err) {
    handleAuditError(res, err, 'Audit file error');
  }
});

/** GET /api/audit/audit-file/export/pdf */
router.get('/audit-file/export/pdf', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId || !pool) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context (tenantId, pool)' });
      return;
    }
    const auditFile = await buildAuditFile(tenantId, periodLabel, pool);
    const pdf = await exportAuditFileToPdf(auditFile);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit-file-${periodLabel}.pdf"`);
    res.send(pdf);
  } catch (err) {
    handleAuditError(res, err, 'Audit file PDF export error');
  }
});

/** GET /api/audit/readiness-one-pager */
router.get('/readiness-one-pager', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId || !pool) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context (tenantId, pool)' });
      return;
    }
    const onePager = await buildCloseOnePager(tenantId, periodLabel, pool, { includeNarrative });
    res.json(onePager);
  } catch (err) {
    handleAuditError(res, err, 'Audit readiness one-pager error');
  }
});

/** GET /api/audit/readiness-one-pager/export/pdf */
router.get('/readiness-one-pager/export/pdf', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId || !pool) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context (tenantId, pool)' });
      return;
    }
    const onePager = await buildCloseOnePager(tenantId, periodLabel, pool, { includeNarrative });
    const pdf = await exportCloseOnePagerToPdf(onePager, { title: 'Audit Readiness One-Pager' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit-readiness-one-pager-${periodLabel}.pdf"`);
    res.send(pdf);
  } catch (err) {
    handleAuditError(res, err, 'Audit readiness one-pager PDF export error');
  }
});

/** GET /api/audit/package */
router.get('/package', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel query' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required (tenantId, pool)' });
      return;
    }
    const pkg = await buildClosePackage(tenantId, periodLabel, pool);
    let narrative: string | null = null;
    if (includeNarrative) {
      try {
        narrative = (await generateCloseNarrativeAgentic(pkg)) || null;
      } catch {
        narrative = null;
      }
    }
    res.json(narrative != null ? { ...pkg, narrative } : pkg);
  } catch (err) {
    handleAuditError(res, err, 'Audit package error');
  }
});

/** GET /api/audit/package/export/pdf */
router.get('/package/export/pdf', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel query' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required (tenantId, pool)' });
      return;
    }
    const pkg = await buildClosePackage(tenantId, periodLabel, pool);
    let narrative: string | null = null;
    if (includeNarrative) {
      try {
        narrative = (await generateCloseNarrativeAgentic(pkg)) || null;
      } catch {
        narrative = null;
      }
    }
    const pdf = await exportClosePackageToPdf(pkg, { title: 'Audit Package', includeNarrative: !!includeNarrative, narrative });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit-package-${periodLabel}.pdf"`);
    res.send(pdf);
  } catch (err) {
    handleAuditError(res, err, 'Audit package PDF export error');
  }
});

/** GET /api/audit/package/export/csv */
router.get('/package/export/csv', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel query' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required (tenantId, pool)' });
      return;
    }
    const pkg = await buildClosePackage(tenantId, periodLabel, pool);
    const csv = exportClosePackageToCsv(pkg);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-package-${periodLabel}.csv"`);
    res.send(csv);
  } catch (err) {
    handleAuditError(res, err, 'Audit package CSV export error');
  }
});

export default router;
