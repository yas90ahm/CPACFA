export interface ValidationCheck {
  id: string;
  name: string;
  passing: boolean;
  detail: string;
  suggestion?: string;
}

export interface ValidationResult {
  sessionId: string;
  checks: ValidationCheck[];
  allPassing: boolean;
}
