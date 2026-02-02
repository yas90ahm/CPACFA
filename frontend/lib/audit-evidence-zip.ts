/**
 * Build and download the Audit Evidence Package as a zip file.
 * Contents: PDF statements (or text summary), AI logic logs, Python source code used for math.
 */

import JSZip from 'jszip';
import { getBlackBoxLogs } from './api';

export interface AuditEvidenceInputs {
  /** Entity name and period for filename */
  entityName?: string;
  periodStart?: string;
  periodEnd?: string;
  /** Statement text (e.g. Balance Sheet + P&L as plain text) */
  statementsText?: string;
  /** Optional: date range for black-box logs */
  logsDateFrom?: string;
  logsDateTo?: string;
}

function escapeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80);
}

export async function buildAndDownloadAuditEvidencePackage(inputs: AuditEvidenceInputs): Promise<void> {
  const zip = new JSZip();
  const { entityName, periodStart, periodEnd, statementsText, logsDateFrom, logsDateTo } = inputs;

  // 1) Statements — PDF would require server-side generation; we use text summary
  const statementsContent =
    statementsText ||
    `Audit Evidence Package — Financial Statements\n` +
      `Entity: ${entityName ?? 'Entity'}\n` +
      `Period: ${periodStart ?? '—'} to ${periodEnd ?? '—'}\n` +
      `Generated: ${new Date().toISOString()}\n\n` +
      `(Upload a trial balance and generate statements to include full line items and citations here.)\n`;
  zip.file('statements.txt', statementsContent);

  // 2) AI logic logs (prompt, thought_process, python_execution, final_response)
  let logicLogsContent = '';
  try {
    const logsRes = await getBlackBoxLogs({
      date_from: logsDateFrom,
      date_to: logsDateTo,
      limit: 500,
    });
    const lines = (logsRes.logs || []).map(
      (l: { timestamp?: string; entry_type?: string; payload?: string; user_id?: string }) =>
        `[${l.timestamp ?? ''}] ${l.entry_type ?? ''} ${l.user_id ?? ''}\n${typeof l.payload === 'string' ? l.payload.slice(0, 2000) : JSON.stringify(l.payload).slice(0, 2000)}`
    );
    logicLogsContent = lines.length
      ? lines.join('\n\n---\n\n')
      : '(No black-box logs available. Set NEXT_PUBLIC_PYTHON_URL to the Python backend to include AI logic logs.)';
  } catch {
    logicLogsContent =
      '(Black-box logs could not be fetched. Ensure NEXT_PUBLIC_PYTHON_URL points to the Python backend and /api/audit/black-box/logs is available.)';
  }
  zip.file('ai_logic_logs.txt', logicLogsContent);

  // 3) Python source code (from black-box python_execution entries)
  let pythonSourceContent = '';
  try {
    const logsRes = await getBlackBoxLogs({
      date_from: logsDateFrom,
      date_to: logsDateTo,
      entry_type: 'python_execution',
      limit: 200,
    });
    const codeBlocks = (logsRes.logs || [])
      .map((l: { timestamp?: string; payload?: string | { code?: string } }) => {
        const p = l.payload;
        const code =
          typeof p === 'object' && p && 'code' in p
            ? (p as { code?: string }).code
            : typeof p === 'string'
              ? p
              : JSON.stringify(p);
        return `# --- ${l.timestamp ?? ''} ---\n${code}`;
      })
      .filter(Boolean);
    pythonSourceContent = codeBlocks.length
      ? codeBlocks.join('\n\n')
      : '# No Python execution entries in the selected period.';
  } catch {
    pythonSourceContent =
      '# Python source could not be fetched. Set NEXT_PUBLIC_PYTHON_URL to include quantitative engine code.';
  }
  zip.file('python_source_used_for_math.txt', pythonSourceContent);

  const filename =
    `audit_evidence_${escapeFilename(entityName ?? 'Entity')}_${periodStart ?? 'period'}_${periodEnd ?? ''}.zip`.replace(
      /__+/g,
      '_'
    );
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
