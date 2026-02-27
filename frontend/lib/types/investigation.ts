export interface AccountDelta {
  account_code: string;
  account_name: string;
  current_balance: string;
  prior_balance: string;
  delta: string;
  contribution_pct: string;
  top_memos: string[];
}

export interface InvestigationResult {
  fs_line_id: string;
  line_item_label: string;
  current_total: string;
  prior_total: string;
  delta: string;
  delta_pct: string;
  top_accounts: AccountDelta[];
  new_accounts: AccountDelta[];
  eliminated_accounts: AccountDelta[];
  top_memos: string[];
}

export interface AccountDrilldown {
  account_code: string;
  account_name: string;
  entries: GLEntry[];
}

export interface GLEntry {
  date: string;
  description: string;
  debit: string;
  credit: string;
  je_number: string;
  memo: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatResponse {
  response: string;
  provenance_valid: boolean;
  number_references: Array<{ value: string; found_in: string }>;
}
