/**
 * PE Reporting Hierarchy — custom line-item groupings for PE-backed companies.
 * Allows controllers to define their own P&L / BS presentation lines
 * and map COA accounts to them via pe_line_id on coa_mapping_rules.
 */

export interface PEHierarchyLine {
  id: string;
  tenantId: string;
  peLineId: string;
  peLineName: string;
  parentPeLineId?: string;
  displayOrder: number;
  statement: string; // 'PL' | 'BS'
  createdAt: string;
}

export interface UpsertPEHierarchyLineInput {
  peLineId: string;
  peLineName: string;
  parentPeLineId?: string | null;
  displayOrder?: number;
  statement?: string;
}

export interface PEStatementLine {
  peLineId: string;
  peLineName: string;
  parentPeLineId?: string;
  displayOrder: number;
  amount: number;
  children?: PEStatementLine[];
}

export interface PEStatementResult {
  statement: string;
  periodLabel: string;
  lines: PEStatementLine[];
  totalAmount: number;
}
