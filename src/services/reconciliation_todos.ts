/**
 * Stage 3 — Gap → actionable to-dos with status (open/done).
 * When pool and tenantId are provided, uses tenant DB; in production no in-memory fallback.
 */

import type { Pool } from 'pg';
import { disallowMemoryStoreInProduction } from '../lib/env.js';
import type { DataGap } from '../agents/cpa_brain.js';
import * as reconciliationTodoRepo from '../db/repositories/reconciliation_todo_repository.js';
import type { ReconciliationTodo, ReconciliationTodoStatus } from '../types/reconciliation_todos.js';

export type { ReconciliationTodo, ReconciliationTodoStatus } from '../types/reconciliation_todos.js';

const todoStore = new Map<string, ReconciliationTodo>();
let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `todo-${Date.now()}-${idCounter}`;
}

/**
 * Turn a data gap into an actionable to-do. Suggestion becomes action when present.
 */
function gapToAction(gap: DataGap): string {
  if (gap.suggestion?.trim()) return gap.suggestion.trim();
  switch (gap.type) {
    case 'missing_liability':
      return 'Add a liability account (e.g. Loan Payable, Mortgage Payable) and reclassify principal/interest portions.';
    case 'missing_asset':
      return 'Consider capitalizing: add a fixed asset account and reclassify the one-time payment from expense.';
    case 'missing_identity':
      return 'Provide entity metadata: tax ID, business number, or jurisdiction so standard inference and filings are complete.';
    case 'missing_transactions':
      return 'Upload or link bank/transaction data so cash flow and reconciliation can be completed.';
    case 'agentic_anomaly':
      return 'Review the flagged anomaly and confirm classification or add adjustment.';
    default:
      return gap.description;
  }
}

/**
 * Add actionable to-dos from a list of data gaps. Idempotent by gapId: existing todos for same gapId are not duplicated.
 */
export async function addTodosFromGaps(
  gaps: DataGap[],
  pool?: Pool | null,
  tenantId?: string
): Promise<ReconciliationTodo[]> {
  if (pool && tenantId) {
    const existing = await reconciliationTodoRepo.existingGapIds(pool, tenantId);
    const added: ReconciliationTodo[] = [];
    for (const gap of gaps) {
      if (existing.has(gap.id)) continue;
      const id = `todo-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const todo: Omit<ReconciliationTodo, 'createdAt' | 'updatedAt'> = {
        id,
        gapId: gap.id,
        title: gap.title,
        action: gapToAction(gap),
        status: 'open',
        urgency: gap.urgency,
      };
      const created = await reconciliationTodoRepo.create(pool, tenantId, todo);
      existing.add(gap.id);
      added.push(created);
    }
    return added;
  }
  const existingGapIds = new Set(Array.from(todoStore.values()).map((t) => t.gapId));
  const now = new Date().toISOString();
  const added: ReconciliationTodo[] = [];

  for (const gap of gaps) {
    if (existingGapIds.has(gap.id)) continue;
    const id = nextId();
    const todo: ReconciliationTodo = {
      id,
      gapId: gap.id,
      title: gap.title,
      action: gapToAction(gap),
      status: 'open',
      urgency: gap.urgency,
      createdAt: now,
      updatedAt: now,
    };
    todoStore.set(id, todo);
    existingGapIds.add(gap.id);
    added.push({ ...todo });
  }

  return added;
}

/**
 * Get all reconciliation to-dos (optionally filter by status).
 */
export async function getReconciliationTodos(
  options?: { status?: ReconciliationTodoStatus; limit?: number },
  pool?: Pool | null,
  tenantId?: string
): Promise<ReconciliationTodo[]> {
  if (pool && tenantId) {
    return reconciliationTodoRepo.list(pool, tenantId, options);
  }
  let items = Array.from(todoStore.values());
  if (options?.status) items = items.filter((i) => i.status === options.status);
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const limit = options?.limit ?? 100;
  return items.slice(0, limit).map((i) => ({ ...i }));
}

/**
 * Mark a to-do as done (or reopen).
 */
export async function markTodoDone(
  id: string,
  status: ReconciliationTodoStatus,
  pool?: Pool | null,
  tenantId?: string
): Promise<ReconciliationTodo | null> {
  if (pool && tenantId) {
    return reconciliationTodoRepo.updateStatus(pool, id, tenantId, status);
  }
  disallowMemoryStoreInProduction({ storeName: 'reconciliation todos', hasDurableContext: false });
  const todo = todoStore.get(id);
  if (!todo) return null;
  const now = new Date().toISOString();
  todo.status = status;
  todo.updatedAt = now;
  todo.completedAt = status === 'done' ? now : undefined;
  return { ...todo };
}

/** Gap-with-resolution view: gapId + todo status (FW1) */
export interface GapWithResolution {
  gapId: string;
  todoId: string;
  title: string;
  action: string;
  status: ReconciliationTodoStatus;
  completedAt?: string;
  urgency: string;
}

/**
 * Get gaps with resolution status (todos represent gaps; status = resolved when done).
 */
export async function getGapsWithResolution(
  options?: { status?: ReconciliationTodoStatus; limit?: number },
  pool?: Pool | null,
  tenantId?: string
): Promise<GapWithResolution[]> {
  const todos = await getReconciliationTodos(options, pool, tenantId);
  return todos.map((t) => ({
    gapId: t.gapId,
    todoId: t.id,
    title: t.title,
    action: t.action,
    status: t.status,
    completedAt: t.completedAt,
    urgency: t.urgency,
  }));
}
