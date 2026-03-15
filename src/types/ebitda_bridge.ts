/**
 * EBITDA bridge types: addbacks and bridge computation result.
 */

export interface EbitdaAddback {
  id: string;
  tenantId: string;
  entityId: string;
  periodLabel: string;
  closeSessionId: string;
  label: string;
  amount: string;
  category: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EbitdaBridgeLine {
  label: string;
  amount: number;
  type: 'income' | 'add_interest' | 'add_tax' | 'add_da' | 'addback' | 'ebitda';
}

export interface EbitdaBridgeResult {
  netIncome: number;
  interestExpense: number;
  taxExpense: number;
  depreciationAmortization: number;
  ebitdaBeforeAddbacks: number;
  addbacks: Array<{ label: string; amount: number; category: string }>;
  totalAddbacks: number;
  adjustedEbitda: number;
  lines: EbitdaBridgeLine[];
}
