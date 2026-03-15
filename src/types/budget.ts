/**
 * Budget data ingestion types: period budgets and budget-to-actual variance.
 */

export interface BudgetEntry {
  id: string;
  tenantId: string;
  entityId: string;
  periodLabel: string;
  accountCode: string;
  accountName?: string;
  budgetAmount: string;
  createdAt: string;
  updatedAt: string;
  uploadedBy?: string;
}

export interface BudgetVarianceItem {
  accountCode: string;
  accountName?: string;
  budgetAmount: number;
  actualAmount: number;
  varianceAmount: number;
  variancePercent: number | null;
}
