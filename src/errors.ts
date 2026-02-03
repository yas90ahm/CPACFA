/**
 * Dedicated errors for audit/supervisor paths. Handled by handleAuditOrIntegrityError
 * to return proper HTTP status (e.g. 500 for persistence failures).
 */

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
