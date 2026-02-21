import type { ValidationResult } from '@/lib/types/validation';

export const mockValidation: ValidationResult = {
  sessionId: 'c925645f-3831-4d81-93a9-a12a2819cd3e',
  allPassing: true,
  checks: [
    { id: 'tb-balanced', name: 'Trial Balance balanced (D = C)', passing: true, detail: 'Total debits: $45,234,567.89 = Total credits' },
    { id: 'a-eq-le', name: 'A = L + E', passing: true, detail: 'Assets: $17,563,134.57 = L+E: $17,563,134.57' },
    { id: 'ni-tie', name: 'Net Income tie (IS ↔ Equity)', passing: true, detail: 'IS Net Income: $3,405,250.00 = Equity Net Income: $3,405,250.00' },
    { id: 'cash-tie', name: 'Cash tie (CF ↔ BS)', passing: true, detail: 'CF Ending Cash: $1,745,678.90 = BS Cash: $1,745,678.90' },
    { id: 'equity-tie', name: 'Equity tie (Equity ↔ BS)', passing: true, detail: 'Equity Total: $4,083,801.24 = BS Equity: $4,083,801.24' },
    { id: 're-tie', name: 'Retained Earnings tie', passing: true, detail: 'Beginning RE + Net Income - Dividends = Ending RE' },
    { id: 'all-statements', name: 'All four statements exist', passing: true, detail: 'IS ✓  BS ✓  CF ✓  Equity ✓' },
    { id: 'not-stale', name: 'Statements not stale', passing: true, detail: 'Generated after last mutation' },
  ],
};

export function getValidationBySession(_sessionId: string): ValidationResult {
  return mockValidation;
}
