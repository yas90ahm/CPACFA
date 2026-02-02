/**
 * Reconciliation todos: shared DTO for service and repository.
 */

export type ReconciliationTodoStatus = 'open' | 'done';

export interface ReconciliationTodo {
  id: string;
  /** Link to source gap when created from gap list */
  gapId: string;
  title: string;
  /** Concrete action (e.g. "Add Loan Payable account and reclassify $X") */
  action: string;
  status: ReconciliationTodoStatus;
  urgency: 'high' | 'medium';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
