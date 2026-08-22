export const CANADIAN_ASPE_PROFILE_ID = 'ca-aspe-private-enterprise' as const;
export const CANADIAN_ASPE_PROFILE_VERSION = '1.1.0' as const;

export type CloseFrequency = 'monthly' | 'quarterly';

export type FinancialStatementAssertion =
  | 'existence'
  | 'occurrence'
  | 'completeness'
  | 'accuracy'
  | 'valuation'
  | 'rights_and_obligations'
  | 'cutoff'
  | 'classification'
  | 'presentation';

export type CloseControlCategory =
  | 'scope'
  | 'source_data'
  | 'reconciliation'
  | 'cutoff_and_estimates'
  | 'tax_and_statutory'
  | 'reporting'
  | 'review_and_governance';

export type CloseExecutionMode = 'deterministic' | 'agent_assisted' | 'human_review';

/**
 * A frontier model may prepare close work and execute a previously approved
 * entry through the deterministic ERP gateway. It cannot become the accounting
 * approval or certification authority.
 */
export type AllowedCloseAgentAction =
  | 'read_erp_data'
  | 'run_deterministic_check'
  | 'match_transactions'
  | 'draft_workpaper'
  | 'draft_variance_explanation'
  | 'propose_journal_entry'
  | 'post_approved_journal_entry_via_gateway'
  | 'assemble_evidence_index'
  | 'draft_reporting_package';

export type ProhibitedCloseAgentAction =
  | 'post_unapproved_journal_entry'
  | 'bypass_erp_posting_gateway'
  | 'approve_journal_entry'
  | 'complete_control'
  | 'certify_close'
  | 'lock_period'
  | 'change_erp_master_data';

export type CloseCompletionAuthority = 'system_check' | 'reviewer' | 'approver';

export const CANADIAN_ASPE_REQUIREMENT_CODES = [
  'CA_SCOPE_CONFIRMED',
  'ERP_CUTOFF_COMPLETE',
  'INTEGRITY_CHECKS',
  'CASH_REC',
  'AR_SUBLEDGER_RECONCILIATION',
  'AP_SUBLEDGER_RECONCILIATION',
  'PAYROLL_REMITTANCE_RECONCILIATION',
  'SALES_TAX_RECONCILIATION',
  'FOREIGN_CURRENCY_REMEASUREMENT',
  'REVENUE_CUTOFF_REVIEW',
  'EXPENSE_CUTOFF_AND_ACCRUALS',
  'PREPAID_AMORTIZATION',
  'INVENTORY_RECONCILIATION',
  'FIXED_ASSET_ROLLFORWARD',
  'DEBT_AND_INTEREST_RECONCILIATION',
  'LEASE_RECONCILIATION',
  'DEFERRED_REVENUE_RECONCILIATION',
  'BALANCE_SHEET_RECONCILIATIONS',
  'MATERIAL_JES_APPROVED',
  'MAPPING_COMPLETENESS',
  'FINANCIAL_STATEMENT_TIE_OUT',
  'CASH_FLOW_RECONCILIATION',
  'MATERIAL_VARIANCE_REVIEW',
  'EVIDENCE_COMPLETE',
  'NO_CRITICAL_ISSUES',
  'CONTROLLER_REVIEW_SIGNOFF',
  'INCOME_TAX_PROVISION_REVIEW',
  'IMPAIRMENT_INDICATOR_REVIEW',
  'DEBT_COVENANT_REVIEW',
  'COMMITMENTS_CONTINGENCIES_REVIEW',
  'RELATED_PARTY_REVIEW',
  'SUBSEQUENT_EVENTS_REVIEW',
  'ASPE_DISCLOSURE_REVIEW',
  'QUARTERLY_REPORT_PACKAGE',
] as const;

export type CanadianAspeRequirementCode = (typeof CANADIAN_ASPE_REQUIREMENT_CODES)[number];

export interface AccountingCloseRequirement {
  code: CanadianAspeRequirementCode;
  name: string;
  description: string;
  category: CloseControlCategory;
  assertions: FinancialStatementAssertion[];
  required: true;
  /** True only for a conditionally applicable balance or activity area. */
  skippableWhenNotApplicable: boolean;
  executionMode: CloseExecutionMode;
  completionAuthority: CloseCompletionAuthority;
  allowedAgentActions: AllowedCloseAgentAction[];
  requiredEvidence: string[];
  completionRule: string;
  authorities: string[];
  frequencies: CloseFrequency[];
}

export interface CanadianAspeCloseProfile {
  id: typeof CANADIAN_ASPE_PROFILE_ID;
  version: typeof CANADIAN_ASPE_PROFILE_VERSION;
  name: string;
  jurisdiction: 'CA';
  framework: 'ASPE';
  entityType: 'private_enterprise';
  basis: 'accrual';
  erpConnectionCount: 1;
  entityCount: 1;
  functionalCurrency: 'CAD';
  frequency: CloseFrequency;
  requirements: AccountingCloseRequirement[];
  agentBoundary: {
    permitted: AllowedCloseAgentAction[];
    prohibited: ProhibitedCloseAgentAction[];
    journalEntryAuthority: 'approved_gateway_only';
    certificationAuthority: 'human_approver_only';
  };
  certificationInvariants: string[];
  postCertificationActions: string[];
}

export type CloseRequirementStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface CloseRequirementDisposition {
  code: CanadianAspeRequirementCode;
  status: CloseRequirementStatus;
  completedBy?: string;
  notes?: string;
}

export interface CloseProfileEvaluation {
  ready: boolean;
  blockers: Array<{
    code: CanadianAspeRequirementCode;
    reason: 'missing' | 'duplicate' | 'incomplete' | 'skip_not_permitted' | 'skip_reason_required';
    message: string;
  }>;
  completed: CanadianAspeRequirementCode[];
  notApplicable: CanadianAspeRequirementCode[];
}
