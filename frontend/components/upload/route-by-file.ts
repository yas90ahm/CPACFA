/**
 * Supervisor Agent: infer CPA (statements/trial balance) vs CFA (spreadsheet) from file.
 * Uses file extension and, for CSV, first-line headers to route autonomously.
 */
export type AgentRoute = 'cpa' | 'cfa';

const TRIAL_BALANCE_HEADERS = [
  'account',
  'debit',
  'credit',
  'description',
  'code',
  'gl',
  'ledger',
  'balance',
];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Returns true if the first line looks like trial balance / ledger headers (CPA). */
function looksLikeTrialBalanceHeaders(firstLine: string): boolean {
  const cells = firstLine.split(/[\t,;]/).map(normalizeHeader);
  const hasAccount = cells.some((c) => c.includes('account') || c === 'account name' || c === 'account code');
  const hasDebitOrCredit =
    cells.some((c) => c === 'debit' || c.includes('debit')) ||
    cells.some((c) => c === 'credit' || c.includes('credit'));
  const hasAnyLedger = cells.some((c) =>
    TRIAL_BALANCE_HEADERS.some((h) => c.includes(h) || h.includes(c))
  );
  return (hasAccount && hasDebitOrCredit) || (hasAnyLedger && cells.length >= 3);
}

/**
 * Supervisor Agent: decide route from file extension and (for CSV) file headers.
 * PDF → CPA (statements). CSV/XLSX: trial-balance headers → CPA, else CFA.
 */
export async function inferRouteFromFile(file: File): Promise<AgentRoute> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();

  if (ext === 'pdf') return 'cpa';

  if (ext === 'csv') {
    try {
      const text = await file.slice(0, 2048).text();
      const firstLine = text.split(/\r?\n/)[0] ?? '';
      if (firstLine.trim()) return looksLikeTrialBalanceHeaders(firstLine) ? 'cpa' : 'cfa';
    } catch {
      // fallback to extension
    }
    return 'cfa';
  }

  if (ext === 'xlsx' || ext === 'xls') {
    // XLSX: could read first row via a lightweight parser; for now default to CFA (spreadsheet)
    return 'cfa';
  }

  return 'cfa';
}
