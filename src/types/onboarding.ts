/**
 * Onboarding: guided setup, CoA import, first close wizard.
 */

export type OnboardingStepId =
  | 'welcome'
  | 'entity_info'
  | 'coa_import'
  | 'first_tb'
  | 'first_close_checklist'
  | 'first_statements'
  | 'complete';

export interface OnboardingState {
  id?: string;
  tenantId: string;
  currentStep: OnboardingStepId;
  completedSteps: OnboardingStepId[];
  /** Entity name, FY end, etc. */
  entityInfo?: { entityName?: string; fiscalYearEnd?: string; currency?: string };
  /** CoA imported (account count) */
  coaImported?: boolean;
  coaAccountCount?: number;
  /** First TB uploaded */
  firstTbUploaded?: boolean;
  /** First close checklist completed */
  firstCloseCompleted?: boolean;
  updatedAt: string;
}

export interface CoAImportResult {
  success: boolean;
  accountCount: number;
  errors: string[];
  sampleAccounts?: { code: string; name: string }[];
}
