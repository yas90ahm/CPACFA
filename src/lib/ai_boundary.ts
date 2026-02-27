/**
 * AI Boundary — Runtime guard to prevent AI from mutating deterministic financial state.
 *
 * Any attempt for the AI layer to invoke mutation code will throw, in ALL environments.
 * Mutation paths (executeBridgeCommand, certifyCloseSession) assert they are not
 * being called from within an AI advisory context.
 *
 * Uses AsyncLocalStorage so the counter is per async-execution-chain (per-request),
 * not global. This prevents false positives when Request A is doing AI work while
 * Request B performs a legitimate mutation.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

interface AdvisoryStore {
  depth: number;
}

const advisoryALS = new AsyncLocalStorage<AdvisoryStore>();

/** Get the current store, or null if we are outside any tracked async chain. */
function getStore(): AdvisoryStore | undefined {
  return advisoryALS.getStore();
}

/**
 * Enter advisory context. Call at the start of any AI invocation.
 * Must be paired with exitAdvisoryContext in a try/finally.
 */
export function enterAdvisoryContext(): void {
  const store = getStore();
  if (store) {
    store.depth += 1;
  }
  // If no store exists (e.g. background job not wrapped in runInBoundaryScope),
  // fall through silently — the assert check also handles the no-store case.
}

/**
 * Exit advisory context. Call in finally block after AI invocation.
 */
export function exitAdvisoryContext(): void {
  const store = getStore();
  if (store && store.depth > 0) {
    store.depth -= 1;
  }
}

/**
 * Assert that we are not inside an AI advisory context.
 * Call at the start of mutation paths: executeBridgeCommand, certifyCloseSession.
 * Throws if called from within AI code (e.g. AI callback invoking bridge).
 * Enforced in ALL environments — AI should never write to financial tables.
 */
export function assertNoAiMutationContext(): void {
  const store = getStore();
  if (store && store.depth > 0) {
    throw new Error(
      '[AI_BOUNDARY] Mutation path cannot be invoked from AI context. AI is advisory-only and must not mutate ledger, snapshot, or certification.'
    );
  }
}

/**
 * Run a callback within a fresh AI boundary scope.
 * Each HTTP request should be wrapped in this so that enter/exit advisory context
 * is tracked per-request, not globally.
 */
export function runInBoundaryScope<T>(fn: () => T): T {
  return advisoryALS.run({ depth: 0 }, fn);
}

/** Reset for tests. */
export function resetAiBoundaryForTests(): void {
  // With AsyncLocalStorage, no global state to reset.
  // Provided for backward compatibility with existing test imports.
}
