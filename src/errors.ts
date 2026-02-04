/**
 * Dedicated errors for audit/supervisor paths. Handled by handleAuditOrIntegrityError
 * to return proper HTTP status (e.g. 422 for integrity, 500 for persistence failures).
 */

/** Thrown when trial balance or balance sheet equation fails (Kill Switch). API must return 422 with imbalanceAmount. */
export class MathematicalIntegrityError extends Error {
  readonly check: 'A' | 'B';
  readonly imbalanceAmount: number;
  readonly details?: { totalDebits?: number; totalCredits?: number; totalAssets?: number; totalLiabilities?: number; totalEquity?: number };

  constructor(check: 'A' | 'B', imbalanceAmount: number, details?: MathematicalIntegrityError['details']) {
    const msg =
      check === 'A'
        ? `Trial balance does not balance: Sum(Debits) != Sum(Credits). Imbalance: ${imbalanceAmount}. Data is illegal for a CPA.`
        : `Balance sheet equation violated: Total Assets != Total Liabilities + Total Equity. Imbalance: ${imbalanceAmount}. Data is illegal for a CPA.`;
    super(msg);
    this.name = 'MathematicalIntegrityError';
    this.check = check;
    this.imbalanceAmount = imbalanceAmount;
    this.details = details;
    Object.setPrototypeOf(this, MathematicalIntegrityError.prototype);
  }
}

/** Thrown when reasoning log, observation, or session update persistence fails. No silent green. */
export class SessionPersistenceError extends Error {
  readonly operation: 'reasoning_log' | 'observation' | 'message_history';
  readonly cause?: unknown;

  constructor(operation: SessionPersistenceError['operation'], message: string, cause?: unknown) {
    super(message);
    this.name = 'SessionPersistenceError';
    this.operation = operation;
    this.cause = cause;
    Object.setPrototypeOf(this, SessionPersistenceError.prototype);
  }
}
