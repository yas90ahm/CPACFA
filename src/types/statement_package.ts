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
}

export interface StatementLine {
  packageId: string;
  fsLineId: string;
  amount: number;
  statement: 'balance_sheet' | 'profit_and_loss';
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
