import {
  CANADIAN_ASPE_PROFILE_ID,
  CANADIAN_ASPE_PROFILE_VERSION,
  type AccountingCloseRequirement,
  type AllowedCloseAgentAction,
  type CanadianAspeCloseProfile,
  type CanadianAspeRequirementCode,
  type CloseFrequency,
  type CloseProfileEvaluation,
  type CloseRequirementDisposition,
} from '../types/accounting_close_profile.js';

const READ_CHECK_DRAFT: AllowedCloseAgentAction[] = [
  'read_erp_data',
  'run_deterministic_check',
  'draft_workpaper',
  'assemble_evidence_index',
];

const RECONCILE_AND_PROPOSE: AllowedCloseAgentAction[] = [
  'read_erp_data',
  'run_deterministic_check',
  'match_transactions',
  'draft_workpaper',
  'propose_journal_entry',
  'assemble_evidence_index',
];

function requirement(
  input: Omit<AccountingCloseRequirement, 'required' | 'frequencies'> & {
    frequencies?: CloseFrequency[];
  }
): AccountingCloseRequirement {
  return {
    ...input,
    required: true,
    frequencies: input.frequencies ?? ['monthly', 'quarterly'],
  };
}

const REQUIREMENTS: AccountingCloseRequirement[] = [
  requirement({
    code: 'CA_SCOPE_CONFIRMED',
    name: 'Canadian ASPE close scope confirmed',
    description: 'Confirm one ERP connection, one legal entity, accrual accounting, and CAD functional currency for this MVP close.',
    category: 'scope',
    assertions: ['completeness', 'classification', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'human_review',
    completionAuthority: 'reviewer',
    allowedAgentActions: ['read_erp_data', 'draft_workpaper'],
    requiredEvidence: ['approved close scope and reporting-period record'],
    completionRule: 'A reviewer confirms the entity, ERP source, period, accounting basis, ASPE framework, and CAD functional currency.',
    authorities: ['CPA Canada Accounting Standards for Private Enterprises'],
  }),
  requirement({
    code: 'ERP_CUTOFF_COMPLETE',
    name: 'ERP source cutoff and control totals complete',
    description: 'Freeze the source-data cutoff, record extraction identifiers, and reconcile ERP control totals to the imported ledger.',
    category: 'source_data',
    assertions: ['completeness', 'accuracy', 'cutoff'],
    skippableWhenNotApplicable: false,
    executionMode: 'deterministic',
    completionAuthority: 'reviewer',
    allowedAgentActions: READ_CHECK_DRAFT,
    requiredEvidence: ['ERP extraction identifier', 'source cutoff timestamp', 'source-to-ledger control totals'],
    completionRule: 'The imported population is immutable, traceable to one ERP extraction, and its debit and credit control totals agree to the source.',
    authorities: ['ASPE financial statement presentation and completeness'],
  }),
  requirement({
    code: 'INTEGRITY_CHECKS',
    name: 'General-ledger mathematical integrity checks pass',
    description: 'Verify the trial balance balances and reject rounding gaps, duplicate imports, and invalid journal-entry populations.',
    category: 'source_data',
    assertions: ['completeness', 'accuracy'],
    skippableWhenNotApplicable: false,
    executionMode: 'deterministic',
    completionAuthority: 'system_check',
    allowedAgentActions: ['read_erp_data', 'run_deterministic_check', 'draft_workpaper'],
    requiredEvidence: ['integrity-check result', 'trial-balance control totals'],
    completionRule: 'All deterministic integrity gates pass with no unresolved material exception.',
    authorities: ['ASPE financial statement presentation'],
  }),
  requirement({
    code: 'CASH_REC',
    name: 'All bank and cash accounts reconciled',
    description: 'Reconcile book cash to independent bank evidence, explain reconciling items, and obtain review sign-off.',
    category: 'reconciliation',
    assertions: ['existence', 'completeness', 'accuracy', 'rights_and_obligations', 'cutoff'],
    skippableWhenNotApplicable: false,
    executionMode: 'agent_assisted',
    completionAuthority: 'system_check',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['bank statement', 'bank reconciliation', 'reconciling-item support', 'review sign-off'],
    completionRule: 'Every cash account has a completed reconciliation within tolerance and a reviewer sign-off.',
    authorities: ['ASPE financial statement presentation'],
  }),
  requirement({
    code: 'AR_SUBLEDGER_RECONCILIATION',
    name: 'Accounts receivable reconciled and valued',
    description: 'Tie the receivables subledger to the general ledger and review aging, credit losses, credits, and cutoff.',
    category: 'reconciliation',
    assertions: ['existence', 'completeness', 'accuracy', 'valuation', 'cutoff'],
    skippableWhenNotApplicable: true,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['AR subledger tie-out', 'aging review', 'collectibility assessment'],
    completionRule: 'The subledger agrees to the GL and all material aging and valuation exceptions are resolved or adjusted.',
    authorities: ['ASPE financial instruments and revenue recognition'],
  }),
  requirement({
    code: 'AP_SUBLEDGER_RECONCILIATION',
    name: 'Accounts payable reconciled and cutoff tested',
    description: 'Tie the payables subledger to the GL and review unmatched receipts, vendor statements, and unrecorded liabilities.',
    category: 'reconciliation',
    assertions: ['existence', 'completeness', 'accuracy', 'cutoff'],
    skippableWhenNotApplicable: true,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['AP subledger tie-out', 'cutoff review', 'unrecorded-liability search'],
    completionRule: 'The subledger agrees to the GL and material cutoff or completeness exceptions are resolved or adjusted.',
    authorities: ['ASPE financial statement completeness'],
  }),
  requirement({
    code: 'PAYROLL_REMITTANCE_RECONCILIATION',
    name: 'Payroll and CRA remittances reconciled',
    description: 'Reconcile payroll registers, accrued payroll, source deductions, employer amounts, and remittances to CRA control accounts.',
    category: 'tax_and_statutory',
    assertions: ['completeness', 'accuracy', 'cutoff', 'classification'],
    skippableWhenNotApplicable: true,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['payroll register', 'payroll control-account reconciliation', 'CRA remittance support'],
    completionRule: 'Payroll expense, liabilities, and remittances agree to the payroll source and all differences are resolved.',
    authorities: ['Canada Revenue Agency payroll deductions and remittances'],
  }),
  requirement({
    code: 'SALES_TAX_RECONCILIATION',
    name: 'GST/HST and applicable provincial sales taxes reconciled',
    description: 'Reconcile collected and recoverable sales taxes to the GL and filed or draft returns, including QST or PST where registered.',
    category: 'tax_and_statutory',
    assertions: ['completeness', 'accuracy', 'cutoff', 'classification'],
    skippableWhenNotApplicable: true,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['sales-tax control-account reconciliation', 'filed or draft return', 'payment or refund support'],
    completionRule: 'Every registered sales-tax account reconciles to transaction data and the applicable return for the reporting period.',
    authorities: ['Canada Revenue Agency GST/HST reporting', 'Applicable provincial sales-tax authority'],
  }),
  requirement({
    code: 'FOREIGN_CURRENCY_REMEASUREMENT',
    name: 'Foreign-currency balances remeasured and reviewed',
    description: 'Identify monetary balances and transactions denominated outside CAD, apply supported period-end exchange rates, and review realized and unrealized exchange differences.',
    category: 'cutoff_and_estimates',
    assertions: ['completeness', 'accuracy', 'valuation', 'cutoff', 'classification', 'presentation'],
    skippableWhenNotApplicable: true,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['foreign-currency balance listing', 'approved exchange-rate source', 'remeasurement calculation', 'adjustment or no-adjustment conclusion'],
    completionRule: 'All material foreign-currency monetary items are remeasured using supported rates and resulting differences are recorded and reviewed.',
    authorities: ['ASPE Section 1651, Foreign Currency Translation'],
  }),
  requirement({
    code: 'REVENUE_CUTOFF_REVIEW',
    name: 'Revenue recognition and cutoff reviewed',
    description: 'Test period-end revenue cutoff, contract terms, credits, returns, and the completeness of deferred revenue.',
    category: 'cutoff_and_estimates',
    assertions: ['occurrence', 'completeness', 'accuracy', 'cutoff', 'classification'],
    skippableWhenNotApplicable: false,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['revenue cutoff test', 'contract or invoice support', 'exception disposition'],
    completionRule: 'Material revenue streams and period-end transactions are tested and all identified errors are resolved or adjusted.',
    authorities: ['ASPE revenue recognition'],
  }),
  requirement({
    code: 'EXPENSE_CUTOFF_AND_ACCRUALS',
    name: 'Expense cutoff and accruals completed',
    description: 'Review subsequent invoices, recurring obligations, unpaid services, bonuses, interest, and other period-end accruals.',
    category: 'cutoff_and_estimates',
    assertions: ['completeness', 'accuracy', 'valuation', 'cutoff'],
    skippableWhenNotApplicable: false,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['accrual calculation', 'subsequent-invoice review', 'approved adjustment or no-adjustment conclusion'],
    completionRule: 'All material obligations through period end are recorded using supported estimates and reviewed assumptions.',
    authorities: ['ASPE recognition and measurement'],
  }),
  requirement({
    code: 'PREPAID_AMORTIZATION',
    name: 'Prepaids and amortization reconciled',
    description: 'Roll forward prepaid balances and record the period expense using supported service periods.',
    category: 'reconciliation',
    assertions: ['existence', 'accuracy', 'valuation', 'cutoff'],
    skippableWhenNotApplicable: true,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['prepaid schedule', 'invoice or contract support', 'amortization calculation'],
    completionRule: 'The prepaid rollforward agrees to the GL and the period amortization is complete and approved.',
    authorities: ['ASPE recognition and measurement'],
  }),
  requirement({
    code: 'INVENTORY_RECONCILIATION',
    name: 'Inventory reconciled and valued',
    description: 'Tie perpetual or count records to the GL and assess cutoff, costing, obsolescence, and net realizable value.',
    category: 'reconciliation',
    assertions: ['existence', 'completeness', 'accuracy', 'valuation', 'rights_and_obligations', 'cutoff'],
    skippableWhenNotApplicable: true,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['inventory subledger or count tie-out', 'valuation review', 'obsolescence assessment'],
    completionRule: 'Inventory records agree to the GL and all material count, cutoff, and valuation exceptions are resolved.',
    authorities: ['ASPE inventories'],
  }),
  requirement({
    code: 'FIXED_ASSET_ROLLFORWARD',
    name: 'Property and equipment rollforward completed',
    description: 'Reconcile additions, disposals, depreciation, and accumulated depreciation to the GL and supporting records.',
    category: 'reconciliation',
    assertions: ['existence', 'completeness', 'accuracy', 'valuation', 'rights_and_obligations', 'classification'],
    skippableWhenNotApplicable: true,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['fixed-asset rollforward', 'addition and disposal support', 'depreciation calculation'],
    completionRule: 'Opening balance plus additions less disposals and depreciation equals the closing GL balance.',
    authorities: ['ASPE property, plant and equipment'],
  }),
  requirement({
    code: 'DEBT_AND_INTEREST_RECONCILIATION',
    name: 'Debt, interest, and classification reconciled',
    description: 'Tie lender statements and amortization schedules to principal, accrued interest, interest expense, and current/non-current classification.',
    category: 'reconciliation',
    assertions: ['existence', 'completeness', 'accuracy', 'valuation', 'rights_and_obligations', 'classification'],
    skippableWhenNotApplicable: true,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['lender statement', 'debt rollforward', 'interest calculation', 'classification review'],
    completionRule: 'Debt and interest balances agree to external support and are correctly classified at period end.',
    authorities: ['ASPE financial instruments and presentation'],
  }),
  requirement({
    code: 'LEASE_RECONCILIATION',
    name: 'Lease obligations and expense reviewed',
    description: 'Reconcile the lease population, payments, incentives, commitments, and ASPE accounting treatment.',
    category: 'reconciliation',
    assertions: ['completeness', 'accuracy', 'valuation', 'rights_and_obligations', 'classification', 'presentation'],
    skippableWhenNotApplicable: true,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['lease register', 'lease agreements', 'expense or obligation rollforward'],
    completionRule: 'The complete lease population is assessed and recorded or disclosed under the applicable ASPE treatment.',
    authorities: ['ASPE leases'],
  }),
  requirement({
    code: 'DEFERRED_REVENUE_RECONCILIATION',
    name: 'Deferred revenue reconciled',
    description: 'Roll forward opening deferrals, billings or cash receipts, revenue recognized, and closing contract obligations.',
    category: 'reconciliation',
    assertions: ['existence', 'completeness', 'accuracy', 'cutoff', 'classification'],
    skippableWhenNotApplicable: true,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['deferred-revenue rollforward', 'contract support', 'recognition calculation'],
    completionRule: 'The rollforward agrees to the GL and revenue is recognized in the appropriate period.',
    authorities: ['ASPE revenue recognition'],
  }),
  requirement({
    code: 'BALANCE_SHEET_RECONCILIATIONS',
    name: 'All material balance-sheet accounts reconciled',
    description: 'Complete, evidence, and review the reconciliation population for every material balance-sheet account.',
    category: 'reconciliation',
    assertions: ['existence', 'completeness', 'accuracy', 'valuation', 'rights_and_obligations', 'classification'],
    skippableWhenNotApplicable: false,
    executionMode: 'deterministic',
    completionAuthority: 'system_check',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['account-reconciliation population', 'support for every material reconciliation', 'review sign-offs'],
    completionRule: 'All required reconciliations are completed or approved, within tolerance, and supported by evidence.',
    authorities: ['ASPE financial statement presentation'],
  }),
  requirement({
    code: 'MATERIAL_JES_APPROVED',
    name: 'All material journal entries resolved',
    description: 'Require balanced entries, support, period-valid dates, preparer identity, independent human approval, and a confirmed ERP receipt when writeback is enabled.',
    category: 'review_and_governance',
    assertions: ['completeness', 'accuracy', 'cutoff', 'classification'],
    skippableWhenNotApplicable: false,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: [
      'read_erp_data',
      'run_deterministic_check',
      'draft_workpaper',
      'propose_journal_entry',
      'post_approved_journal_entry_via_gateway',
      'assemble_evidence_index',
    ],
    requiredEvidence: ['journal-entry support', 'preparer record', 'independent approval record', 'ERP posting receipt when writeback is enabled'],
    completionRule: 'No material journal entry remains draft or proposed; each approved entry is balanced, supported, authorized by a human, and conclusively posted to the configured ERP when writeback is enabled.',
    authorities: ['ASPE recognition and measurement', 'Segregation of duties'],
  }),
  requirement({
    code: 'MAPPING_COMPLETENESS',
    name: 'Chart-of-accounts mapping complete',
    description: 'Map every material trial-balance account to an ASPE presentation line and cash-flow class where applicable.',
    category: 'reporting',
    assertions: ['completeness', 'classification', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'deterministic',
    completionAuthority: 'system_check',
    allowedAgentActions: ['read_erp_data', 'run_deterministic_check', 'draft_workpaper'],
    requiredEvidence: ['mapping-completeness result', 'approved mapping overrides'],
    completionRule: 'No material account is unmapped and every override is traceable to a human decision.',
    authorities: ['ASPE financial statement presentation'],
  }),
  requirement({
    code: 'FINANCIAL_STATEMENT_TIE_OUT',
    name: 'Financial statements tie to the adjusted trial balance',
    description: 'Cross-foot the statements and verify that every presented amount is derived from the certified adjusted trial balance.',
    category: 'reporting',
    assertions: ['completeness', 'accuracy', 'classification', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'deterministic',
    completionAuthority: 'reviewer',
    allowedAgentActions: READ_CHECK_DRAFT,
    requiredEvidence: ['statement-to-trial-balance tie-out', 'cross-statement validation result'],
    completionRule: 'Assets equal liabilities plus equity, statement lines trace to the adjusted TB, and cross-statement hard checks pass.',
    authorities: ['ASPE financial statement presentation'],
  }),
  requirement({
    code: 'CASH_FLOW_RECONCILIATION',
    name: 'Cash-flow statement reconciled to cash movement',
    description: 'Verify that operating, investing, and financing sections sum to net cash movement and that ending cash agrees to the balance sheet.',
    category: 'reporting',
    assertions: ['completeness', 'accuracy', 'classification', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'deterministic',
    completionAuthority: 'reviewer',
    allowedAgentActions: READ_CHECK_DRAFT,
    requiredEvidence: ['cash-flow rollforward', 'section classification review', 'balance-sheet cash tie-out'],
    completionRule: 'Section totals equal net change in cash and beginning cash plus that change equals balance-sheet ending cash.',
    authorities: ['ASPE statement of cash flows'],
  }),
  requirement({
    code: 'MATERIAL_VARIANCE_REVIEW',
    name: 'Material fluctuations explained and reviewed',
    description: 'Investigate material period-over-period and expectation variances and distinguish facts from model-drafted explanations.',
    category: 'review_and_governance',
    assertions: ['completeness', 'accuracy', 'valuation', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'agent_assisted',
    completionAuthority: 'system_check',
    allowedAgentActions: ['read_erp_data', 'run_deterministic_check', 'draft_workpaper', 'draft_variance_explanation'],
    requiredEvidence: ['variance analysis', 'human-reviewed explanations', 'exception disposition'],
    completionRule: 'Every material variance has an evidence-backed explanation approved by a human reviewer.',
    authorities: ['ASPE financial statement presentation'],
  }),
  requirement({
    code: 'EVIDENCE_COMPLETE',
    name: 'Close evidence package complete',
    description: 'Confirm that reconciliations, material entries, estimates, and review conclusions have immutable, traceable support.',
    category: 'review_and_governance',
    assertions: ['completeness', 'accuracy'],
    skippableWhenNotApplicable: false,
    executionMode: 'deterministic',
    completionAuthority: 'system_check',
    allowedAgentActions: ['read_erp_data', 'run_deterministic_check', 'assemble_evidence_index'],
    requiredEvidence: ['evidence-policy result', 'evidence manifest', 'content hashes'],
    completionRule: 'Every required object has support and the evidence manifest is complete and hash-verifiable.',
    authorities: ['Close evidence and audit-trail policy'],
  }),
  requirement({
    code: 'NO_CRITICAL_ISSUES',
    name: 'No unresolved critical close issues',
    description: 'Resolve or formally waive all critical and blocking issues before the close advances.',
    category: 'review_and_governance',
    assertions: ['completeness', 'accuracy', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'deterministic',
    completionAuthority: 'system_check',
    allowedAgentActions: ['read_erp_data', 'run_deterministic_check', 'draft_workpaper'],
    requiredEvidence: ['issue register', 'resolution or authorized waiver'],
    completionRule: 'The period has zero open critical or blocking issues.',
    authorities: ['Close governance policy'],
  }),
  requirement({
    code: 'CONTROLLER_REVIEW_SIGNOFF',
    name: 'Controller review and close recommendation complete',
    description: 'A human reviewer assesses the close package, judgments, exceptions, and evidence before recommending certification.',
    category: 'review_and_governance',
    assertions: ['completeness', 'accuracy', 'valuation', 'classification', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'human_review',
    completionAuthority: 'reviewer',
    allowedAgentActions: ['read_erp_data', 'draft_workpaper', 'assemble_evidence_index', 'draft_reporting_package'],
    requiredEvidence: ['controller review sign-off', 'open-items conclusion'],
    completionRule: 'A human reviewer signs off that the package is complete and ready for a separate approver to certify.',
    authorities: ['Segregation of duties', 'ASPE financial statement presentation'],
  }),
  requirement({
    code: 'INCOME_TAX_PROVISION_REVIEW',
    name: 'Corporate income-tax provision and instalments reviewed',
    description: 'Reconcile current and future income-tax balances, instalments, loss carryforwards, and material tax positions.',
    category: 'tax_and_statutory',
    assertions: ['completeness', 'accuracy', 'valuation', 'classification', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: RECONCILE_AND_PROPOSE,
    requiredEvidence: ['tax provision calculation', 'instalment reconciliation', 'tax-position review'],
    completionRule: 'The provision and related balance-sheet accounts reconcile to supported calculations and payments.',
    authorities: ['ASPE income taxes', 'Canada Revenue Agency corporation payments'],
    frequencies: ['quarterly'],
  }),
  requirement({
    code: 'IMPAIRMENT_INDICATOR_REVIEW',
    name: 'Impairment indicators reviewed',
    description: 'Assess whether events or changes in circumstances indicate impairment of material assets or goodwill.',
    category: 'cutoff_and_estimates',
    assertions: ['existence', 'valuation', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: ['read_erp_data', 'run_deterministic_check', 'draft_workpaper', 'assemble_evidence_index'],
    requiredEvidence: ['impairment-indicator checklist', 'management conclusion', 'valuation support when triggered'],
    completionRule: 'A reviewer documents the indicator assessment and any required measurement or disclosure.',
    authorities: ['ASPE impairment requirements'],
    frequencies: ['quarterly'],
  }),
  requirement({
    code: 'DEBT_COVENANT_REVIEW',
    name: 'Debt covenants and liquidity classification reviewed',
    description: 'Calculate covenant measures, identify breaches or waivers, and assess current/non-current presentation and disclosure.',
    category: 'review_and_governance',
    assertions: ['accuracy', 'classification', 'presentation'],
    skippableWhenNotApplicable: true,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: READ_CHECK_DRAFT,
    requiredEvidence: ['covenant calculation', 'loan agreement', 'waiver or compliance conclusion'],
    completionRule: 'All covenants are calculated from certified-source amounts and each breach or waiver is properly reflected.',
    authorities: ['ASPE financial statement presentation'],
    frequencies: ['quarterly'],
  }),
  requirement({
    code: 'COMMITMENTS_CONTINGENCIES_REVIEW',
    name: 'Commitments and contingencies reviewed',
    description: 'Review legal, contractual, guarantee, and other exposures for recognition or disclosure.',
    category: 'cutoff_and_estimates',
    assertions: ['completeness', 'valuation', 'rights_and_obligations', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'human_review',
    completionAuthority: 'reviewer',
    allowedAgentActions: ['read_erp_data', 'draft_workpaper', 'assemble_evidence_index'],
    requiredEvidence: ['management inquiry', 'legal or contract support', 'recognition and disclosure conclusion'],
    completionRule: 'A reviewer documents the complete population and the accounting conclusion for each material exposure.',
    authorities: ['ASPE contingencies and commitments'],
    frequencies: ['quarterly'],
  }),
  requirement({
    code: 'RELATED_PARTY_REVIEW',
    name: 'Related-party balances and transactions reviewed',
    description: 'Identify related parties, reconcile balances and transactions, and assess measurement and disclosure.',
    category: 'reporting',
    assertions: ['completeness', 'accuracy', 'valuation', 'classification', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'agent_assisted',
    completionAuthority: 'reviewer',
    allowedAgentActions: READ_CHECK_DRAFT,
    requiredEvidence: ['related-party register', 'transaction reconciliation', 'measurement and disclosure conclusion'],
    completionRule: 'The related-party population is complete and all material balances and transactions are properly measured and disclosed.',
    authorities: ['ASPE related party transactions'],
    frequencies: ['quarterly'],
  }),
  requirement({
    code: 'SUBSEQUENT_EVENTS_REVIEW',
    name: 'Subsequent events reviewed',
    description: 'Review events through the package authorization date and determine whether adjustment or disclosure is required.',
    category: 'review_and_governance',
    assertions: ['completeness', 'valuation', 'cutoff', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'human_review',
    completionAuthority: 'reviewer',
    allowedAgentActions: ['read_erp_data', 'draft_workpaper', 'assemble_evidence_index'],
    requiredEvidence: ['subsequent-events inquiry', 'event register', 'adjustment or disclosure conclusion'],
    completionRule: 'A reviewer documents the search window, population, and disposition of all identified events.',
    authorities: ['ASPE subsequent events'],
    frequencies: ['quarterly'],
  }),
  requirement({
    code: 'ASPE_DISCLOSURE_REVIEW',
    name: 'ASPE presentation and disclosures reviewed',
    description: 'Review classification, significant policies, estimates, commitments, related parties, debt, taxes, and other applicable disclosures.',
    category: 'reporting',
    assertions: ['completeness', 'accuracy', 'classification', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'human_review',
    completionAuthority: 'reviewer',
    allowedAgentActions: ['read_erp_data', 'draft_workpaper', 'assemble_evidence_index', 'draft_reporting_package'],
    requiredEvidence: ['completed ASPE disclosure checklist', 'review notes', 'approved financial-statement draft'],
    completionRule: 'A human reviewer completes the applicable ASPE disclosure checklist and resolves every exception.',
    authorities: ['CPA Canada Accounting Standards for Private Enterprises'],
    frequencies: ['quarterly'],
  }),
  requirement({
    code: 'QUARTERLY_REPORT_PACKAGE',
    name: 'Quarterly reporting package assembled and tied out',
    description: 'Assemble current and comparative statements, variance analysis, KPI support, disclosures, and certification evidence.',
    category: 'reporting',
    assertions: ['completeness', 'accuracy', 'classification', 'presentation'],
    skippableWhenNotApplicable: false,
    executionMode: 'human_review',
    completionAuthority: 'reviewer',
    allowedAgentActions: ['read_erp_data', 'draft_workpaper', 'assemble_evidence_index', 'draft_reporting_package'],
    requiredEvidence: ['quarterly package', 'comparative tie-out', 'review sign-off'],
    completionRule: 'The final package agrees to certified-source statements and is approved for separate certification.',
    authorities: ['ASPE financial statement presentation'],
    frequencies: ['quarterly'],
  }),
];

const PERMITTED_AGENT_ACTIONS: AllowedCloseAgentAction[] = [
  'read_erp_data',
  'run_deterministic_check',
  'match_transactions',
  'draft_workpaper',
  'draft_variance_explanation',
  'propose_journal_entry',
  'post_approved_journal_entry_via_gateway',
  'assemble_evidence_index',
  'draft_reporting_package',
];

export class CanadianAspeProfileError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_FREQUENCY' | 'UNSUPPORTED_PROFILE'
  ) {
    super(message);
    this.name = 'CanadianAspeProfileError';
  }
}

export function parseCloseFrequency(value: unknown, fallback: CloseFrequency = 'monthly'): CloseFrequency {
  if (value == null || value === '') return fallback;
  if (value === 'monthly' || value === 'quarterly') return value;
  throw new CanadianAspeProfileError('frequency must be monthly or quarterly', 'INVALID_FREQUENCY');
}

export function assertCanadianAspeProfileId(value: unknown): void {
  if (value == null || value === CANADIAN_ASPE_PROFILE_ID) return;
  throw new CanadianAspeProfileError(
    `Unsupported accounting profile. Expected ${CANADIAN_ASPE_PROFILE_ID}.`,
    'UNSUPPORTED_PROFILE'
  );
}

export function getCanadianAspeCloseProfile(frequency: CloseFrequency): CanadianAspeCloseProfile {
  return {
    id: CANADIAN_ASPE_PROFILE_ID,
    version: CANADIAN_ASPE_PROFILE_VERSION,
    name: `Canadian private enterprise — ASPE ${frequency} close`,
    jurisdiction: 'CA',
    framework: 'ASPE',
    entityType: 'private_enterprise',
    basis: 'accrual',
    erpConnectionCount: 1,
    entityCount: 1,
    functionalCurrency: 'CAD',
    frequency,
    requirements: REQUIREMENTS
      .filter((item) => item.frequencies.includes(frequency))
      .map((item) => ({
        ...item,
        assertions: [...item.assertions],
        allowedAgentActions: [...item.allowedAgentActions],
        requiredEvidence: [...item.requiredEvidence],
        authorities: [...item.authorities],
        frequencies: [...item.frequencies],
      })),
    agentBoundary: {
      permitted: [...PERMITTED_AGENT_ACTIONS],
      prohibited: [
        'post_unapproved_journal_entry',
        'bypass_erp_posting_gateway',
        'approve_journal_entry',
        'complete_control',
        'certify_close',
        'lock_period',
        'change_erp_master_data',
      ],
      journalEntryAuthority: 'approved_gateway_only',
      certificationAuthority: 'human_approver_only',
    },
    certificationInvariants: [
      'The adjusted trial balance balances.',
      'Assets equal liabilities plus equity.',
      'Every material account is mapped to an ASPE reporting line.',
      'The financial statements are derived from the certified adjusted trial balance.',
      'Cash-flow sections reconcile to net cash movement and ending balance-sheet cash.',
      'No material journal entry remains unapproved.',
      'Every enabled ERP journal-entry writeback has a conclusive external posting receipt.',
      'Required evidence is traceable and hash-verifiable.',
      'Certification is performed by a human approver independent of the model.',
    ],
    postCertificationActions: [
      'Create an immutable certified ledger snapshot and evidence manifest.',
      'Lock the ERP period only after certification and authorized subsequent-event review.',
    ],
  };
}

export function getCanadianAspeRequirement(
  code: string
): AccountingCloseRequirement | undefined {
  return REQUIREMENTS.find((item) => item.code === code);
}

export function isCanadianAspeRequirementCode(code: string): code is CanadianAspeRequirementCode {
  return getCanadianAspeRequirement(code) != null;
}

export function isChecklistRequirementSkippable(code: string): boolean {
  return getCanadianAspeRequirement(code)?.skippableWhenNotApplicable === true;
}

/** Pure, deterministic status gate used by tests and non-database harnesses. */
export function evaluateCanadianAspeCloseProfile(
  profile: CanadianAspeCloseProfile,
  dispositions: CloseRequirementDisposition[]
): CloseProfileEvaluation {
  const byCode = new Map(dispositions.map((item) => [item.code, item]));
  const dispositionCounts = new Map<CanadianAspeRequirementCode, number>();
  for (const disposition of dispositions) {
    dispositionCounts.set(disposition.code, (dispositionCounts.get(disposition.code) ?? 0) + 1);
  }
  const blockers: CloseProfileEvaluation['blockers'] = [];
  const completed: CanadianAspeRequirementCode[] = [];
  const notApplicable: CanadianAspeRequirementCode[] = [];

  for (const requirementItem of profile.requirements) {
    if ((dispositionCounts.get(requirementItem.code) ?? 0) > 1) {
      blockers.push({
        code: requirementItem.code,
        reason: 'duplicate',
        message: `${requirementItem.name} has duplicate dispositions.`,
      });
      continue;
    }
    const disposition = byCode.get(requirementItem.code);
    if (!disposition) {
      blockers.push({
        code: requirementItem.code,
        reason: 'missing',
        message: `${requirementItem.name} has no disposition.`,
      });
      continue;
    }
    if (disposition.status === 'completed') {
      completed.push(requirementItem.code);
      continue;
    }
    if (disposition.status === 'skipped') {
      if (!requirementItem.skippableWhenNotApplicable) {
        blockers.push({
          code: requirementItem.code,
          reason: 'skip_not_permitted',
          message: `${requirementItem.name} is a core control and cannot be skipped.`,
        });
      } else if (!disposition.notes?.trim()) {
        blockers.push({
          code: requirementItem.code,
          reason: 'skip_reason_required',
          message: `${requirementItem.name} requires a documented not-applicable reason.`,
        });
      } else {
        notApplicable.push(requirementItem.code);
      }
      continue;
    }
    blockers.push({
      code: requirementItem.code,
      reason: 'incomplete',
      message: `${requirementItem.name} is ${disposition.status}.`,
    });
  }

  return {
    ready: blockers.length === 0,
    blockers,
    completed,
    notApplicable,
  };
}
