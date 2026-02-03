/**
 * Python Math Worker Bridge — Node (orchestrator) calls Python (math brain) over REST.
 * Sends trial balance (or GL payload) to Flask at localhost:5000; returns structured JSON.
 * Auth and session are Node's responsibility; this is a stateless worker call.
 *
 * Rules parity: Node uses RulesRegistry (getRoundingTolerance) in IntegrityGate and financialStatements.
 * Python workers should read the same config via RULES_CONFIG_PATH or getConfigPath() from rules_registry
 * so validation (e.g. trial balance balance check) uses the same tolerance.
 */

const PYTHON_MATH_BASE = process.env.PYTHON_MATH_BASE ?? 'http://localhost:5000';

export interface TrialBalanceLinePayload {
  accountName: string;
  debit: number;
  credit: number;
  accountCode?: string;
}

/** Payload Node sends: trial balance lines + optional as_of. */
export interface TrialBalancePayload {
  entries: TrialBalanceLinePayload[];
  as_of?: string; // YYYY-MM-DD
}

/** COA entry for Python (code, name, account_type). */
interface CoaEntry {
  code: string;
  name: string;
  account_type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
}

/** GL entry for Python (double-entry). */
interface GLEntryPayload {
  date: string;
  description: string;
  debit_account: string;
  credit_account: string;
  amount: string;
}

/** Response from Python /api/math/trial-balance. */
export interface PythonTrialBalanceResponse {
  as_of: string;
  trial_balance: {
    lines: Array<{
      account_code: string;
      account_name: string;
      debit: string;
      credit: string;
      account_type: string;
    }>;
    total_debits: string;
    total_credits: string;
    balances: boolean;
  };
  balance_sheet: {
    report_date: string;
    assets: Array<{ label: string; amount: string; account_code?: string }>;
    liabilities: Array<{ label: string; amount: string; account_code?: string }>;
    equity: Array<{ label: string; amount: string; account_code?: string }>;
    total_assets: string;
    total_liabilities: string;
    total_equity: string;
    codification_ref: Record<string, string> | null;
  };
  validation: {
    balances: boolean;
    message: string;
  };
}

const SUSPENSE_CODE = '__TB_SUSPENSE__';

/**
 * Convert trial balance lines to COA + GL entries for Python.
 * Each TB line: debit > 0 => debit account / credit SUSPENSE; credit > 0 => debit SUSPENSE / credit account.
 */
function trialBalanceToCoaAndEntries(
  payload: TrialBalancePayload
): { coa: CoaEntry[]; entries: GLEntryPayload[]; as_of: string } {
  const as_of = payload.as_of ?? new Date().toISOString().slice(0, 10);
  const coaMap = new Map<string, CoaEntry>();
  coaMap.set(SUSPENSE_CODE, { code: SUSPENSE_CODE, name: 'Trial Balance Suspense', account_type: 'ASSET' });

  const entries: GLEntryPayload[] = [];

  for (const line of payload.entries) {
    const code = line.accountCode ?? line.accountName ?? '';
    const name = line.accountName ?? code;
    if (!coaMap.has(code)) {
      coaMap.set(code, { code, name, account_type: 'ASSET' });
    }
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    if (debit > 0) {
      entries.push({
        date: as_of,
        description: `TB ${name}`,
        debit_account: code,
        credit_account: SUSPENSE_CODE,
        amount: String(debit),
      });
    }
    if (credit > 0) {
      entries.push({
        date: as_of,
        description: `TB ${name}`,
        debit_account: SUSPENSE_CODE,
        credit_account: code,
        amount: String(credit),
      });
    }
  }

  return {
    coa: Array.from(coaMap.values()),
    entries,
    as_of,
  };
}

/**
 * POST trial balance to Python Math Worker. Converts TB to COA + GL, sends to /api/math/trial-balance, returns response.
 */
export async function postTrialBalanceToPython(
  payload: TrialBalancePayload
): Promise<PythonTrialBalanceResponse> {
  const { coa, entries, as_of } = trialBalanceToCoaAndEntries(payload);
  const url = `${PYTHON_MATH_BASE}/api/math/trial-balance`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coa, entries, as_of }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Python Math Worker error (${res.status}): ${text}`);
  }
  return res.json() as Promise<PythonTrialBalanceResponse>;
}

/**
 * Call any Python math endpoint with a JSON body. Generic bridge for /api/math/*.
 */
export async function callPythonMathWorker<T = unknown>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const url = `${PYTHON_MATH_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Python Math Worker error (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}
