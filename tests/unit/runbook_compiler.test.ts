import { describe, expect, it } from '@jest/globals';
import { compileCanadianAspeRunbook } from '../../src/services/runbook_compiler_service.js';
import type { ParsedRunbookSource } from '../../src/types/close_runbook.js';

function parsed(tasks: ParsedRunbookSource['tasks']): ParsedRunbookSource {
  return {
    format: 'csv',
    tasks,
    sourceRowCount: tasks.length,
    ignoredRowCount: 0,
    warnings: [],
  };
}

describe('Canadian ASPE runbook compiler', () => {
  it('preserves company procedures and adds every missing mandatory close control', () => {
    const plan = compileCanadianAspeRunbook({
      frequency: 'monthly',
      now: new Date('2026-08-01T00:00:00.000Z'),
      parsed: parsed([
        {
          sourceReference: 'CSV:2',
          values: {
            code: 'ERP_CUTOFF_COMPLETE',
            task: 'Confirm ERP cutoff and source control totals',
            owner: 'Senior Accountant',
            evidence: 'ERP extraction manifest',
          },
        },
        {
          sourceReference: 'CSV:3',
          values: {
            code: 'CASH_REC',
            task: 'Complete bank reconciliation',
            dependencies: 'ERP_CUTOFF_COMPLETE',
            reviewer: 'Controller',
          },
        },
      ]),
    });

    expect(plan.framework).toBe('ASPE');
    expect(plan.executable).toBe(true);
    expect(plan.coverage.coveredByCompanyRunbook).toEqual(
      expect.arrayContaining(['ERP_CUTOFF_COMPLETE', 'CASH_REC'])
    );
    expect(plan.coverage.uncovered).toEqual([]);
    expect(plan.tasks.find((task) => task.code === 'CASH_REC')?.dependencies).toEqual(
      expect.arrayContaining(['ERP_CUTOFF_COMPLETE', 'INTEGRITY_CHECKS'])
    );
    expect(plan.tasks.filter((task) => task.origin === 'sabit_control')).not.toHaveLength(0);
    expect(plan.issues.some((issue) => issue.code === 'MANDATORY_CONTROL_ADDED')).toBe(true);
  });

  it('blocks U.S. guidance in a Canadian runbook instead of translating it silently', () => {
    const plan = compileCanadianAspeRunbook({
      frequency: 'monthly',
      parsed: parsed([
        {
          sourceReference: 'CSV:2',
          values: {
            task: 'Calculate fixed asset depreciation under MACRS and ASC 360',
          },
        },
      ]),
    });

    expect(plan.executable).toBe(false);
    expect(plan.issues).toContainEqual(expect.objectContaining({
      severity: 'error',
      code: 'FRAMEWORK_MISMATCH',
      sourceReference: 'CSV:2',
    }));
  });

  it('blocks IFRS guidance in the single-framework ASPE profile', () => {
    const plan = compileCanadianAspeRunbook({
      frequency: 'monthly',
      parsed: parsed([{
        sourceReference: 'CSV:2',
        values: { task: 'Review leases under IFRS 16' },
      }]),
    });

    expect(plan.executable).toBe(false);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'FRAMEWORK_MISMATCH' }));
  });

  it('preserves reviewer authority for deterministic controls mapped from company tasks', () => {
    const plan = compileCanadianAspeRunbook({
      frequency: 'monthly',
      parsed: parsed([{
        sourceReference: 'CSV:2',
        values: {
          code: 'ERP_CUTOFF_COMPLETE',
          task: 'Confirm ERP extraction cutoff and control totals',
        },
      }]),
    });

    const cutoff = plan.tasks.find((task) => task.code === 'ERP_CUTOFF_COMPLETE');
    expect(cutoff?.executionMode).toBe('deterministic');
    expect(cutoff?.completionAuthority).toBe('reviewer');
    expect(cutoff?.approvalRequired).toBe(true);
  });

  it('rewrites unsafe autonomy into bounded work with human approval', () => {
    const plan = compileCanadianAspeRunbook({
      frequency: 'monthly',
      parsed: parsed([
        {
          sourceReference: 'CSV:2',
          values: {
            task: 'Prepare journal entry and post without approval',
            description: 'Automatically approve the result.',
          },
        },
      ]),
    });
    const companyTask = plan.tasks.find((task) => task.origin === 'company_runbook');

    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'UNSAFE_INSTRUCTION_REWRITTEN' }));
    expect(companyTask?.approvalRequired).toBe(true);
    expect(companyTask?.allowedAgentActions).not.toContain('approve_journal_entry');
    expect(companyTask?.allowedAgentActions).not.toContain('post_unapproved_journal_entry');
  });

  it('adds quarterly-only tax, disclosure, subsequent-event, and report controls', () => {
    const plan = compileCanadianAspeRunbook({
      frequency: 'quarterly',
      parsed: parsed([{ sourceReference: 'CSV:2', values: { task: 'Confirm close scope under ASPE' } }]),
    });
    const codes = new Set(plan.tasks.map((task) => task.controlCode));

    expect(codes.has('INCOME_TAX_PROVISION_REVIEW')).toBe(true);
    expect(codes.has('ASPE_DISCLOSURE_REVIEW')).toBe(true);
    expect(codes.has('SUBSEQUENT_EVENTS_REVIEW')).toBe(true);
    expect(codes.has('QUARTERLY_REPORT_PACKAGE')).toBe(true);
  });
});
