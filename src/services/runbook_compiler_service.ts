import { getCanadianAspeCloseProfile } from './canadian_aspe_close_profile.js';
import {
  CANADIAN_ASPE_REQUIREMENT_CODES,
  type AccountingCloseRequirement,
  type AllowedCloseAgentAction,
  type CanadianAspeRequirementCode,
  type CloseFrequency,
} from '../types/accounting_close_profile.js';
import {
  CLOSE_RUNBOOK_SCHEMA_VERSION,
  type CompiledCloseRunbook,
  type CompiledRunbookTask,
  type ParsedRunbookSource,
  type RunbookCapability,
  type RunbookCompilationIssue,
  type RunbookTaskExecutionMode,
} from '../types/close_runbook.js';

const CONTROL_CODES = new Set<string>(CANADIAN_ASPE_REQUIREMENT_CODES);

const HEADER_ALIASES = {
  code: ['task id', 'task code', 'id', 'code', 'step id'],
  title: ['task', 'task name', 'step', 'activity', 'procedure', 'name', 'title'],
  description: ['description', 'instructions', 'instruction', 'procedure details', 'details', 'notes'],
  dependencies: ['dependencies', 'dependency', 'depends on', 'predecessor', 'predecessors', 'blocked by'],
  dueOffset: ['due offset', 'due offset days', 'day', 'close day', 'due day'],
  assignee: ['owner', 'assignee', 'preparer', 'assigned to'],
  reviewer: ['reviewer', 'approver', 'reviewed by'],
  evidence: ['evidence', 'required evidence', 'support', 'supporting documents', 'documentation'],
  inputs: ['inputs', 'required inputs', 'source data', 'data source', 'system'],
  completion: ['completion criteria', 'definition of done', 'done when', 'completion rule', 'output'],
  tolerance: ['tolerance', 'threshold', 'materiality'],
  controlCode: ['control code', 'control id', 'requirement code'],
} as const;

const SAFE_DEFAULT_ACTIONS: AllowedCloseAgentAction[] = [
  'read_erp_data',
  'run_deterministic_check',
  'draft_workpaper',
  'assemble_evidence_index',
];

const CONTROL_DEPENDENCIES: Partial<Record<CanadianAspeRequirementCode, CanadianAspeRequirementCode[]>> = {
  // Source ingestion and integrity checks can begin as soon as the configured
  // close opens. Period-specific scope attestation remains a parallel human
  // control and must still be complete before final review.
  ERP_CUTOFF_COMPLETE: [],
  INTEGRITY_CHECKS: ['ERP_CUTOFF_COMPLETE'],
  CASH_REC: ['ERP_CUTOFF_COMPLETE', 'INTEGRITY_CHECKS'],
  AR_SUBLEDGER_RECONCILIATION: ['ERP_CUTOFF_COMPLETE', 'INTEGRITY_CHECKS'],
  AP_SUBLEDGER_RECONCILIATION: ['ERP_CUTOFF_COMPLETE', 'INTEGRITY_CHECKS'],
  PAYROLL_REMITTANCE_RECONCILIATION: ['ERP_CUTOFF_COMPLETE'],
  SALES_TAX_RECONCILIATION: ['ERP_CUTOFF_COMPLETE'],
  FOREIGN_CURRENCY_REMEASUREMENT: ['ERP_CUTOFF_COMPLETE', 'INTEGRITY_CHECKS'],
  REVENUE_CUTOFF_REVIEW: ['ERP_CUTOFF_COMPLETE'],
  EXPENSE_CUTOFF_AND_ACCRUALS: ['ERP_CUTOFF_COMPLETE'],
  PREPAID_AMORTIZATION: ['ERP_CUTOFF_COMPLETE'],
  INVENTORY_RECONCILIATION: ['ERP_CUTOFF_COMPLETE'],
  FIXED_ASSET_ROLLFORWARD: ['ERP_CUTOFF_COMPLETE'],
  DEBT_AND_INTEREST_RECONCILIATION: ['ERP_CUTOFF_COMPLETE'],
  LEASE_RECONCILIATION: ['ERP_CUTOFF_COMPLETE'],
  DEFERRED_REVENUE_RECONCILIATION: ['ERP_CUTOFF_COMPLETE'],
  BALANCE_SHEET_RECONCILIATIONS: [
    'CASH_REC',
    'AR_SUBLEDGER_RECONCILIATION',
    'AP_SUBLEDGER_RECONCILIATION',
    'PAYROLL_REMITTANCE_RECONCILIATION',
    'SALES_TAX_RECONCILIATION',
    'FOREIGN_CURRENCY_REMEASUREMENT',
    'PREPAID_AMORTIZATION',
    'INVENTORY_RECONCILIATION',
    'FIXED_ASSET_ROLLFORWARD',
    'DEBT_AND_INTEREST_RECONCILIATION',
    'LEASE_RECONCILIATION',
    'DEFERRED_REVENUE_RECONCILIATION',
    'MATERIAL_JES_APPROVED',
  ],
  MATERIAL_JES_APPROVED: [
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
  ],
  MAPPING_COMPLETENESS: ['ERP_CUTOFF_COMPLETE', 'INTEGRITY_CHECKS'],
  FINANCIAL_STATEMENT_TIE_OUT: [
    'MAPPING_COMPLETENESS',
    'BALANCE_SHEET_RECONCILIATIONS',
    'MATERIAL_JES_APPROVED',
  ],
  CASH_FLOW_RECONCILIATION: ['FINANCIAL_STATEMENT_TIE_OUT'],
  MATERIAL_VARIANCE_REVIEW: ['FINANCIAL_STATEMENT_TIE_OUT'],
  EVIDENCE_COMPLETE: ['BALANCE_SHEET_RECONCILIATIONS', 'MATERIAL_JES_APPROVED'],
  NO_CRITICAL_ISSUES: ['MATERIAL_VARIANCE_REVIEW', 'EVIDENCE_COMPLETE'],
  INCOME_TAX_PROVISION_REVIEW: ['ERP_CUTOFF_COMPLETE', 'INTEGRITY_CHECKS'],
  IMPAIRMENT_INDICATOR_REVIEW: ['FINANCIAL_STATEMENT_TIE_OUT'],
  DEBT_COVENANT_REVIEW: ['DEBT_AND_INTEREST_RECONCILIATION', 'FINANCIAL_STATEMENT_TIE_OUT'],
  COMMITMENTS_CONTINGENCIES_REVIEW: ['FINANCIAL_STATEMENT_TIE_OUT'],
  RELATED_PARTY_REVIEW: ['FINANCIAL_STATEMENT_TIE_OUT'],
  SUBSEQUENT_EVENTS_REVIEW: ['FINANCIAL_STATEMENT_TIE_OUT'],
  ASPE_DISCLOSURE_REVIEW: ['FINANCIAL_STATEMENT_TIE_OUT'],
  CONTROLLER_REVIEW_SIGNOFF: [
    'CA_SCOPE_CONFIRMED',
    'NO_CRITICAL_ISSUES',
    'FINANCIAL_STATEMENT_TIE_OUT',
    'CASH_FLOW_RECONCILIATION',
    'MATERIAL_VARIANCE_REVIEW',
    'EVIDENCE_COMPLETE',
    'INCOME_TAX_PROVISION_REVIEW',
    'IMPAIRMENT_INDICATOR_REVIEW',
    'DEBT_COVENANT_REVIEW',
    'COMMITMENTS_CONTINGENCIES_REVIEW',
    'RELATED_PARTY_REVIEW',
    'SUBSEQUENT_EVENTS_REVIEW',
    'ASPE_DISCLOSURE_REVIEW',
  ],
  QUARTERLY_REPORT_PACKAGE: ['CONTROLLER_REVIEW_SIGNOFF'],
};

function pick(values: Record<string, string>, aliases: readonly string[]): string {
  for (const alias of aliases) {
    const value = values[alias]?.trim();
    if (value) return value;
  }
  return '';
}

function splitList(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(/[,;|\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 48);
}

function normalizeExplicitCode(value: string): string {
  const normalized = slug(value);
  return normalized || '';
}

function inferControlCode(text: string): CanadianAspeRequirementCode | undefined {
  const value = text.toLowerCase();
  const matches: Array<[RegExp, CanadianAspeRequirementCode]> = [
    [/\b(aspe|accounting framework|close scope|reporting scope)\b/, 'CA_SCOPE_CONFIRMED'],
    [/\b(erp|source data|data extract|cutoff timestamp|control total|import complete)\b/, 'ERP_CUTOFF_COMPLETE'],
    [/\b(trial balance|debits?\s*=\s*credits?|mathematical integrity|duplicate import|ledger integrity)\b/, 'INTEGRITY_CHECKS'],
    [/\b(bank|cash)\b.*\b(recon|tie|match)|\b(recon|tie|match).*\b(bank|cash)\b/, 'CASH_REC'],
    [/\b(accounts receivable|a\/?r|receivables?|customer aging)\b/, 'AR_SUBLEDGER_RECONCILIATION'],
    [/\b(accounts payable|a\/?p|payables?|vendor aging|unrecorded liabilit)\b/, 'AP_SUBLEDGER_RECONCILIATION'],
    [/\b(payroll|source deduction|cpp|employment insurance|\bei\b|cra remittance)\b/, 'PAYROLL_REMITTANCE_RECONCILIATION'],
    [/\b(gst|hst|qst|pst|sales tax|input tax credit)\b/, 'SALES_TAX_RECONCILIATION'],
    [/\b(foreign currency|foreign exchange|fx remeasure|exchange rate|currency translation)\b/, 'FOREIGN_CURRENCY_REMEASUREMENT'],
    [/\b(revenue)\b.*\b(cutoff|recognition|contract)|\b(cutoff|recognition).*\brevenue\b/, 'REVENUE_CUTOFF_REVIEW'],
    [/\b(expense cutoff|accrual|subsequent invoice|unpaid service|bonus accrual)\b/, 'EXPENSE_CUTOFF_AND_ACCRUALS'],
    [/\b(prepaid|amortization schedule)\b/, 'PREPAID_AMORTIZATION'],
    [/\b(inventory|stock count|obsolescence|net realizable value)\b/, 'INVENTORY_RECONCILIATION'],
    [/\b(fixed asset|property and equipment|ppe|depreciation|asset register)\b/, 'FIXED_ASSET_ROLLFORWARD'],
    [/\b(debt|loan|lender|interest accrual)\b/, 'DEBT_AND_INTEREST_RECONCILIATION'],
    [/\b(lease|rental commitment)\b/, 'LEASE_RECONCILIATION'],
    [/\b(deferred revenue|contract liabilit|unearned revenue)\b/, 'DEFERRED_REVENUE_RECONCILIATION'],
    [/\b(balance sheet|all material accounts)\b.*\b(recon|tie)|\b(recon).*\bbalance sheet\b/, 'BALANCE_SHEET_RECONCILIATIONS'],
    [/\b(journal entr|aje|adjusting entr|post adjustment)\b/, 'MATERIAL_JES_APPROVED'],
    [/\b(chart of accounts|coa|account mapping|taxonomy mapping)\b/, 'MAPPING_COMPLETENESS'],
    [/\b(cash flow|statement of cash flows)\b/, 'CASH_FLOW_RECONCILIATION'],
    [/\b(variance|flux|period over period)\b/, 'MATERIAL_VARIANCE_REVIEW'],
    [/\b(financial statement|balance sheet and income statement|statement tie)\b/, 'FINANCIAL_STATEMENT_TIE_OUT'],
    [/\b(evidence|supporting document|audit support|workpaper support)\b/, 'EVIDENCE_COMPLETE'],
    [/\b(critical issue|blocking issue|open issue)\b/, 'NO_CRITICAL_ISSUES'],
    [/\b(controller review|controller sign.?off|final review)\b/, 'CONTROLLER_REVIEW_SIGNOFF'],
    [/\b(income tax provision|corporate tax provision|current tax|future income tax)\b/, 'INCOME_TAX_PROVISION_REVIEW'],
    [/\b(impairment indicator|impairment review)\b/, 'IMPAIRMENT_INDICATOR_REVIEW'],
    [/\b(debt covenant|covenant compliance)\b/, 'DEBT_COVENANT_REVIEW'],
    [/\b(commitment|contingen)\b/, 'COMMITMENTS_CONTINGENCIES_REVIEW'],
    [/\b(related part)\b/, 'RELATED_PARTY_REVIEW'],
    [/\b(subsequent event|events after)\b/, 'SUBSEQUENT_EVENTS_REVIEW'],
    [/\b(disclosure|notes to financial)\b/, 'ASPE_DISCLOSURE_REVIEW'],
    [/\b(quarterly report|quarterly package|quarter end package)\b/, 'QUARTERLY_REPORT_PACKAGE'],
  ];
  return matches.find(([pattern]) => pattern.test(value))?.[1];
}

function capabilityForControl(code: CanadianAspeRequirementCode): RunbookCapability {
  if (['ERP_CUTOFF_COMPLETE', 'INTEGRITY_CHECKS', 'MAPPING_COMPLETENESS'].includes(code)) return 'source_integrity';
  if (['FINANCIAL_STATEMENT_TIE_OUT', 'CASH_FLOW_RECONCILIATION', 'QUARTERLY_REPORT_PACKAGE'].includes(code)) return 'statement_generation';
  if (
    code.includes('RECONCILIATION') ||
    ['CASH_REC', 'PREPAID_AMORTIZATION', 'FIXED_ASSET_ROLLFORWARD', 'BALANCE_SHEET_RECONCILIATIONS'].includes(code)
  ) return 'reconciliation_review';
  if (['EXPENSE_CUTOFF_AND_ACCRUALS', 'MATERIAL_JES_APPROVED'].includes(code)) return 'journal_entry_review';
  if (code === 'MATERIAL_VARIANCE_REVIEW') return 'variance_review';
  if (code === 'EVIDENCE_COMPLETE') return 'evidence_review';
  if (['INTEGRITY_CHECKS', 'NO_CRITICAL_ISSUES'].includes(code)) return 'close_readiness';
  return 'human_review';
}

function inferCapability(text: string): RunbookCapability {
  const control = inferControlCode(text);
  if (control) return capabilityForControl(control);
  const value = text.toLowerCase();
  if (/\b(review|approve|sign.?off|confirm|certif)\b/.test(value)) return 'human_review';
  if (/\b(report|statement|package)\b/.test(value)) return 'statement_generation';
  return 'custom_review';
}

function defaultMode(capability: RunbookCapability): RunbookTaskExecutionMode {
  if (capability === 'human_review' || capability === 'custom_review') return 'human_review';
  if (capability === 'source_integrity' || capability === 'close_readiness' || capability === 'statement_generation') return 'deterministic';
  return 'agent_assisted';
}

function parseDueOffset(value: string, issues: RunbookCompilationIssue[], taskCode: string, sourceReference: string): number {
  if (!value.trim()) return 0;
  const match = /-?\d+/.exec(value);
  const parsed = match ? Number(match[0]) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < -31 || parsed > 60) {
    issues.push({
      severity: 'warning',
      code: 'INVALID_DUE_OFFSET',
      message: `Due offset "${value}" was replaced with close day 0.`,
      taskCode,
      sourceReference,
    });
    return 0;
  }
  return parsed;
}

function parseTolerance(value: string, issues: RunbookCompilationIssue[], taskCode: string, sourceReference: string): string | undefined {
  if (!value.trim()) return undefined;
  const normalized = value.replace(/[$,%\s]/g, '').replace(/,/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized) || Number(normalized) < 0) {
    issues.push({
      severity: 'warning',
      code: 'INVALID_TOLERANCE',
      message: `Tolerance "${value}" was not executable and must be configured by the controller.`,
      taskCode,
      sourceReference,
    });
    return undefined;
  }
  return normalized;
}

function requirementTask(
  requirement: AccountingCloseRequirement,
  dependencyCodes: string[]
): CompiledRunbookTask {
  return {
    code: requirement.code,
    title: requirement.name,
    description: requirement.description,
    origin: 'sabit_control',
    category: requirement.category,
    capability: capabilityForControl(requirement.code),
    executionMode: requirement.executionMode,
    completionAuthority: requirement.completionAuthority,
    dependencies: dependencyCodes,
    dueOffsetDays: 0,
    requiredInputs: [],
    requiredEvidence: [...requirement.requiredEvidence],
    completionCriteria: requirement.completionRule,
    allowedAgentActions: [...requirement.allowedAgentActions],
    approvalRequired: requirement.completionAuthority !== 'system_check',
    controlCode: requirement.code,
  };
}

function findCycle(tasks: CompiledRunbookTask[]): string[] | null {
  const byCode = new Map(tasks.map((task) => [task.code, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const visit = (code: string): string[] | null => {
    if (visiting.has(code)) {
      const start = path.indexOf(code);
      return [...path.slice(start), code];
    }
    if (visited.has(code)) return null;
    visiting.add(code);
    path.push(code);
    for (const dependency of byCode.get(code)?.dependencies ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(code);
    visited.add(code);
    return null;
  };
  for (const code of byCode.keys()) {
    const cycle = visit(code);
    if (cycle) return cycle;
  }
  return null;
}

export function compileCanadianAspeRunbook(input: {
  parsed: ParsedRunbookSource;
  frequency: CloseFrequency;
  now?: Date;
}): CompiledCloseRunbook {
  const profile = getCanadianAspeCloseProfile(input.frequency);
  const issues: RunbookCompilationIssue[] = input.parsed.warnings.map((message) => ({
    severity: 'warning' as const,
    code: 'UNMAPPED_CUSTOM_TASK' as const,
    message,
  }));
  if (input.parsed.tasks.length === 0) {
    issues.push({ severity: 'error', code: 'EMPTY_RUNBOOK', message: 'The uploaded runbook contains no executable tasks.' });
  }

  const rawDependencies = new Map<string, string[]>();
  const companyTasks: CompiledRunbookTask[] = [];
  const usedCodes = new Set<string>();
  const lookup = new Map<string, string>();

  input.parsed.tasks.forEach((row, index) => {
    const title = pick(row.values, HEADER_ALIASES.title) || pick(row.values, HEADER_ALIASES.description);
    if (!title) return;
    const explicitCode = normalizeExplicitCode(pick(row.values, HEADER_ALIASES.code));
    const baseCode = explicitCode || `RB_${String(index + 1).padStart(3, '0')}_${slug(title) || 'TASK'}`;
    let code = baseCode;
    let suffix = 2;
    while (usedCodes.has(code)) code = `${baseCode.slice(0, 55)}_${suffix++}`;
    if (code !== baseCode) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_TASK_CODE',
        message: `Task code ${baseCode} is duplicated. Codes must be unique before approval.`,
        taskCode: code,
        sourceReference: row.sourceReference,
      });
    }
    usedCodes.add(code);

    const description = pick(row.values, HEADER_ALIASES.description) || title;
    const combined = `${title}\n${description}`;
    const explicitControl = normalizeExplicitCode(pick(row.values, HEADER_ALIASES.controlCode));
    const controlCode = CONTROL_CODES.has(explicitControl)
      ? explicitControl as CanadianAspeRequirementCode
      : CONTROL_CODES.has(explicitCode)
        ? explicitCode as CanadianAspeRequirementCode
      : inferControlCode(combined);
    const requirement = controlCode
      ? profile.requirements.find((candidate) => candidate.code === controlCode)
      : undefined;
    const capability = controlCode ? capabilityForControl(controlCode) : inferCapability(combined);
    const executionMode = requirement?.executionMode ?? defaultMode(capability);

    if (/\b(FASB|US GAAP|ASC\s*\d{3}|MACRS|IRS|IFRS|IAS\s*\d+|FRS\s*102)\b/i.test(combined)) {
      issues.push({
        severity: 'error',
        code: 'FRAMEWORK_MISMATCH',
        message: 'Non-ASPE accounting guidance was found in a Canadian ASPE runbook task. Correct the source before approval.',
        taskCode: code,
        sourceReference: row.sourceReference,
      });
    }
    if (/\b(auto(?:matically)?\s+approve|post\s+without\s+approval|bypass\s+(?:the\s+)?approval|auto(?:matically)?\s+certif|auto(?:matically)?\s+lock)\b/i.test(combined)) {
      issues.push({
        severity: 'warning',
        code: 'UNSAFE_INSTRUCTION_REWRITTEN',
        message: 'A prohibited autonomous approval, certification, or posting instruction was converted to a human-controlled step.',
        taskCode: code,
        sourceReference: row.sourceReference,
      });
    }
    if (!controlCode && capability === 'custom_review') {
      issues.push({
        severity: 'warning',
        code: 'UNMAPPED_CUSTOM_TASK',
        message: 'This task has no registered accounting capability and will wait for a human owner.',
        taskCode: code,
        sourceReference: row.sourceReference,
      });
    }

    const task: CompiledRunbookTask = {
      code,
      title,
      description,
      origin: 'company_runbook',
      sourceReference: row.sourceReference,
      category: requirement?.category ?? (capability === 'custom_review' ? 'custom' : capability),
      capability,
      executionMode,
      completionAuthority: requirement?.completionAuthority ?? (executionMode === 'deterministic' ? 'system_check' : 'reviewer'),
      dependencies: [],
      dueOffsetDays: parseDueOffset(pick(row.values, HEADER_ALIASES.dueOffset), issues, code, row.sourceReference),
      assignee: pick(row.values, HEADER_ALIASES.assignee) || undefined,
      reviewer: pick(row.values, HEADER_ALIASES.reviewer) || undefined,
      requiredInputs: splitList(pick(row.values, HEADER_ALIASES.inputs)),
      requiredEvidence: splitList(pick(row.values, HEADER_ALIASES.evidence)),
      completionCriteria: pick(row.values, HEADER_ALIASES.completion) || requirement?.completionRule || `A reviewer confirms that ${title.toLowerCase()} is complete and supported.`,
      allowedAgentActions: requirement ? [...requirement.allowedAgentActions] : [...SAFE_DEFAULT_ACTIONS],
      approvalRequired:
        (requirement?.completionAuthority ?? (executionMode === 'deterministic' ? 'system_check' : 'reviewer')) !== 'system_check' ||
        /\b(post|journal|approve|sign.?off)\b/i.test(combined),
      tolerance: parseTolerance(pick(row.values, HEADER_ALIASES.tolerance), issues, code, row.sourceReference),
      controlCode,
    };
    companyTasks.push(task);
    rawDependencies.set(code, splitList(pick(row.values, HEADER_ALIASES.dependencies)));
    lookup.set(code.toLowerCase(), code);
    lookup.set(title.toLowerCase(), code);
    lookup.set(String(index + 1), code);
    if (explicitCode) lookup.set(explicitCode.toLowerCase(), code);
  });

  for (const task of companyTasks) {
    task.dependencies = (rawDependencies.get(task.code) ?? []).flatMap((reference) => {
      const normalized = normalizeExplicitCode(reference).toLowerCase();
      const resolved = lookup.get(reference.toLowerCase()) ?? lookup.get(normalized);
      if (resolved && resolved !== task.code) return [resolved];
      issues.push({
        severity: 'error',
        code: 'UNKNOWN_DEPENDENCY',
        message: `Dependency "${reference}" does not match another task.`,
        taskCode: task.code,
        sourceReference: task.sourceReference,
      });
      return [];
    });
  }

  const coveredByCompanyRunbook = [...new Set(companyTasks.flatMap((task) => task.controlCode ? [task.controlCode] : []))];
  const representativeByControl = new Map<CanadianAspeRequirementCode, string>();
  for (const task of companyTasks) {
    if (task.controlCode && !representativeByControl.has(task.controlCode)) {
      representativeByControl.set(task.controlCode, task.code);
    }
  }

  const addedBySabit: CanadianAspeRequirementCode[] = [];
  const baselineTasks: CompiledRunbookTask[] = [];
  for (const requirement of profile.requirements) {
    if (representativeByControl.has(requirement.code)) continue;
    addedBySabit.push(requirement.code);
    let taskCode: string = requirement.code;
    let suffix = 2;
    while (usedCodes.has(taskCode)) taskCode = `CTRL_${requirement.code}_${suffix++}`;
    usedCodes.add(taskCode);
    representativeByControl.set(requirement.code, taskCode);
    const task = requirementTask(requirement, []);
    task.code = taskCode;
    baselineTasks.push(task);
    issues.push({
      severity: 'info',
      code: 'MANDATORY_CONTROL_ADDED',
      message: `Sabit added the mandatory control: ${requirement.name}.`,
      taskCode: requirement.code,
    });
  }

  // Mandatory accounting sequencing is merged into company dependencies. An
  // uploaded runbook may add controls and ordering, but cannot remove Sabit's
  // source, reconciliation, reporting, and review prerequisites.
  for (const task of [...companyTasks, ...baselineTasks]) {
    const dependencies = task.controlCode ? CONTROL_DEPENDENCIES[task.controlCode] ?? [] : [];
    const mandatoryDependencies = dependencies
      .map((code) => representativeByControl.get(code))
      .filter((code): code is string => Boolean(code) && code !== task.code);
    task.dependencies = [...new Set([...task.dependencies, ...mandatoryDependencies])];
  }

  const tasks = [...companyTasks, ...baselineTasks];
  const cycle = findCycle(tasks);
  if (cycle) {
    issues.push({
      severity: 'error',
      code: 'CYCLIC_DEPENDENCY',
      message: `Runbook dependencies contain a cycle: ${cycle.join(' -> ')}.`,
      taskCode: cycle[0],
    });
  }

  const uncovered = profile.requirements
    .map((requirement) => requirement.code)
    .filter((code) => !representativeByControl.has(code));
  return {
    schemaVersion: CLOSE_RUNBOOK_SCHEMA_VERSION,
    profileId: profile.id,
    profileVersion: profile.version,
    framework: 'ASPE',
    frequency: input.frequency,
    generatedAt: (input.now ?? new Date()).toISOString(),
    requiresHumanApproval: true,
    executable: issues.every((issue) => issue.severity !== 'error') && uncovered.length === 0,
    tasks,
    issues,
    coverage: {
      coveredByCompanyRunbook,
      addedBySabit,
      uncovered,
    },
  };
}
