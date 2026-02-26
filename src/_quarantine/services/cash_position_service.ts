/**
 * Cash positioning: today's cash by account/entity vs short-term forecast.
 */

export interface CashPositionAccount {
  accountId: string;
  accountName?: string;
  entityId?: string;
  actualBalance: number;
  asOfDate: string; // ISO
}

export interface CashPositionInput {
  /** Actual balances by account (e.g. from GL or bank) */
  accounts: CashPositionAccount[];
  /** Optional: forecast next 7/30 days (e.g. from 13-week or manual) */
  forecastNext7Days?: number;
  forecastNext30Days?: number;
}

export interface CashPositionResult {
  totalActual: number;
  byAccount: { accountId: string; accountName?: string; entityId?: string; balance: number }[];
  forecastNext7Days?: number;
  forecastNext30Days?: number;
  asOfDate: string;
}

export function buildCashPosition(input: CashPositionInput): CashPositionResult {
  const { accounts, forecastNext7Days, forecastNext30Days } = input;
  const totalActual = accounts.reduce((a, c) => a + c.actualBalance, 0);
  const asOfDate = accounts.length > 0 ? accounts[0].asOfDate : new Date().toISOString().slice(0, 10);
  return {
    totalActual,
    byAccount: accounts.map((a) => ({
      accountId: a.accountId,
      accountName: a.accountName,
      entityId: a.entityId,
      balance: a.actualBalance,
    })),
    forecastNext7Days,
    forecastNext30Days,
    asOfDate,
  };
}
