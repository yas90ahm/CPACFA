/**
 * Request context via AsyncLocalStorage so logger and services can read request_id without passing it.
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  request_id: string;
}

const asyncLocal = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | undefined {
  return asyncLocal.getStore()?.request_id;
}

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return asyncLocal.run({ request_id: requestId }, fn);
}

export { asyncLocal as requestContextStorage };
