/**
 * Board package routes: JSON package and PDF export for board reporting.
 * Mounted under /api/close.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { buildBoardPackage, type BoardPackagePeriodType } from '../../services/board_package_service.js';

const router = Router();

/** GET /api/close/sessions/:id/board-package — structured board package JSON */
router.get('/sessions/:id/board-package', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const periodType = (req.query.periodType as BoardPackagePeriodType) ?? 'monthly';
    if (!['monthly', 'QTD', 'YTD'].includes(periodType)) {
      res.status(400).json({ error: 'periodType must be monthly, QTD, or YTD' });
      return;
    }
    const pkg = await buildBoardPackage(pool, tenantId, id, periodType);
    res.json(pkg);
  } catch (e) {
    if (e instanceof Error && e.message.includes('not yet certified')) {
      res.status(409).json({ error: e.message });
      return;
    }
    if (e instanceof Error && e.message.includes('Close session not found')) {
      res.status(404).json({ error: e.message });
      return;
    }
    if (e instanceof Error && e.message.includes('No statement package')) {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'Build board package failed');
  }
});

/** GET /api/close/sessions/:id/board-package/export/pdf — PDF export */
router.get('/sessions/:id/board-package/export/pdf', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const periodType = (req.query.periodType as BoardPackagePeriodType) ?? 'monthly';
    if (!['monthly', 'QTD', 'YTD'].includes(periodType)) {
      res.status(400).json({ error: 'periodType must be monthly, QTD, or YTD' });
      return;
    }
    const pkg = await buildBoardPackage(pool, tenantId, id, periodType);

    // Build plain-text PDF content (real PDF generation would use pdfkit or puppeteer)
    // For now, return structured HTML that the browser can print to PDF
    const html = buildBoardPackageHtml(pkg);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Board_Package_${pkg.periodLabel.replace(/[^a-zA-Z0-9]/g, '_')}.html"`);
    res.send(html);
  } catch (e) {
    if (e instanceof Error && (e.message.includes('not yet certified') || e.message.includes('Close session not found') || e.message.includes('No statement package'))) {
      res.status(409).json({ error: e.message });
      return;
    }
    send500(res, e, 'Export board package PDF failed');
  }
});

function buildBoardPackageHtml(pkg: ReturnType<typeof import('../../services/board_package_service.js')['buildBoardPackage']> extends Promise<infer T> ? T : never): string {
  const { entityName, periodEndDisplay, periodType, keyMetrics, statements, materialVariances, validationResults, certificationStatus, certifiedBy, certifiedAt, cumulativeNote } = pkg;

  const stmtToHtml = (title: string, lines: typeof statements.incomeStatement) => {
    if (lines.length === 0) return '';
    const rows = lines.map((l) => {
      const indent = '&nbsp;'.repeat(l.indentLevel * 4);
      const cls = l.isGrandTotal ? 'font-weight:bold;border-top:2px solid #000;' : l.isSubtotal ? 'font-weight:bold;' : '';
      return `<tr style="${cls}"><td>${indent}${l.name}</td><td style="text-align:right">${l.amount}</td></tr>`;
    }).join('\n');
    return `<h3>${title}</h3><table style="width:100%;border-collapse:collapse;margin-bottom:20px"><tbody>${rows}</tbody></table>`;
  };

  const metricsHtml = keyMetrics.map((m) => `<div style="display:inline-block;min-width:150px;margin:10px;padding:12px;border:1px solid #ddd;border-radius:4px"><div style="font-size:12px;color:#666">${m.label}</div><div style="font-size:18px;font-weight:bold">${m.value}</div></div>`).join('');

  const variancesHtml = materialVariances.length > 0
    ? `<h3>Material Variances</h3><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;border-bottom:1px solid #000;padding:4px">Line Item</th><th style="text-align:right;border-bottom:1px solid #000;padding:4px">Current</th><th style="text-align:right;border-bottom:1px solid #000;padding:4px">Prior</th><th style="text-align:right;border-bottom:1px solid #000;padding:4px">Change</th><th style="text-align:right;border-bottom:1px solid #000;padding:4px">%</th><th style="text-align:left;border-bottom:1px solid #000;padding:4px">Explanation</th></tr></thead><tbody>${materialVariances.map((v) => `<tr><td style="padding:4px">${v.lineItem}</td><td style="text-align:right;padding:4px">${v.currentAmount}</td><td style="text-align:right;padding:4px">${v.priorAmount}</td><td style="text-align:right;padding:4px">${v.changeAmount}</td><td style="text-align:right;padding:4px">${v.changePercent ?? '—'}%</td><td style="padding:4px">${v.explanation ?? '—'}</td></tr>`).join('')}</tbody></table>`
    : '';

  const validationHtml = validationResults.length > 0
    ? `<h3>Validation</h3><ul>${validationResults.map((v) => `<li>${v.passed ? '✓' : '✗'} ${v.check}${v.message ? ': ' + v.message : ''}</li>`).join('')}</ul>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Board Package — ${entityName}</title>
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:40px;color:#333}h1{text-align:center}h2{border-bottom:1px solid #ccc;padding-bottom:8px}table{font-size:14px}@media print{body{padding:0}}</style>
</head><body>
<h1>${entityName}</h1>
<h2 style="text-align:center">${periodEndDisplay}</h2>
${cumulativeNote ? `<p style="text-align:center;color:#666;font-style:italic">${cumulativeNote}</p>` : ''}
<p style="text-align:center;color:#888">Confidential — Board Package</p>
<hr>
<h2>Key Metrics</h2>
<div>${metricsHtml}</div>
<h2>Financial Statements</h2>
${stmtToHtml('Income Statement', statements.incomeStatement)}
${stmtToHtml('Balance Sheet', statements.balanceSheet)}
${stmtToHtml('Statement of Cash Flows', statements.cashFlow)}
${stmtToHtml("Statement of Stockholders' Equity", statements.equity)}
${variancesHtml}
${validationHtml}
<hr>
<h3>Certification</h3>
<p>Status: <strong>${certificationStatus}</strong></p>
${certifiedBy ? `<p>Certified by: ${certifiedBy} on ${certifiedAt ? new Date(certifiedAt).toLocaleDateString() : '—'}</p>` : ''}
<p style="text-align:center;color:#999;font-size:12px;margin-top:40px">Generated ${new Date().toISOString().slice(0, 10)} — Sovereign CPA Engine</p>
</body></html>`;
}

export default router;
