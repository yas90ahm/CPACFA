/**
 * Audit Binder export: PDF and CSV from buildAuditBinder output.
 */

import type { AuditBinder, LineAuditLink, CashFlowOrEquityLineLink } from '../types/audit.js';
import { createPdfFromHtml } from './pdf_export.js';

/**
 * Build HTML summary of audit binder for PDF (entity, period, statements summary, line links count).
 */
function binderToHtml(binder: AuditBinder): string {
  const parts: string[] = [];
  parts.push('<h1>Audit Binder</h1>');
  parts.push(`<p><strong>Entity:</strong> ${binder.entityName}</p>`);
  parts.push(`<p><strong>Period:</strong> ${binder.periodStart} to ${binder.periodEnd}</p>`);
  parts.push(`<p><strong>Generated:</strong> ${binder.generatedAt}</p>`);

  if (binder.balanceSheetBundle) {
    parts.push('<h2>Balance Sheet</h2>');
    parts.push(`<p>Line-level links: ${binder.balanceSheetBundle.lineLinks.length}</p>`);
    const bs = binder.balanceSheetBundle.statement as { assets?: { label: string; amount: number }[]; liabilities?: { label: string; amount: number }[]; equity?: { label: string; amount: number }[] };
    if (bs.assets?.length) parts.push('<p>Assets: ' + bs.assets.map((a) => `${a.label} ${a.amount}`).join('; ') + '</p>');
    if (bs.liabilities?.length) parts.push('<p>Liabilities: ' + bs.liabilities.map((l) => `${l.label} ${l.amount}`).join('; ') + '</p>');
    if (bs.equity?.length) parts.push('<p>Equity: ' + bs.equity.map((e) => `${e.label} ${e.amount}`).join('; ') + '</p>');
  }
  if (binder.profitAndLossBundle) {
    parts.push('<h2>Profit and Loss</h2>');
    parts.push(`<p>Line-level links: ${binder.profitAndLossBundle.lineLinks.length}</p>`);
    const pl = binder.profitAndLossBundle.statement as { revenue?: { label: string; amount: number }[]; expenses?: { label: string; amount: number }[] };
    if (pl.revenue?.length) parts.push('<p>Revenue: ' + pl.revenue.map((r) => `${r.label} ${r.amount}`).join('; ') + '</p>');
    if (pl.expenses?.length) parts.push('<p>Expenses: ' + pl.expenses.map((e) => `${e.label} ${e.amount}`).join('; ') + '</p>');
  }
  if (binder.cashFlowBundle) {
    parts.push('<h2>Cash Flow</h2>');
    parts.push(`<p>Line-level links: ${binder.cashFlowBundle.lineLinks.length}</p>`);
  }
  if (binder.equityChangesBundle) {
    parts.push('<h2>Statement of Changes in Equity</h2>');
    parts.push(`<p>Line-level links: ${binder.equityChangesBundle.lineLinks.length}</p>`);
  }
  parts.push('<h2>Justifications</h2>');
  parts.push(`<p>Count: ${binder.justifications.length}</p>`);
  for (const j of binder.justifications.slice(0, 10)) {
    const irac = j.response?.irac;
    const issue = irac?.issue ?? j.question ?? 'Justification';
    const rule = irac?.rule ?? '';
    const analysis = irac?.analysis ?? '';
    const conclusion = irac?.conclusion ?? '';
    const citation = j.response?.sourceTag ?? '';
    parts.push(`<div class="justification"><h3>${issue}</h3><p><strong>Issue:</strong> ${issue}</p><p><strong>Rule:</strong> ${rule}</p><p><strong>Analysis:</strong> ${analysis}</p><p><strong>Conclusion:</strong> ${conclusion}</p><p><strong>Citation:</strong> ${citation}</p></div>`);
  }
  if (binder.justifications.length > 10) {
    parts.push(`<p>... and ${binder.justifications.length - 10} more justifications.</p>`);
  }

  if (binder.chainVerification) {
    parts.push('<h2>Audit Ledger Chain Verification (Appendix)</h2>');
    parts.push('<p>Third parties can verify audit ledger integrity using the following artifact.</p>');
    parts.push('<table border="1" cellpadding="4" style="border-collapse: collapse;">');
    parts.push(`<tr><td><strong>Valid</strong></td><td>${binder.chainVerification.valid}</td></tr>`);
    parts.push(`<tr><td><strong>Entry count</strong></td><td>${binder.chainVerification.entryCount}</td></tr>`);
    parts.push(`<tr><td><strong>Verified at (ISO)</strong></td><td>${binder.chainVerification.verifiedAt}</td></tr>`);
    if (binder.chainVerification.latestEntryHash) {
      parts.push(`<tr><td><strong>Latest entry hash</strong></td><td><code>${binder.chainVerification.latestEntryHash}</code></td></tr>`);
    }
    if (binder.chainVerification.latestEntryId) {
      parts.push(`<tr><td><strong>Latest entry id</strong></td><td>${binder.chainVerification.latestEntryId}</td></tr>`);
    }
    if (binder.chainVerification.brokenAtEntryId) {
      parts.push(`<tr><td><strong>Broken at entry id</strong></td><td>${binder.chainVerification.brokenAtEntryId}</td></tr>`);
    }
    if (binder.chainVerification.message) {
      parts.push(`<tr><td><strong>Message</strong></td><td>${binder.chainVerification.message}</td></tr>`);
    }
    parts.push('</table>');
  }

  return parts.join('\n');
}

/**
 * Export audit binder to PDF buffer (certified only; no watermark).
 */
export async function exportAuditBinderToPdf(binder: AuditBinder): Promise<Buffer> {
  const html = binderToHtml(binder);
  return createPdfFromHtml(html);
}

/**
 * Export draft package to PDF (explicitly NOT the Audit Binder). Same content shape as binder but with
 * DRAFT — NOT CERTIFIED watermark and disclaimer on every page. Use for pre-certification review only.
 */
export async function exportDraftPackageToPdf(binder: AuditBinder): Promise<Buffer> {
  const html = binderToHtml(binder);
  return createPdfFromHtml(html, {
    draft: true,
    workflowState: 'draft',
    generatedAt: binder.generatedAt ?? new Date().toISOString(),
  });
}

/**
 * Flatten binder line links to CSV rows: statementType, label, amount, sourceDocumentUrl, reasoningMonologueUrl.
 */
function binderToCsvRows(binder: AuditBinder): string[][] {
  const headers = ['statementType', 'label', 'amount', 'lineId', 'sourceDocumentUrl', 'sourceDocumentName', 'reasoningMonologueUrl'];
  const rows: string[][] = [headers];

  const pushLinks = (statementType: string, links: (LineAuditLink | CashFlowOrEquityLineLink)[]) => {
    for (const l of links) {
      rows.push([
        statementType,
        l.label,
        String(l.amount),
        (l as LineAuditLink).lineId ?? '',
        l.sourceDocumentUrl ?? '',
        (l as LineAuditLink).sourceDocumentName ?? '',
        l.reasoningMonologueUrl ?? '',
      ]);
    }
  };

  if (binder.balanceSheetBundle) pushLinks('balance_sheet', binder.balanceSheetBundle.lineLinks);
  if (binder.profitAndLossBundle) pushLinks('profit_and_loss', binder.profitAndLossBundle.lineLinks);
  if (binder.cashFlowBundle) pushLinks('cash_flow', binder.cashFlowBundle.lineLinks);
  if (binder.equityChangesBundle) pushLinks('equity_changes', binder.equityChangesBundle.lineLinks);

  if (binder.cleanLedger?.length) {
    rows.push([]);
    rows.push(['line_id', 'account_code', 'account_name', 'debit', 'credit', 'account_type', 'amount_provenance']);
    for (const r of binder.cleanLedger) {
      const prov = r.amount_provenance != null ? JSON.stringify(r.amount_provenance) : '';
      rows.push([
        r.line_id ?? '',
        r.account_code ?? '',
        r.account_name ?? '',
        String(r.debit ?? 0),
        String(r.credit ?? 0),
        r.account_type ?? '',
        prov,
      ]);
    }
  }
  return rows;
}

/**
 * Export audit binder to CSV buffer (UTF-8). Escapes quotes in cells.
 */
export function exportAuditBinderToCsv(binder: AuditBinder): Buffer {
  const rows = binderToCsvRows(binder);
  const escape = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = rows.map((row) => row.map(escape).join(',')).join('\n');
  return Buffer.from(csv, 'utf-8');
}
