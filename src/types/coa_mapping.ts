/**
 * COA Mapping Rules and FS Line Taxonomy for statement-line mapping.
 */

export type StatementType = 'PL' | 'BS' | 'CF' | 'OCI';
export type CashFlowClass = 'operating' | 'investing' | 'financing' | 'not_applicable';
export type NormalBalance = 'debit' | 'credit';

export interface FsTaxonomyLine {
  id: string;
  code: string;
  name: string;
  statement: StatementType;
  parentId?: string;
  normalBalance: NormalBalance;
  isSubtotal?: boolean;
  isContra?: boolean;
  isHidden?: boolean;
  displayOrder?: number;
  xbrlElement?: string;
  xbrlLabel?: string;
  createdAt?: string;
}

export interface CoaMappingRule {
  id: string;
  tenantId: string;
  entityId: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string;
  version: number;
  sourceAccountNamePattern: string;
  sourceAccountNumberPattern?: string;
  mappedFsLineId: string;
  confidenceDefault: number;
  cashFlowClass?: CashFlowClass | null;
  /** PE reporting hierarchy line this account maps to (GAP I1). */
  peLineId?: string;
  createdAt: string;
}

export interface CoaMappingResult {
  fsLineId: string;
  fsLineCode?: string;
  explanation: string;
  ruleVersion?: number;
  confidence: number;
}

export interface AccountForMapping {
  accountName: string;
  accountNumber?: string;
}

export interface UpsertCoaRuleInput {
  sourceAccountNamePattern: string;
  sourceAccountNumberPattern?: string;
  mappedFsLineId: string;
  confidenceDefault?: number;
  effectiveFrom: string;
  effectiveTo?: string;
}
