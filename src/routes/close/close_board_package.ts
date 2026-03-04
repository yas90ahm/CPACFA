/**
 * Board package routes: JSON package and PDF export for board reporting.
 * Mounted under /api/close.
 */

import { Router, type Request, type Response } from 'express';
import { PDFDocument, StandardFonts, rgb, degrees, type PDFPage, type PDFFont } from 'pdf-lib';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { buildBoardPackage, type BoardPackagePeriodType, type BoardPackage } from '../../services/board_package_service.js';

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
    const pdfBytes = await buildBoardPackagePdf(pkg);

    const filename = `Board_Package_${pkg.periodLabel.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(pdfBytes));
  } catch (e) {
    if (e instanceof Error && (e.message.includes('not yet certified') || e.message.includes('Close session not found') || e.message.includes('No statement package'))) {
      res.status(409).json({ error: e.message });
      return;
    }
    send500(res, e, 'Export board package PDF failed');
  }
});

// ---------------------------------------------------------------------------
// PDF generation helpers
// ---------------------------------------------------------------------------

/** Page layout constants (US Letter in points: 612 x 792) */
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_L = 54;
const MARGIN_R = 54;
const MARGIN_T = 54;
const MARGIN_B = 54;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

/** Colours */
const BLACK = rgb(0, 0, 0);
const DARK_GREY = rgb(0.25, 0.25, 0.25);
const MID_GREY = rgb(0.5, 0.5, 0.5);
const WATERMARK_GREY = rgb(0.82, 0.82, 0.82);
const NAVY = rgb(0.05, 0.15, 0.35);

/** State threaded through page-building helpers */
interface DrawCtx {
  pdfDoc: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  pages: PDFPage[];
  isDraft: boolean;
  totalPagesRef: { count: number };
}

/** Add a new page, stamp watermark if draft, return the page */
function addPage(ctx: DrawCtx): PDFPage {
  const page = ctx.pdfDoc.addPage([PAGE_W, PAGE_H]);
  ctx.pages.push(page);
  if (ctx.isDraft) drawWatermark(page, ctx.regular);
  return page;
}

/** Draw "DRAFT" diagonally across the page */
function drawWatermark(page: PDFPage, font: PDFFont): void {
  page.drawText('DRAFT', {
    x: 110,
    y: 280,
    size: 120,
    font,
    color: WATERMARK_GREY,
    rotate: degrees(45),
    opacity: 0.18,
  });
}

/** Stamp page numbers on all pages once the total is known */
function stampPageNumbers(ctx: DrawCtx): void {
  const total = ctx.pages.length;
  ctx.pages.forEach((page, idx) => {
    const label = `Page ${idx + 1} of ${total}`;
    const w = ctx.regular.widthOfTextAtSize(label, 9);
    page.drawText(label, {
      x: PAGE_W / 2 - w / 2,
      y: MARGIN_B - 18,
      size: 9,
      font: ctx.regular,
      color: MID_GREY,
    });
  });
}

/** Draw a horizontal rule */
function drawRule(page: PDFPage, y: number, color = DARK_GREY, thickness = 0.5): void {
  page.drawLine({ start: { x: MARGIN_L, y }, end: { x: PAGE_W - MARGIN_R, y }, thickness, color });
}

/** Draw centred text, return y after drawing */
function drawCentred(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color = BLACK): number {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: PAGE_W / 2 - w / 2, y, size, font, color });
  return y - size - 4;
}

/** Draw left-aligned text; returns new y after the line */
function drawText(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = BLACK): number {
  // pdf-lib drawText does not wrap — truncate to content width
  const maxChars = Math.floor(CONTENT_W / (size * 0.55));
  const safe = text.length > maxChars ? text.slice(0, maxChars - 1) + '\u2026' : text;
  page.drawText(safe, { x, y, size, font, color });
  return y - size - 3;
}

/** Draw right-aligned text at a given right-edge x */
function drawRight(page: PDFPage, text: string, rightX: number, y: number, size: number, font: PDFFont, color = BLACK): void {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

/** Section heading: navy bar + white bold text */
function drawSectionHeading(page: PDFPage, text: string, y: number, ctx: DrawCtx): number {
  page.drawRectangle({ x: MARGIN_L, y: y - 2, width: CONTENT_W, height: 16, color: NAVY });
  page.drawText(text, { x: MARGIN_L + 4, y: y + 1, size: 10, font: ctx.bold, color: rgb(1, 1, 1) });
  return y - 22;
}

/** Sub-heading (statement title) */
function drawSubHeading(page: PDFPage, text: string, y: number, ctx: DrawCtx): number {
  page.drawText(text, { x: MARGIN_L, y, size: 11, font: ctx.bold, color: NAVY });
  page.drawLine({ start: { x: MARGIN_L, y: y - 2 }, end: { x: PAGE_W - MARGIN_R, y: y - 2 }, thickness: 0.75, color: NAVY });
  return y - 16;
}

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

/** Cover page */
function buildCoverPage(pkg: BoardPackage, ctx: DrawCtx): void {
  const page = addPage(ctx);

  // Navy header bar
  page.drawRectangle({ x: 0, y: PAGE_H - 110, width: PAGE_W, height: 110, color: NAVY });
  drawCentred(page, pkg.entityName, PAGE_H - 55, 22, ctx.bold, rgb(1, 1, 1));
  drawCentred(page, pkg.periodEndDisplay, PAGE_H - 82, 13, ctx.regular, rgb(0.8, 0.85, 1));

  let y = PAGE_H - 160;
  drawCentred(page, 'Confidential \u2014 Board Package', y, 13, ctx.italic, DARK_GREY);
  y -= 28;
  drawRule(page, y, NAVY, 1);
  y -= 20;

  drawCentred(page, `Period: ${pkg.periodType.toUpperCase()}`, y, 10, ctx.regular, DARK_GREY);
  y -= 18;
  if (pkg.cumulativeNote) {
    drawCentred(page, pkg.cumulativeNote, y, 9, ctx.italic, MID_GREY);
    y -= 18;
  }

  y -= 30;
  drawCentred(page, `Certification Status: ${pkg.certificationStatus.toUpperCase()}`, y, 11, ctx.bold, pkg.certificationStatus === 'CERTIFIED' ? rgb(0.05, 0.45, 0.15) : rgb(0.6, 0.35, 0));
  y -= 20;
  if (pkg.certifiedBy) {
    drawCentred(page, `Certified by ${pkg.certifiedBy}${pkg.certifiedAt ? '  on  ' + new Date(pkg.certifiedAt).toLocaleDateString() : ''}`, y, 10, ctx.regular, DARK_GREY);
    y -= 16;
  }
  if (pkg.preparerName) {
    drawCentred(page, `Prepared by: ${pkg.preparerName}`, y, 10, ctx.regular, DARK_GREY);
    y -= 16;
  }

  // Footer
  const genLine = `Generated ${new Date().toISOString().slice(0, 10)} \u2014 Sovereign CPA Engine`;
  drawCentred(page, genLine, MARGIN_B + 10, 8, ctx.regular, MID_GREY);
}

/** Key Metrics page */
function buildMetricsPage(pkg: BoardPackage, ctx: DrawCtx): void {
  if (pkg.keyMetrics.length === 0) return;
  const page = addPage(ctx);
  let y = PAGE_H - MARGIN_T;

  y = drawSectionHeading(page, 'KEY METRICS', y, ctx);

  // Two-column grid
  const colW = CONTENT_W / 2;
  const ROW_H = 42;
  pkg.keyMetrics.forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MARGIN_L + col * colW;
    const cellY = y - row * ROW_H;

    // Cell background alternating
    if (row % 2 === 0) {
      page.drawRectangle({ x: x + 2, y: cellY - ROW_H + 4, width: colW - 4, height: ROW_H - 2, color: rgb(0.96, 0.97, 1) });
    }
    page.drawText(m.label, { x: x + 8, y: cellY - 14, size: 8, font: ctx.regular, color: MID_GREY });
    page.drawText(m.value, { x: x + 8, y: cellY - 28, size: 13, font: ctx.bold, color: NAVY });
  });
}

/** One financial statement per page */
function buildStatementPage(
  title: string,
  lines: BoardPackage['statements']['incomeStatement'],
  ctx: DrawCtx,
): void {
  if (lines.length === 0) return;

  let page = addPage(ctx);
  let y = PAGE_H - MARGIN_T;
  y = drawSubHeading(page, title, y, ctx);
  y -= 4;

  const INDENT_PX = 10;
  const RIGHT_X = PAGE_W - MARGIN_R;
  const LINE_H = 13; // point gap between lines

  for (const line of lines) {
    // Start a new page if near the bottom
    if (y < MARGIN_B + 20) {
      page = addPage(ctx);
      y = PAGE_H - MARGIN_T;
      y = drawSubHeading(page, `${title} (continued)`, y, ctx);
      y -= 4;
    }

    const font = (line.isGrandTotal || line.isSubtotal) ? ctx.bold : ctx.regular;
    const color = line.isGrandTotal ? NAVY : BLACK;
    const size = line.isGrandTotal ? 10 : 9;
    const indentX = MARGIN_L + line.indentLevel * INDENT_PX;

    if (line.isGrandTotal) {
      page.drawRectangle({ x: MARGIN_L, y: y - 1, width: CONTENT_W, height: LINE_H + 3, color: rgb(0.92, 0.93, 0.97) });
    }

    // Name (left)
    const maxNameW = CONTENT_W * 0.65;
    const maxChars = Math.floor(maxNameW / (size * 0.55));
    const nameSafe = line.name.length > maxChars ? line.name.slice(0, maxChars - 1) + '\u2026' : line.name;
    page.drawText(nameSafe, { x: indentX, y, size, font, color });

    // Amount (right)
    drawRight(page, line.amount, RIGHT_X, y, size, font, color);

    // Underline for subtotals
    if (line.isSubtotal && !line.isGrandTotal) {
      page.drawLine({ start: { x: CONTENT_W / 2 + MARGIN_L, y: y - 1 }, end: { x: RIGHT_X, y: y - 1 }, thickness: 0.4, color: DARK_GREY });
    }
    if (line.isGrandTotal) {
      page.drawLine({ start: { x: CONTENT_W / 2 + MARGIN_L, y: y - 2 }, end: { x: RIGHT_X, y: y - 2 }, thickness: 1, color: NAVY });
    }

    y -= LINE_H + 2;
  }
}

/** Material variances page */
function buildVariancesPage(pkg: BoardPackage, ctx: DrawCtx): void {
  if (pkg.materialVariances.length === 0) return;

  const page = addPage(ctx);
  let y = PAGE_H - MARGIN_T;
  y = drawSectionHeading(page, 'MATERIAL VARIANCES', y, ctx);
  y -= 4;

  // Column widths
  const cols = {
    item: { x: MARGIN_L, w: 160 },
    current: { x: MARGIN_L + 160, w: 72 },
    prior: { x: MARGIN_L + 232, w: 72 },
    change: { x: MARGIN_L + 304, w: 72 },
    pct: { x: MARGIN_L + 376, w: 44 },
    explanation: { x: MARGIN_L + 420, w: PAGE_W - MARGIN_R - (MARGIN_L + 420) },
  };

  // Header row
  page.drawRectangle({ x: MARGIN_L, y: y - 2, width: CONTENT_W, height: 14, color: rgb(0.88, 0.9, 0.95) });
  const hSize = 8;
  const hY = y;
  page.drawText('Line Item', { x: cols.item.x + 2, y: hY, size: hSize, font: ctx.bold, color: DARK_GREY });
  drawRight(page, 'Current', cols.current.x + cols.current.w, hY, hSize, ctx.bold, DARK_GREY);
  drawRight(page, 'Prior', cols.prior.x + cols.prior.w, hY, hSize, ctx.bold, DARK_GREY);
  drawRight(page, 'Change', cols.change.x + cols.change.w, hY, hSize, ctx.bold, DARK_GREY);
  drawRight(page, '%', cols.pct.x + cols.pct.w, hY, hSize, ctx.bold, DARK_GREY);
  page.drawText('Explanation', { x: cols.explanation.x + 2, y: hY, size: hSize, font: ctx.bold, color: DARK_GREY });
  y -= 16;

  const ROW_H = 12;
  pkg.materialVariances.forEach((v, idx) => {
    if (y < MARGIN_B + 20) return; // skip overflow for now
    const bg = idx % 2 === 1 ? rgb(0.97, 0.97, 0.99) : rgb(1, 1, 1);
    page.drawRectangle({ x: MARGIN_L, y: y - 2, width: CONTENT_W, height: ROW_H, color: bg });

    const sz = 8;
    const trunc = (s: string, maxW: number) => {
      const mc = Math.floor(maxW / (sz * 0.55));
      return s.length > mc ? s.slice(0, mc - 1) + '\u2026' : s;
    };

    page.drawText(trunc(v.lineItem, cols.item.w - 4), { x: cols.item.x + 2, y, size: sz, font: ctx.regular, color: BLACK });
    drawRight(page, v.currentAmount, cols.current.x + cols.current.w, y, sz, ctx.regular, BLACK);
    drawRight(page, v.priorAmount, cols.prior.x + cols.prior.w, y, sz, ctx.regular, BLACK);

    const changeColor = v.changeAmount.startsWith('-') ? rgb(0.7, 0.1, 0.1) : rgb(0.05, 0.45, 0.15);
    drawRight(page, v.changeAmount, cols.change.x + cols.change.w, y, sz, ctx.bold, changeColor);
    drawRight(page, v.changePercent ? `${v.changePercent}%` : '\u2014', cols.pct.x + cols.pct.w, y, sz, ctx.regular, DARK_GREY);
    page.drawText(trunc(v.explanation ?? '\u2014', cols.explanation.w - 4), { x: cols.explanation.x + 2, y, size: sz, font: ctx.italic, color: DARK_GREY });

    y -= ROW_H + 2;
  });
}

/** Certification page */
function buildCertificationPage(pkg: BoardPackage, ctx: DrawCtx): void {
  const page = addPage(ctx);
  let y = PAGE_H - MARGIN_T;

  y = drawSectionHeading(page, 'CERTIFICATION', y, ctx);
  y -= 10;

  const statusColor = pkg.certificationStatus === 'CERTIFIED' ? rgb(0.05, 0.45, 0.15) : rgb(0.6, 0.35, 0);
  drawCentred(page, `Status: ${pkg.certificationStatus.toUpperCase()}`, y, 14, ctx.bold, statusColor);
  y -= 24;

  if (pkg.certifiedBy) {
    drawCentred(page, `Certified by: ${pkg.certifiedBy}`, y, 11, ctx.regular, DARK_GREY);
    y -= 18;
  }
  if (pkg.certifiedAt) {
    drawCentred(page, `Date: ${new Date(pkg.certifiedAt).toLocaleString()}`, y, 11, ctx.regular, DARK_GREY);
    y -= 18;
  }
  if (pkg.preparerName) {
    drawCentred(page, `Prepared by: ${pkg.preparerName}`, y, 11, ctx.regular, DARK_GREY);
    y -= 18;
  }

  y -= 30;
  drawRule(page, y, NAVY, 0.75);
  y -= 20;

  // Validation results
  if (pkg.validationResults.length > 0) {
    y = drawSubHeading(page, 'Validation Checks', y, ctx);
    y -= 4;
    for (const v of pkg.validationResults) {
      if (y < MARGIN_B + 20) break;
      const mark = v.passed ? '\u2713' : '\u2717';
      const color = v.passed ? rgb(0.05, 0.45, 0.15) : rgb(0.7, 0.1, 0.1);
      const label = `${mark}  ${v.check}${v.message ? ': ' + v.message : ''}`;
      drawText(page, label, MARGIN_L, y, 9, ctx.regular, color);
      y -= 14;
    }
  }

  // Footer signature line
  y = MARGIN_B + 60;
  drawRule(page, y, DARK_GREY, 0.5);
  y -= 14;
  drawCentred(page, 'Authorised Signature', y, 9, ctx.regular, MID_GREY);
  y -= 40;
  drawRule(page, y, DARK_GREY, 0.5);
  y -= 14;
  drawCentred(page, 'Date', y, 9, ctx.regular, MID_GREY);
}

/** Main entry: build the full PDF and return bytes */
async function buildBoardPackagePdf(pkg: BoardPackage): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Board Package — ${pkg.entityName} — ${pkg.periodEndDisplay}`);
  pdfDoc.setAuthor(pkg.preparerName ?? 'Sovereign CPA Engine');
  pdfDoc.setSubject('Confidential Board Package');
  pdfDoc.setKeywords(['board package', 'financial statements', pkg.entityName]);
  pdfDoc.setCreator('Sovereign CPA Engine');
  pdfDoc.setProducer('pdf-lib');

  const [regular, bold, italic, boldItalic] = await Promise.all([
    pdfDoc.embedFont(StandardFonts.Helvetica),
    pdfDoc.embedFont(StandardFonts.HelveticaBold),
    pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
  ]);

  const isDraft = pkg.certificationStatus !== 'CERTIFIED';
  const ctx: DrawCtx = { pdfDoc, regular, bold, italic, boldItalic, pages: [], isDraft, totalPagesRef: { count: 0 } };

  buildCoverPage(pkg, ctx);
  buildMetricsPage(pkg, ctx);

  buildStatementPage('Income Statement', pkg.statements.incomeStatement, ctx);
  buildStatementPage('Balance Sheet', pkg.statements.balanceSheet, ctx);
  buildStatementPage('Statement of Cash Flows', pkg.statements.cashFlow, ctx);
  buildStatementPage("Statement of Stockholders' Equity", pkg.statements.equity, ctx);

  buildVariancesPage(pkg, ctx);
  buildCertificationPage(pkg, ctx);

  // Stamp page numbers now that all pages exist
  stampPageNumbers(ctx);

  return pdfDoc.save();
}

export default router;
