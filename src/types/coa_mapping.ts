/**
 * COA Mapping Rules and FS Line Taxonomy for statement-line mapping.
 */

export type StatementType = 'PL' | 'BS' | 'CF';
export type NormalBalance = 'debit' | 'credit';

export interface FsTaxonomyLine {
  id: string;
  code: string;
  name: string;
  statement: StatementType;
  parentId?: string;
  normalBalance: NormalBalance;
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
