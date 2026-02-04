/**
 * @deprecated Python Math Bridge removed. Use TypeScript services instead:
 * - Trial balance → statements: buildFinancialStatements tool (financialStatements.buildValidatedStatements)
 * - No HTTP calls to Python backend.
 */

export interface TrialBalanceLinePayload {
  accountName: string;
  debit: number;
  credit: number;
  accountCode?: string;
}

export interface TrialBalancePayload {
  entries: TrialBalanceLinePayload[];
  as_of?: string;
}

export interface PythonTrialBalanceResponse {
  as_of: string;
  trial_balance: { lines: unknown[]; total_debits: string; total_credits: string; balances: boolean };
  balance_sheet: unknown;
  validation: { balances: boolean; message: string };
}

const DEPRECATED_MSG =
  'Python bridge removed. Use buildFinancialStatements tool or financialStatements.buildValidatedStatements.';

export async function postTrialBalanceToPython(_payload: TrialBalancePayload): Promise<PythonTrialBalanceResponse> {
  throw new Error(DEPRECATED_MSG);
}

export async function callPythonMathWorker<T = unknown>(_path: string, _body: Record<string, unknown>): Promise<T> {
  throw new Error(DEPRECATED_MSG);
}
