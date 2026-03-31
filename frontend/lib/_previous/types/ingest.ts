export interface FieldMapping {
  fieldId: string;
  label: string;
  required: boolean;
  description?: string;
}

export interface GLParseResult {
  columns: string[];
  rows: Record<string, string>[];
  rowCount: number;
  accountCount: number;
  autoDetectedMappings: Record<string, string>;
}

export interface ValidationResult {
  passed: boolean;
  errors: { message: string; detail?: string; rows?: number[] }[];
  warnings: { message: string; detail?: string }[];
}

export interface TBPreviewRow {
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

export interface TBPreview {
  rows: TBPreviewRow[];
  totalDebits: string;
  totalCredits: string;
  balanced: boolean;
  accountCount: number;
  newAccounts: string[];
  inactiveAccounts: string[];
  priorMappedCount: number;
}
