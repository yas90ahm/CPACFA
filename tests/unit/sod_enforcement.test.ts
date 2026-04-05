/**
 * Segregation of duties (SoD): preparer ≠ approver enforcement.
 */

import assert from 'node:assert/strict';
import { canPerform } from '../../src/services/segregation_service.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('segregation of duties — role hierarchy', () => {
  it('preparer cannot perform approver-level actions', () => {
    assert.equal(canPerform('preparer', 'je_suggest_approve'), false);
    assert.equal(canPerform('preparer', 'je_post'), false);
    assert.equal(canPerform('preparer', 'certify_close'), false);
    assert.equal(canPerform('preparer', 'period_lock'), false);
  });

  it('reviewer can perform reviewer-level actions', () => {
    assert.equal(canPerform('reviewer', 'close_checklist_complete'), true);
    assert.equal(canPerform('reviewer', 'variance_confirm'), true);
  });

  it('reviewer cannot perform approver-level actions', () => {
    assert.equal(canPerform('reviewer', 'je_suggest_approve'), false);
    assert.equal(canPerform('reviewer', 'je_post'), false);
    assert.equal(canPerform('reviewer', 'certify_close'), false);
    assert.equal(canPerform('reviewer', 'period_lock'), false);
  });

  it('approver can perform all actions', () => {
    assert.equal(canPerform('approver', 'close_checklist_complete'), true);
    assert.equal(canPerform('approver', 'variance_confirm'), true);
    assert.equal(canPerform('approver', 'je_suggest_approve'), true);
    assert.equal(canPerform('approver', 'je_post'), true);
    assert.equal(canPerform('approver', 'certify_close'), true);
    assert.equal(canPerform('approver', 'period_lock'), true);
    assert.equal(canPerform('approver', 'audit_log_retention_purge'), true);
  });
});

describe('segregation of duties — critical actions require approver', () => {
  const criticalActions = [
    'je_suggest_approve',
    'je_post',
    'certify_close',
    'period_lock',
    'audit_log_retention_purge',
  ] as const;

  for (const action of criticalActions) {
    it(`${action} requires approver role`, () => {
      assert.equal(canPerform('preparer', action), false);
      assert.equal(canPerform('reviewer', action), false);
      assert.equal(canPerform('approver', action), true);
    });
  }
});

describe('segregation of duties — requireRole middleware', () => {
  it('requireRole middleware exists and exports factory function', async () => {
    const mod = await import('../../src/middleware/requireRole.js');
    assert.equal(typeof mod.requireRole, 'function');
  });

  it('requireRole returns middleware function with arity 3', async () => {
    const { requireRole } = await import('../../src/middleware/requireRole.js');
    const middleware = requireRole('admin');
    assert.equal(typeof middleware, 'function');
    assert.equal(middleware.length, 3);
  });

  it('requireRole rejects unauthorized role', async () => {
    const { requireRole } = await import('../../src/middleware/requireRole.js');
    const middleware = requireRole('admin');
    let statusCode = 0;
    let responseBody: any = null;
    const req = { role: 'preparer' } as any;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return { json: (body: any) => { responseBody = body; } };
      },
    } as any;
    const next = () => { throw new Error('next should not be called'); };
    middleware(req, res, next);
    assert.equal(statusCode, 403);
    assert.equal(responseBody.error, 'Forbidden');
  });

  it('requireRole allows authorized role', async () => {
    const { requireRole } = await import('../../src/middleware/requireRole.js');
    const middleware = requireRole('admin', 'approver');
    const req = { role: 'admin' } as any;
    const res = {} as any;
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    middleware(req, res, next);
    assert.equal(nextCalled, true);
  });
});

describe('segregation of duties — registration role restriction', () => {
  it('register schema does not allow admin or approver self-registration', async () => {
    const { registerSchema } = await import('../../src/schemas/authSchemas.js');

    const adminResult = registerSchema.safeParse({
      email: 'test@test.com',
      password: 'StrongPass1!',
      role: 'admin',
    });
    assert.equal(adminResult.success, false, 'admin role should be rejected');

    const approverResult = registerSchema.safeParse({
      email: 'test@test.com',
      password: 'StrongPass1!',
      role: 'approver',
    });
    assert.equal(approverResult.success, false, 'approver role should be rejected');

    const preparerResult = registerSchema.safeParse({
      email: 'test@test.com',
      password: 'StrongPass1!',
      role: 'preparer',
    });
    assert.equal(preparerResult.success, true, 'preparer role should be allowed');

    const accountantResult = registerSchema.safeParse({
      email: 'test@test.com',
      password: 'StrongPass1!',
      role: 'accountant',
    });
    assert.equal(accountantResult.success, true, 'accountant role should be allowed');
  });
});
