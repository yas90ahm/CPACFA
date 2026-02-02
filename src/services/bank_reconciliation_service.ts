/**
 * Bank reconciliation: statement lines vs GL cash entries, match/unmatch, reconciled balance.
 */

export interface BankStatementLine {
  id: string;
  date: string; // ISO
  description: string;
  amount: number; // positive = credit/deposit, negative = debit/withdrawal
  runningBalance?: number;
}

export interface GLCashEntry {
  id: string;
  date: string;
  description: string;
  amount: number; // debit positive, credit negative for cash
}

export interface BankRecInput {
  statementLines: BankStatementLine[];
  glCashEntries: GLCashEntry[];
  openingBalanceStatement: number;
  openingBalanceGL: number;
}

export interface MatchedPair {
  statementLineId: string;
  glEntryId: string;
  confidence?: number; // 1.0 exact, lower for tolerance/window
}

export interface BankRecResult {
  matched: MatchedPair[];
  unmatchedStatement: BankStatementLine[];
  unmatchedGL: GLCashEntry[];
  closingBalanceStatement: number;
  closingBalanceGL: number;
  difference: number; // statement - GL (0 when reconciled)
  reconciled: boolean;
}

export interface BankRecOptions {
  /** Amount tolerance (e.g. 0.01) for matching */
  matchTolerance?: number;
  /** Date window in days (e.g. 7 for ±7 days) */
  matchByDateWindow?: number;
  /** Prior matches to prefer same pairing for same amount in nearby period */
  previousMatches?: MatchedPair[];
}

/**
 * Match by amount (with optional tolerance) and date (same month or optional ±days window).
 * Returns confidence per match (1.0 exact, lower for tolerance/window).
 */
export function runBankReconciliation(
  input: BankRecInput,
  options: BankRecOptions = {}
): BankRecResult {
  const { statementLines, glCashEntries, openingBalanceStatement, openingBalanceGL } = input;
  const matchTolerance = options.matchTolerance ?? 0.01;
  const dateWindowDays = options.matchByDateWindow ?? 0;
  const previousMatches = options.previousMatches ?? [];
  const matched: MatchedPair[] = [];
  const usedGL = new Set<string>();

  const parseDate = (d: string) => new Date(d).getTime();
  const withinWindow = (d1: string, d2: string) =>
    dateWindowDays <= 0
      ? d1.slice(0, 7) === d2.slice(0, 7)
      : Math.abs(parseDate(d1) - parseDate(d2)) / (1000 * 60 * 60 * 24) <= dateWindowDays;
  const amountMatch = (a: number, b: number) => Math.abs(a - b) <= matchTolerance;
  const confidence = (exactAmount: boolean, exactDate: boolean) => {
    if (exactAmount && exactDate) return 1.0;
    if (exactAmount) return 0.9;
    if (exactDate) return 0.85;
    return Math.max(0.5, 0.9 - (matchTolerance > 0 ? 0.1 : 0) - (dateWindowDays > 0 ? 0.05 : 0));
  };

  for (const st of statementLines) {
    const amt = st.amount;
    const stDate = st.date;
    const prevPair = previousMatches.find((p) => p.statementLineId === st.id);
    const candidate =
      (prevPair && glCashEntries.find((g) => g.id === prevPair.glEntryId && !usedGL.has(g.id))
        ? glCashEntries.find((g) => g.id === prevPair.glEntryId && !usedGL.has(g.id))
        : null) ??
      glCashEntries.find(
        (g) =>
          !usedGL.has(g.id) &&
          amountMatch(g.amount, amt) &&
          withinWindow(g.date, stDate)
      );
    if (candidate) {
      const exactAmount = Math.abs(candidate.amount - amt) < 0.01;
      const exactDate = stDate.slice(0, 7) === candidate.date.slice(0, 7);
      matched.push({
        statementLineId: st.id,
        glEntryId: candidate.id,
        confidence: confidence(exactAmount, exactDate),
      });
      usedGL.add(candidate.id);
    }
  }

  const unmatchedStatement = statementLines.filter(
    (s) => !matched.some((m) => m.statementLineId === s.id)
  );
  const unmatchedGL = glCashEntries.filter((g) => !usedGL.has(g.id));

  const sumStatement = statementLines.reduce((a, s) => a + s.amount, 0);
  const sumGL = glCashEntries.reduce((a, g) => a + g.amount, 0);
  const closingBalanceStatement = openingBalanceStatement + sumStatement;
  const closingBalanceGL = openingBalanceGL + sumGL;
  const difference = closingBalanceStatement - closingBalanceGL;
  const reconciled = Math.abs(difference) < 0.01;

  return {
    matched,
    unmatchedStatement,
    unmatchedGL,
    closingBalanceStatement,
    closingBalanceGL,
    difference,
    reconciled,
  };
}
