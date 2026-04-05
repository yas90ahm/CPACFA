/**
 * Frontend Contract Drift Tests
 *
 * These tests verify that the frontend contract layer correctly validates,
 * normalizes, and rejects API response shapes. If the backend changes field
 * names, adds required fields, or changes enum values, these tests fail.
 */

import { describe, it, expect } from '@jest/globals';
import {
  SessionStatus, JEStatus, ProposalStatus, ReconStatus,
  MappingDisplayStatus, IssueStatus, VarianceExplanationStatus,
  isSessionTerminal, isSessionCertified, isJEPending, isJEBooked,
  isProposalResolved, isProposalBlocking,
  isReconComplete, isIssueOpen, isVarianceExplained,
} from '../../frontend/lib/contracts/statuses';
import {
  SessionSchema, ReadinessSchema, TBResponseSchema,
  JEListResponseSchema, ModuleProposalListSchema,
  ReconciliationSchema, VarianceSchema, IssueSchema,
} from '../../frontend/lib/contracts/schemas';
import { parseApiError, friendlyErrorMessage } from '../../frontend/lib/contracts/errors';

// ============================================================
// Status enum completeness
// ============================================================

describe('Status enums — completeness', () => {
  it('SessionStatus covers all workflow states', () => {
    expect(Object.values(SessionStatus)).toEqual(
      expect.arrayContaining(['open', 'in_progress', 'under_review', 'certified', 'locked'])
    );
  });

  it('JEStatus covers full lifecycle', () => {
    expect(Object.values(JEStatus)).toEqual(
      expect.arrayContaining(['draft', 'proposed', 'pending_approval', 'approved', 'posted', 'exported', 'rejected'])
    );
  });

  it('ProposalStatus covers all module states', () => {
    expect(Object.values(ProposalStatus)).toEqual(
      expect.arrayContaining(['needs_review', 'approved', 'skipped', 'not_applicable', 'failed'])
    );
  });

  it('ReconStatus includes reconciled', () => {
    expect(Object.values(ReconStatus)).toContain('reconciled');
  });
});

// ============================================================
// Status helper correctness
// ============================================================

describe('Status helpers — correctness', () => {
  it('isSessionTerminal identifies terminal states only', () => {
    expect(isSessionTerminal('certified')).toBe(false);
    expect(isSessionTerminal('locked')).toBe(true);
    expect(isSessionTerminal('in_progress')).toBe(false);
    expect(isSessionTerminal('under_review')).toBe(false);
    expect(isSessionTerminal('open')).toBe(false);
  });

  it('isSessionCertified identifies certified-or-later states', () => {
    expect(isSessionCertified('certified')).toBe(true);
    expect(isSessionCertified('subsequent_events_review')).toBe(true);
    expect(isSessionCertified('locked')).toBe(true);
    expect(isSessionCertified('in_progress')).toBe(false);
  });

  it('isJEPending matches only proposed/pending_approval', () => {
    expect(isJEPending('proposed')).toBe(true);
    expect(isJEPending('pending_approval')).toBe(true);
    expect(isJEPending('draft')).toBe(false);
    expect(isJEPending('posted')).toBe(false);
    expect(isJEPending('approved')).toBe(false);
  });

  it('isJEBooked matches only posted/exported', () => {
    expect(isJEBooked('posted')).toBe(true);
    expect(isJEBooked('exported')).toBe(true);
    expect(isJEBooked('approved')).toBe(false);
    expect(isJEBooked('draft')).toBe(false);
  });

  it('isProposalResolved vs isProposalBlocking are mutually exclusive', () => {
    for (const status of Object.values(ProposalStatus)) {
      const resolved = isProposalResolved(status);
      const blocking = isProposalBlocking(status);
      // Every status is either resolved or blocking, never both
      expect(resolved !== blocking).toBe(true);
    }
  });

  it('isReconComplete matches completed/approved/reconciled', () => {
    expect(isReconComplete('completed')).toBe(true);
    expect(isReconComplete('approved')).toBe(true);
    expect(isReconComplete('reconciled')).toBe(true);
    expect(isReconComplete('in_progress')).toBe(false);
    expect(isReconComplete('not_started')).toBe(false);
  });

  it('isIssueOpen matches open/active only', () => {
    expect(isIssueOpen('open')).toBe(true);
    expect(isIssueOpen('active')).toBe(true);
    expect(isIssueOpen('resolved')).toBe(false);
    expect(isIssueOpen('dismissed')).toBe(false);
  });
});

// ============================================================
// Zod schema validation — valid payloads pass
// ============================================================

describe('Schemas — valid payloads pass', () => {
  it('SessionSchema accepts valid session', () => {
    const valid = {
      id: 'abc-123',
      status: 'in_progress',
      periodLabel: 'January 2026',
      periodEnd: '2026-01-31',
      entityId: 'default',
    };
    expect(SessionSchema.safeParse(valid).success).toBe(true);
  });

  it('ReadinessSchema accepts valid readiness with label', () => {
    const valid = {
      gates: [{ id: 'tb_balanced', label: 'Trial Balance', passing: true }],
      gatesPassing: 1,
      gatesTotal: 1,
      canAdvance: true,
    };
    expect(ReadinessSchema.safeParse(valid).success).toBe(true);
  });

  it('ReadinessSchema accepts gates with name instead of label (backend format)', () => {
    const valid = {
      gates: [{ id: 'tb_balanced', name: 'Trial Balance Balanced', passing: true, description: 'Debits = Credits', category: 'hard' }],
      gatesPassing: 1,
      gatesTotal: 1,
      canAdvance: true,
    };
    expect(ReadinessSchema.safeParse(valid).success).toBe(true);
  });

  it('TBResponseSchema accepts valid TB with debitBalance fields', () => {
    const valid = {
      rows: [{
        accountCode: '1010',
        accountName: 'Cash',
        debitBalance: '1000.00',
        creditBalance: '0.00',
      }],
      totalDebits: '1000.00',
      totalCredits: '0.00',
      balanced: true,
    };
    expect(TBResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('JEListResponseSchema accepts journalEntries key', () => {
    const valid = {
      journalEntries: [{ id: 'je-1', status: 'posted' }],
    };
    expect(JEListResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('ModuleProposalListSchema accepts full summary', () => {
    const valid = {
      proposals: [{ id: 'p-1', moduleName: 'leases', status: 'not_applicable' }],
      summary: { total: 1, needsReview: 0, approved: 0, skipped: 0, notApplicable: 1, failed: 0 },
    };
    expect(ModuleProposalListSchema.safeParse(valid).success).toBe(true);
  });
});

// ============================================================
// Zod schema validation — missing/renamed fields fail
// ============================================================

describe('Schemas — missing required fields fail', () => {
  it('SessionSchema rejects missing id', () => {
    const invalid = { status: 'in_progress' };
    expect(SessionSchema.safeParse(invalid).success).toBe(false);
  });

  it('SessionSchema rejects missing status', () => {
    const invalid = { id: 'abc-123' };
    expect(SessionSchema.safeParse(invalid).success).toBe(false);
  });

  it('ReadinessSchema rejects missing gates', () => {
    const invalid = { gatesPassing: 1, gatesTotal: 1, canAdvance: true };
    expect(ReadinessSchema.safeParse(invalid).success).toBe(false);
  });

  it('ReadinessSchema rejects non-boolean gate.passing', () => {
    const invalid = {
      gates: [{ id: 'g1', label: 'Test', passing: 'yes' }],
      gatesPassing: 1, gatesTotal: 1, canAdvance: true,
    };
    expect(ReadinessSchema.safeParse(invalid).success).toBe(false);
  });

  it('ReconciliationSchema rejects missing accountCode', () => {
    const invalid = { accountName: 'Cash', glBalance: '100', variance: '0', status: 'completed' };
    expect(ReconciliationSchema.safeParse(invalid).success).toBe(false);
  });

  it('VarianceSchema rejects missing isMaterial', () => {
    const invalid = { id: 'v1', explanationStatus: 'explained' };
    expect(VarianceSchema.safeParse(invalid).success).toBe(false);
  });

  it('IssueSchema rejects missing severity', () => {
    const invalid = { id: 'i1', title: 'Test', status: 'open' };
    expect(IssueSchema.safeParse(invalid).success).toBe(false);
  });
});

// ============================================================
// Error handling
// ============================================================

describe('Error handling — structured codes', () => {
  it('maps known error codes to friendly messages', () => {
    const err = Object.assign(new Error('raw'), { code: 'PERIOD_LOCKED' });
    const parsed = parseApiError(err);
    expect(parsed.isKnown).toBe(true);
    expect(parsed.message).toContain('locked');
  });

  it('passes through raw message for unknown codes', () => {
    const err = new Error('Something weird happened');
    const parsed = parseApiError(err);
    expect(parsed.isKnown).toBe(false);
    expect(parsed.message).toBe('Something weird happened');
  });

  it('handles non-Error objects gracefully', () => {
    const msg = friendlyErrorMessage('string error');
    expect(msg).toBe('An unexpected error occurred.');
  });

  it('maps INSUFFICIENT_ROLE to permission message', () => {
    const err = Object.assign(new Error('forbidden'), { code: 'INSUFFICIENT_ROLE' });
    expect(parseApiError(err).message).toContain('permission');
  });

  it('maps SEGREGATION to SoD message', () => {
    const err = Object.assign(new Error('sod'), { code: 'SEGREGATION' });
    expect(parseApiError(err).message).toContain('different user');
  });
});

// ============================================================
// No fabricated control values
// ============================================================

describe('Contract safety — no fabricated control values', () => {
  it('SessionSchema does not default certifiedBy', () => {
    const session = SessionSchema.parse({ id: 'test', status: 'in_progress' });
    // certifiedBy should be undefined, not a hardcoded name
    expect(session.certifiedBy).toBeUndefined();
  });

  it('ReadinessSchema requires actual gate data', () => {
    // An empty readiness response should fail, not default to 11 gates
    const invalid = {};
    expect(ReadinessSchema.safeParse(invalid).success).toBe(false);
  });

  it('ProposalStatus.NOT_APPLICABLE is a real status, not a fabrication', () => {
    expect(ProposalStatus.NOT_APPLICABLE).toBe('not_applicable');
    expect(isProposalResolved('not_applicable')).toBe(true);
    expect(isProposalBlocking('not_applicable')).toBe(false);
  });
});
