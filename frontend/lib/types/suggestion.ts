export interface COASuggestion {
  id: string;
  accountCode: string | null;
  accountName: string;
  suggestedFsLineId: string;
  suggestedFsLineLabel: string | null;
  confidence: number;
  confidenceBand: 'high' | 'medium' | 'low';
  tier: string | null;
  alternatives: Array<{ line_item_id: string; label: string; score: number }>;
  modelVersion: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}

export interface CFSuggestion {
  id: string;
  accountCode: string | null;
  accountName: string;
  classification: 'Operating' | 'Investing' | 'Financing';
  confidence: number;
  confidenceBand: 'high' | 'medium' | 'low';
  source: string;
  rulePattern: string | null;
  alternatives: Array<{ classification: string; score: number }>;
  modelVersion: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}

export interface GenerateSuggestionsResult {
  coaSuggestions: COASuggestion[];
  cfSuggestions: CFSuggestion[];
  errors: Array<{ account_name: string; error: string }>;
}
