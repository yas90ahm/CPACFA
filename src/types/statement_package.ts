/**
 * Versioned statement packages: version, input hash, outputs, diff vs previous.
 * Deterministic generation: same approved data => same output; classifier/mapping versions stored.
 */

export type StatementPackageStatus = 'draft' | 'final';
export type StatementPackageType = 'standard' | 'cumulative';
export type CumulativePeriod = 'QTD' | 'YTD';

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
  /** 'standard' for monthly, 'cumulative' for QTD/YTD. */
  packageType?: StatementPackageType;
  /** 'QTD' or 'YTD' when packageType is 'cumulative'. */
  cumulativePeriod?: CumulativePeriod;
  /** Note describing derivation (e.g. "Derived from certified monthly periods: Jan, Feb, Mar 2026"). */
  cumulativeNote?: string;
  /** IDs of the close sessions included in this cumulative package. */
  includedSessionIds?: string[];
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
  /** Display order for frontend rendering. */
  displayOrder?: number;
  /** Indent level: 0=section, 1=detail. */
  indentLevel?: number;
  /** True for subtotal rows (e.g. Total Revenue). */
  isSubtotal?: boolean;
  /** True for grand total rows (e.g. Net Income, Total Assets). */
  isGrandTotal?: boolean;
  /** Section name for grouping (e.g. "Revenue", "Current Assets"). */
  sectionName?: string | null;
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
