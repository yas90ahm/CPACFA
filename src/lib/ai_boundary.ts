/**
 * AI Boundary — Runtime guard to prevent AI from mutating deterministic financial state.
 *
 * Any attempt for the AI layer to invoke mutation code will throw, in ALL environments.
 * Mutation paths (executeBridgeCommand, certifyCloseSession) assert they are not
 * being called from within an AI advisory context.
 */

/** Set when inside an AI advisory call (callAIWithSchema, generateText, etc.). */
let _inAdvisoryContext = 0;

/**
 * Enter advisory context. Call at the start of any AI invocation.
 * Must be paired with exitAdvisoryContext in a try/finally.
 */
export function enterAdvisoryContext(): void {
  _inAdvisoryContext += 1;
}

/**
 * Exit advisory context. Call in finally block after AI invocation.
 */
export function exitAdvisoryContext(): void {
  if (_inAdvisoryContext > 0) _inAdvisoryContext -= 1;
}

/**
 * Assert that we are not inside an AI advisory context.
 * Call at the start of mutation paths: executeBridgeCommand, certifyCloseSession.
 * Throws if called from within AI code (e.g. AI callback invoking bridge).
 * Enforced in ALL environments — AI should never write to financial tables.
 */
export function assertNoAiMutationContext(): void {
  if (_inAdvisoryContext > 0) {
    throw new Error(
      '[AI_BOUNDARY] Mutation path cannot be invoked from AI context. AI is advisory-only and must not mutate ledger, snapshot, or certification.'
    );
  }
}

/** Reset for tests. */
export function resetAiBoundaryForTests(): void {
  _inAdvisoryContext = 0;
}
