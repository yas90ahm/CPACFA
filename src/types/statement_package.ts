/**
 * Versioned statement packages: version, input hash, outputs, diff vs previous.
 * Deterministic generation: same approved data => same output; classifier/mapping versions stored.
 */

export type StatementPackageStatus = 'draft' | 'final';

export interface StatementPackage {
  id: string;
  closeSessionId: string;
  version: number;
  inputHash: string;
  generatedAt: string;
  generatedBy?: string;
  status: StatementPackageStatus;
  engineVersion?: string;
  ruleVersionsSnapshot?: Record<string, unknown>;
  /** Cross-statement validation (net income tie, cash tie, RE tie). */
  validationResults?: ValidationResult[];
}

export interface ValidationResult {
  check: string;
  passed: boolean;
  message?: string;
}

export type StatementType = 'balance_sheet' | 'profit_and_loss' | 'cash_flow' | 'equity';

export interface StatementLine {
  packageId: string;
  fsLineId: string;
  amount: number;
  statement: StatementType;
  metadata?: Record<string, unknown>;
}

export interface StatementDiffRecord {
  fromPackageId: string;
  toPackageId: string;
  diffJson: StatementDiffJson;
  createdAt: string;
}

export interface StatementDiffJson {
  added: { fsLineId: string; amount: number; statement: string; metadata?: Record<string, unknown> }[];
  removed: { fsLineId: string; amount: number; statement: string; metadata?: Record<string, unknown> }[];
  changed: { fsLineId: string; prevAmount: number; nextAmount: number; statement: string; metadata?: Record<string, unknown> }[];
}
