// @ts-nocheck — repository query mocks intentionally provide only mapped columns used by each case.
import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import {
  buildJournalTreatmentLinePattern,
  buildSafeMemoryContext,
  findMemoryMatchesForJournalEntry,
  matchAccountingMemoryToJournalEntry,
  normalizeAccountingMemoryTokens,
  sanitizeReusableAccountingRationale,
} from '../../src/services/accounting_memory_service.js';
import { insertApplication } from '../../src/db/repositories/accounting_memory_repository.js';
import type { AccountingMemory } from '../../src/types/accounting_memory.js';

function memoryFixture(): AccountingMemory {
  return {
    id: 'memory-1',
    tenantId: 'tenant-a',
    entityId: 'entity-a',
    framework: 'ASPE',
    memoryType: 'journal_treatment',
    status: 'approved',
    patternSignature: 'pattern-1',
    subject: {
      memoTokens: ['bonus', 'accrual'],
      originalSource: 'accrual',
      originalLinePattern: [
        { accountRef: 'bonus-expense', side: 'debit', descriptionTokens: [] },
        { accountRef: 'general-accrual', side: 'credit', descriptionTokens: [] },
      ],
    },
    treatment: {
      correctedMemo: 'Correct bonus accrual to payroll liability',
      correctedMemoTokens: ['bonus', 'accrual'],
      correctedLinePattern: [
        { accountRef: 'bonus-expense', side: 'debit', descriptionTokens: [] },
        { accountRef: 'payroll-liability', side: 'credit', descriptionTokens: [] },
      ],
      amountPolicy: 'recalculate_from_current_period_source',
      requiresCurrentPeriodEvidence: true,
      reusableAmountsStored: false,
    },
    rationale: 'Use the payroll liability; the prior amount was 12345.67.',
    applicability: 'recurring',
    memoryScope: 'transaction_pattern',
    effectiveFromPeriod: '2026-06',
    sourceCorrectionEventId: 'correction-1',
    approvedBy: 'controller@example.com',
    approvedAt: '2026-07-02T12:00:00.000Z',
    createdAt: '2026-07-02T12:00:00.000Z',
  };
}

describe('governed accounting correction memory', () => {
  it('normalizes away dates and numeric amounts while retaining accounting meaning', () => {
    expect(normalizeAccountingMemoryTokens('June 2026 bonus accrual $12,345.67 to payroll liability')).toEqual([
      'accrual',
      'bonus',
      'liability',
      'payroll',
    ]);
  });

  it('withholds spelled-out English and French prior-period quantities from model tokens', () => {
    expect(normalizeAccountingMemoryTokens(
      'Accrue twelve thousand dollars and douze mille dollars to payroll liability'
    )).toEqual(['accrue', 'dollars', 'liability', 'payroll']);
  });

  it('keeps reusable rationale but removes period-specific amounts and dates', () => {
    const sanitized = sanitizeReusableAccountingRationale(
      'At 2026-06-30, move $12,345.67 from account 2190 to the payroll liability.'
    );

    expect(sanitized).toContain('payroll liability');
    expect(sanitized).not.toMatch(/\d/);
    expect(sanitized).toContain('[current-period numeric fact omitted]');
  });

  it('stores reusable line structure only, never debit or credit amounts', () => {
    const pattern = buildJournalTreatmentLinePattern([
      { accountRef: '6100', debit: '12345.67', credit: '0.00', description: 'June bonus' },
      { accountRef: '2210', debit: '0.00', credit: '12345.67', description: 'Payroll accrual' },
    ]);

    expect(pattern).toEqual([
      { accountRef: '2210', side: 'credit', descriptionTokens: ['accrual', 'payroll'] },
      { accountRef: '6100', side: 'debit', descriptionTokens: ['bonus'] },
    ]);
    expect(JSON.stringify(pattern)).not.toContain('12345');
  });

  it('withholds raw corrected memos, rationale amounts, and every reusable amount from model context', () => {
    const context = buildSafeMemoryContext(memoryFixture());
    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain('12,345');
    expect(serialized).not.toContain('12345');
    expect(serialized).not.toContain('correctedMemo"');
    expect(context).toMatchObject({
      accountingGuardrails: {
        copyPriorAmounts: false,
        recalculateFromCurrentPeriodSource: true,
        currentPeriodEvidenceRequired: true,
        humanConfirmationRequired: true,
      },
      approvedTreatment: {
        amountPolicy: 'recalculate_from_current_period_source',
        reusableAmountsStored: false,
      },
    });
  });

  it('blocks the original treatment pattern and accepts the supervisor-corrected structure', () => {
    const memory = memoryFixture();
    const repeatedOriginal = matchAccountingMemoryToJournalEntry(
      memory,
      { memo: 'Monthly bonus accrual', source: 'accrual' },
      [
        { accountRef: 'bonus-expense', debit: '9000.00', credit: '0.00' },
        { accountRef: 'general-accrual', debit: '0.00', credit: '9000.00' },
      ]
    );
    const corrected = matchAccountingMemoryToJournalEntry(
      memory,
      { memo: 'Monthly bonus accrual', source: 'accrual' },
      [
        { accountRef: 'bonus-expense', debit: '9000.00', credit: '0.00' },
        { accountRef: 'payroll-liability', debit: '0.00', credit: '9000.00' },
      ]
    );

    expect(repeatedOriginal.relationship).toBe('conflict');
    expect(corrected.relationship).toBe('consistent');
  });

  it('queries approved memory with tenant, entity, and effective period boundaries', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await findMemoryMatchesForJournalEntry(pool, {
      tenantId: 'tenant-a',
      entityId: 'entity-a',
      periodLabel: '2026-07',
      journalEntry: { memo: 'Bonus accrual', source: 'accrual' },
      lines: [],
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $1 AND entity_id = $2'),
      ['tenant-a', 'entity-a', '2026-07']
    );
    expect(query.mock.calls[0][0]).toContain("applicability <> 'one_time'");
    expect(query.mock.calls[0][0]).toContain("framework = 'ASPE'");
  });

  it('uses insert-or-read idempotency without updating append-only application facts', async () => {
    const row = {
      id: 'application-1', tenant_id: 'tenant-a', entity_id: 'entity-a',
      close_session_id: 'session-a', memory_id: 'memory-1', target_type: 'runbook_task',
      target_id: 'task-a', task_execution_id: 'task-a', outcome: 'context_supplied',
      similarity: '1.0000', detail: {}, applied_by: 'system:test', created_at: '2026-07-02T12:00:00.000Z',
    };
    const query = jest.fn().mockResolvedValueOnce({ rows: [row] });
    const pool = { query } as unknown as Pool;

    await insertApplication(pool, {
      id: 'application-1', tenantId: 'tenant-a', entityId: 'entity-a',
      closeSessionId: 'session-a', memoryId: 'memory-1', targetType: 'runbook_task',
      targetId: 'task-a', taskExecutionId: 'task-a', outcome: 'context_supplied',
      similarity: 1, detail: {}, appliedBy: 'system:test',
    });

    expect(query.mock.calls[0][0]).toContain('DO NOTHING');
    expect(query.mock.calls[0][0]).not.toContain('DO UPDATE');
  });

  it('enforces tenant isolation, append-only facts, ASPE scope, and one active treatment in SQL', () => {
    const migration = readFileSync(
      join(process.cwd(), 'migrations/228_recursive_accounting_memory.sql'),
      'utf8'
    );

    expect(migration).toContain("CONSTRAINT chk_accounting_memory_framework CHECK (framework = 'ASPE')");
    expect(migration).toContain('chk_accounting_memory_reusable_rationale');
    expect(migration).toContain('chk_accounting_memory_terminal_resolution');
    expect(migration).toContain("COALESCE(treatment->>'correctedMemo', '') !~ '[0-9]'");
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_memory_active_pattern');
    expect(migration).toContain("WHERE status = 'approved'");
    expect(migration).toContain('ALTER TABLE core.accounting_memories ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE POLICY tenant_isolation_policy');
    expect(migration).toContain('accounting_correction_events_append_only');
    expect(migration).toContain('accounting_memory_applications_append_only');
    expect(migration).toContain('Accounting memories cannot be deleted; revoke or supersede them');
    expect(migration).toContain('Invalid accounting memory status transition');
  });
});
