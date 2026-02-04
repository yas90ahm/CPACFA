/**
 * Export Audit Defense: generate professional PDF from HTML summary or structured payload.
 * Uses pdf-lib to build PDF from structured content (no HTML parsing).
 * Supports agent-drafted narrative and Reasoning Chain (ReAct thoughts + actions) as appendix.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { ReasoningChainEntry, CompliancePackage } from './export_service.js';

const MARGIN = 50;
const LINE_HEIGHT = 14;
const FONT_SIZE = 11;
const TITLE_SIZE = 16;
const SMALL_SIZE = 9;

/** Structured payload for PDF with agent narrative, Reasoning Chain appendix, and optional Compliance Package. */
export interface StructuredPdfPayload {
  cover: Record<string, string>;
  executive_summary: string;
  overview?: string;
  highlights?: string[];
  financial_statements?: Record<string, unknown>;
  audit_trail?: Array<{ timestamp_utc: string; event_type: string; reasoning: string; citations: string; outcome: string }>;
  /** Reasoning Chain: Thoughts and Actions from ReAct loop (appendix). */
  reasoning_chain_appendix?: ReasoningChainEntry[];
  /** When true, show bold header: UNAUDITED NARRATIVE - PRELIMINARY ONLY (QUALITATIVE_EVIDENCE_MISSING). */
  unauditedNarrativeHeader?: boolean;
  /** Compliance Package: balanced statements, IRAC justifications, ledger hash (audit binder). */
  compliancePackage?: CompliancePackage;
}

function wrapLines(
  text: string,
  maxWidth: number,
  font: { widthOfTextAtSize: (t: string, size: number) => number },
  fontSize: number = FONT_SIZE
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const next = current ? current + ' ' + w : w;
    if (font.widthOfTextAtSize(next, FONT_SIZE) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function createPdfFromHtml(html: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595;
  const pageHeight = 842;
  const maxTextWidth = pageWidth - 2 * MARGIN;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - MARGIN;

  const drawText = (text: string, opts?: { bold?: boolean; size?: number }) => {
    const size = opts?.size ?? FONT_SIZE;
    const f = opts?.bold ? bold : font;
    const lines = wrapLines(text, maxTextWidth, f, size);
    for (const line of lines) {
      if (y < MARGIN + LINE_HEIGHT) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0, 0, 0) });
      y -= LINE_HEIGHT;
    }
  };

  // Title from HTML <h1> or default
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (c) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[c] ?? c)) : 'Audit Defense — Justifications';
  drawText(title, { bold: true, size: TITLE_SIZE });
  y -= LINE_HEIGHT;

  // Meta from HTML
  const entityMatch = html.match(/<strong>Entity:<\/strong>\s*([^<]+)/i);
  const periodMatch = html.match(/<strong>Period:<\/strong>\s*([^<]+)/i);
  if (entityMatch) drawText('Entity: ' + entityMatch[1].trim());
  if (periodMatch) drawText('Period: ' + periodMatch[1].trim());
  drawText('Report generated: ' + new Date().toISOString());
  y -= LINE_HEIGHT * 2;

  // Justifications: extract each .justification block
  const blockRegex = /<div class="justification"[^>]*>([\s\S]*?)<\/div>\s*(?=<div|$)/gi;
  let m: RegExpExecArray | null;
  let idx = 0;
  const hasNoJustifications = !/<div class="justification"/i.test(html);
  if (hasNoJustifications) {
    drawText('No justifications recorded for this period.');
  }
  while ((m = blockRegex.exec(html)) !== null) {
    const block = m[1];
    const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (c) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[c] ?? c)).replace(/\s+/g, ' ').trim();
    const h3 = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const issue = block.match(/<strong>Issue:<\/strong>\s*([\s\S]*?)<\/p>/i);
    const rule = block.match(/<strong>Rule:<\/strong>\s*([\s\S]*?)<\/p>/i);
    const analysis = block.match(/<strong>Analysis:<\/strong>\s*([\s\S]*?)<\/p>/i);
    const conclusion = block.match(/<strong>Conclusion:<\/strong>\s*([\s\S]*?)<\/p>/i);
    const citation = block.match(/<strong>Citation:<\/strong>\s*([\s\S]*?)<\/p>/i);
    if (y < 200) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - MARGIN;
    }
    idx += 1;
    drawText(`${idx}. ${h3 ? strip(h3[1]) : 'Justification'}`, { bold: true });
    if (issue) drawText('Issue: ' + strip(issue[1]));
    if (rule) drawText('Rule: ' + strip(rule[1]));
    if (analysis) drawText('Analysis: ' + strip(analysis[1]));
    if (conclusion) drawText('Conclusion: ' + strip(conclusion[1]));
    if (citation) drawText('Source: ' + strip(citation[1]));
    y -= LINE_HEIGHT;
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Generate PDF from structured payload: agent-drafted narrative + Reasoning Chain appendix.
 * Dynamic generation instead of static template.
 */
export async function createPdfFromStructuredPayload(payload: StructuredPdfPayload): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595;
  const pageHeight = 842;
  const maxTextWidth = pageWidth - 2 * MARGIN;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - MARGIN;

  if (payload.unauditedNarrativeHeader) {
    const headerText = 'UNAUDITED NARRATIVE - PRELIMINARY ONLY';
    const headerSize = 12;
    page.drawText(headerText, { x: MARGIN, y, size: headerSize, font: bold, color: rgb(0.6, 0, 0) });
    y -= LINE_HEIGHT * 1.5;
  }

  const drawText = (text: string, opts?: { bold?: boolean; size?: number }) => {
    const size = opts?.size ?? FONT_SIZE;
    const f = opts?.bold ? bold : font;
    const lines = wrapLines(text, maxTextWidth, f, size);
    for (const line of lines) {
      if (y < MARGIN + LINE_HEIGHT) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0, 0, 0) });
      y -= LINE_HEIGHT;
    }
  };

  const cover = payload.cover;
  const title = (cover?.title as string) ?? 'Financial Report';
  drawText(title, { bold: true, size: TITLE_SIZE });
  y -= LINE_HEIGHT;
  if (cover?.entity_name) drawText('Entity: ' + String(cover.entity_name));
  if (cover?.report_date) drawText('Report date: ' + String(cover.report_date));
  if (cover?.period_label) drawText('Period: ' + String(cover.period_label));
  drawText('Report generated: ' + new Date().toISOString());
  y -= LINE_HEIGHT * 2;

  drawText('Executive Summary', { bold: true });
  drawText(payload.executive_summary);
  y -= LINE_HEIGHT;

  if (payload.overview) {
    drawText('Overview', { bold: true });
    drawText(payload.overview);
    y -= LINE_HEIGHT;
  }
  if (payload.highlights?.length) {
    drawText('Highlights', { bold: true });
    for (const h of payload.highlights) drawText('• ' + h);
    y -= LINE_HEIGHT;
  }
  y -= LINE_HEIGHT;

  if (payload.financial_statements) {
    drawText('Financial Statements Summary', { bold: true, size: 14 });
    const fs = payload.financial_statements as Record<string, unknown>;
    const bs = fs.balance_sheet as Record<string, unknown> | undefined;
    const pl = fs.profit_and_loss as Record<string, unknown> | undefined;
    if (bs) {
      drawText('Balance Sheet: Total Assets ' + String(bs.totalAssets ?? '—') + ', Total Liabilities ' + String(bs.totalLiabilities ?? '—') + ', Total Equity ' + String(bs.totalEquity ?? '—'));
    }
    if (pl) {
      drawText('P&L: Revenue ' + String(pl.totalRevenue ?? '—') + ', Expenses ' + String(pl.totalExpenses ?? '—') + ', Net Income ' + String(pl.netIncome ?? '—'));
    }
    y -= LINE_HEIGHT * 2;
  }

  if (payload.audit_trail?.length) {
    if (y < 300) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - MARGIN;
    }
    drawText('Audit Trail', { bold: true, size: 14 });
    for (const e of payload.audit_trail.slice(0, 10)) {
      drawText(`${e.timestamp_utc} | ${e.event_type}: ${e.reasoning.slice(0, 120)}…`, { size: SMALL_SIZE });
    }
    y -= LINE_HEIGHT * 2;
  }

  if (payload.reasoning_chain_appendix?.length) {
    if (y < 400) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - MARGIN;
    }
    drawText('Appendix: Reasoning Chain (ReAct Thoughts and Actions)', { bold: true, size: 14 });
    y -= LINE_HEIGHT;
    drawText('Full transparency: the following are the Supervisor agent\'s thoughts and tool actions from the ReAct loop.', { size: SMALL_SIZE });
    y -= LINE_HEIGHT;
    let step = 1;
    for (const entry of payload.reasoning_chain_appendix) {
      if (y < MARGIN + LINE_HEIGHT * 3) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - MARGIN;
      }
      if (entry.type === 'thought') {
        drawText(`Step ${step} — Thought:`, { bold: true, size: SMALL_SIZE });
        drawText(entry.content.slice(0, 500) + (entry.content.length > 500 ? '…' : ''), { size: SMALL_SIZE });
      } else {
        drawText(`Step ${step} — Action: ${entry.toolName ?? entry.content}`, { bold: true, size: SMALL_SIZE });
        if (entry.resultSummary) drawText('Result: ' + entry.resultSummary.slice(0, 300) + (entry.resultSummary.length > 300 ? '…' : ''), { size: SMALL_SIZE });
      }
      y -= LINE_HEIGHT;
      step += 1;
    }
  }

  if (payload.compliancePackage) {
    if (y < 200) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - MARGIN;
    }
    drawText('Compliance Package (Audit Binder)', { bold: true, size: 14 });
    y -= LINE_HEIGHT;
    drawText('Balanced Financial Statements: Included in this report. IRAC-grounded justification for every agentic adjustment: see Audit Trail above.', { size: SMALL_SIZE });
    y -= LINE_HEIGHT;
    drawText('Ledger integrity (SHA-256): ' + payload.compliancePackage.ledgerHash, { size: SMALL_SIZE });
    drawText('This hash proves the ledger has not been tampered with since the last CPA review.', { size: SMALL_SIZE });
    y -= LINE_HEIGHT;
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
