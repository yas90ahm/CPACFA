/**
 * Types for subledger / bank statement source data ingestion and matching.
 */

export interface ReconSourceEntry {
  date: string;
  description: string;
  amount: number;
  reference?: string;
  lineNumber: number;
}

export interface ReconSourceData {
  id: string;
  tenantId: string;
  reconId: string;
  closeSessionId: string;
  sourceType: string;
  fileName: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
  entries: ReconSourceEntry[];
  totalAmount: string;
  entryCount: number;
}

export interface MatchResult {
  sourceIndex: number;
  glEntryId: string;
  glLineNumber: number;
  sourceAmount: number;
  glAmount: number;
  matchType: 'exact_amount' | 'amount_date_proximity';
  confidence: number;
  sourceDescription: string;
  glDescription: string | null;
  sourceDate: string;
  glDate: string;
}
