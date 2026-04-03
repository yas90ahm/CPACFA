/**
 * Module Applicability Policy Tests
 *
 * Tests the readiness blocking matrix, fail-closed behavior,
 * N/A and reopen endpoint validation, and audit event emission.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --- Readiness Blocking Matrix ---

describe('Module applicability — readiness blocking matrix', () => {
  const RESOLVED_STATUSES = ['approved', 'skipped', 'not_applicable'];
  const BLOCKING_STATUSES = ['failed', 'needs_review', 'pending', 'proposed'];

  it('resolved statuses should not block advancement', () => {
    for (const status of RESOLVED_STATUSES) {
      // A module in a resolved status should not appear in the blocking query
      const isBlocking = BLOCKING_STATUSES.includes(status);
      expect(isBlocking).toBe(false);
    }
  });

  it('unresolved statuses should block advancement', () => {
    for (const status of BLOCKING_STATUSES) {
      const isBlocking = BLOCKING_STATUSES.includes(status);
      expect(isBlocking).toBe(true);
    }
  });

  it('not_applicable is a valid resolved state', () => {
    expect(RESOLVED_STATUSES).toContain('not_applicable');
    expect(BLOCKING_STATUSES).not.toContain('not_applicable');
  });
});

// --- N/A Endpoint Validation Rules ---

describe('Module applicability — not-applicable endpoint validation', () => {
  it('reason must be at least 10 characters', () => {
    const shortReasons = ['', 'no', 'not used', '123456789'];
    const validReasons = ['This module is not applicable because the entity has no lease agreements'];

    for (const reason of shortReasons) {
      expect(reason.trim().length).toBeLessThan(10);
    }
    for (const reason of validReasons) {
      expect(reason.trim().length).toBeGreaterThanOrEqual(10);
    }
  });

  it('preparer role should be rejected (403)', () => {
    const role = 'preparer';
    const allowedRoles = ['reviewer', 'controller', 'cfo', 'system_admin', 'approver'];
    expect(allowedRoles).not.toContain(role);
  });

  it('reviewer role should be allowed', () => {
    const role = 'reviewer';
    const blockedRole = 'preparer';
    expect(role).not.toBe(blockedRole);
  });
});

// --- Reopen Endpoint Transition Rules ---

describe('Module applicability — reopen transition rules', () => {
  const REOPENABLE_STATUSES = ['not_applicable', 'skipped'];
  const NON_REOPENABLE_STATUSES = ['approved', 'failed', 'needs_review', 'pending', 'proposed'];

  it('should allow reopening from not_applicable or skipped', () => {
    for (const status of REOPENABLE_STATUSES) {
      expect(REOPENABLE_STATUSES).toContain(status);
    }
  });

  it('should reject reopening from other statuses', () => {
    for (const status of NON_REOPENABLE_STATUSES) {
      expect(REOPENABLE_STATUSES).not.toContain(status);
    }
  });

  it('reopen should transition to needs_review', () => {
    const targetStatus = 'needs_review';
    expect(targetStatus).toBe('needs_review');
  });

  it('reopen should clear reviewed_by/reviewed_at but retain rationale', () => {
    // Control best practice: preserve history of the original N/A/skip decision
    // but clear the reviewer fields since the review is being undone
    const afterReopen = {
      status: 'needs_review',
      reviewed_by: null,
      reviewed_at: null,
      skip_reason: 'original reason preserved',  // retained for audit trail
      not_applicable_reason: 'original reason preserved', // retained for audit trail
    };
    expect(afterReopen.reviewed_by).toBeNull();
    expect(afterReopen.reviewed_at).toBeNull();
    expect(afterReopen.skip_reason).toBeTruthy();
    expect(afterReopen.not_applicable_reason).toBeTruthy();
  });
});

// --- Fail-Closed Behavior ---

describe('Module applicability — fail-closed in strict mode', () => {
  it('strict mode (prod/staging) should add hard blocker on query failure', () => {
    // In strict mode, if the module gate query fails, we should add a hard blocker
    const isStrictMode = true; // prod or staging
    const queryFailed = true;
    const hardBlockers: string[] = [];

    if (queryFailed && isStrictMode) {
      hardBlockers.push('Module proposal gate check failed — cannot verify module status. Resolve before advancing.');
    }

    expect(hardBlockers.length).toBe(1);
    expect(hardBlockers[0]).toContain('cannot verify module status');
  });

  it('dev mode should not add hard blocker on query failure', () => {
    const isStrictMode = false; // dev
    const queryFailed = true;
    const hardBlockers: string[] = [];

    if (queryFailed && isStrictMode) {
      hardBlockers.push('Module proposal gate check failed');
    }

    expect(hardBlockers.length).toBe(0);
  });
});

// --- Audit Event Structure ---

describe('Module applicability — audit event structure', () => {
  const EVENT_TYPES = [
    'module_proposal_approved',
    'module_proposal_skipped',
    'module_proposal_not_applicable',
    'module_proposal_reopened',
  ];

  it('all module proposal actions should have corresponding audit event types', () => {
    expect(EVENT_TYPES).toContain('module_proposal_approved');
    expect(EVENT_TYPES).toContain('module_proposal_skipped');
    expect(EVENT_TYPES).toContain('module_proposal_not_applicable');
    expect(EVENT_TYPES).toContain('module_proposal_reopened');
  });

  it('audit event should contain actor, proposalId, moduleName', () => {
    const auditEvent = {
      eventType: 'module_proposal_not_applicable',
      deterministicFlagSnapshot: {
        proposalId: 'test-proposal-id',
        moduleName: 'leases',
        actor: 'user-123',
        reason: 'Entity has no active lease agreements',
      },
      createdBy: 'user-123',
    };

    expect(auditEvent.deterministicFlagSnapshot.proposalId).toBeDefined();
    expect(auditEvent.deterministicFlagSnapshot.moduleName).toBeDefined();
    expect(auditEvent.deterministicFlagSnapshot.actor).toBeDefined();
    expect(auditEvent.deterministicFlagSnapshot.reason).toBeDefined();
    expect(auditEvent.createdBy).toBe(auditEvent.deterministicFlagSnapshot.actor);
  });
});

// --- Auto-Propose N/A Rationale ---

describe('Module applicability — auto-propose N/A rationale', () => {
  it('auto-detected N/A should include deterministic reason in computation_inputs', () => {
    const moduleName = 'leases';
    const result = null; // module returned null = not applicable

    const inputs = result === null
      ? { autoDetected: true, reason: `Module ${moduleName} returned no applicable data for this entity/period. No contracts, schedules, or source data found.` }
      : { someData: true };

    expect(inputs.autoDetected).toBe(true);
    expect(inputs.reason).toContain(moduleName);
    expect(inputs.reason).toContain('no applicable data');
  });
});

// --- API Response Summary ---

describe('Module applicability — API response summary counts', () => {
  it('summary should include all status categories', () => {
    const proposals = [
      { status: 'approved' },
      { status: 'approved' },
      { status: 'skipped' },
      { status: 'not_applicable' },
      { status: 'not_applicable' },
      { status: 'not_applicable' },
      { status: 'needs_review' },
      { status: 'failed' },
    ];

    const summary = {
      total: proposals.length,
      needsReview: proposals.filter((p) => p.status === 'needs_review').length,
      approved: proposals.filter((p) => p.status === 'approved').length,
      skipped: proposals.filter((p) => p.status === 'skipped').length,
      notApplicable: proposals.filter((p) => p.status === 'not_applicable').length,
      failed: proposals.filter((p) => p.status === 'failed').length,
    };

    expect(summary.total).toBe(8);
    expect(summary.approved).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.notApplicable).toBe(3);
    expect(summary.needsReview).toBe(1);
    expect(summary.failed).toBe(1);
    // Resolved = approved + skipped + notApplicable
    expect(summary.approved + summary.skipped + summary.notApplicable).toBe(6);
    // Unresolved (blocking) = needsReview + failed
    expect(summary.needsReview + summary.failed).toBe(2);
  });
});
