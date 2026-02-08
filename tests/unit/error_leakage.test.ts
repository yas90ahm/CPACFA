/**
 * Error leakage hardening: 500 responses never include stack traces, SQL details,
 * internal error messages, or file paths.
 *
 * A) Force internal error in a route, assert response body does not contain:
 *    - "stack", "Error:", "at ", "SELECT", ".ts:"
 * B) Assert status is 500 and code is stable (INTERNAL).
 */

import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { send500, STANDARD_500_BODY } from '../../src/lib/errorHandler.js';
import { requestIdMiddleware } from '../../src/middleware/requestId.js';

describe('Error leakage hardening', () => {
  it('send500 returns standard body; never leaks err.message, stack, SQL, or file paths', () => {
    const app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);

    app.post('/test-error', (_req, res) => {
      const err = new Error('SELECT * FROM users WHERE password = "secret"');
      (err as Error & { stack?: string }).stack =
        'Error: SELECT * FROM users\n    at Object.<anonymous> (src/routes/auth.ts:42:15)\n    at Layer.handle';
      send500(res, err, 'Test label');
    });

    return request(app)
      .post('/test-error')
      .set('Content-Type', 'application/json')
      .send({})
      .then((res) => {
        expect(res.status).toBe(500);
        expect(res.body).toMatchObject({
          error: 'Internal Server Error',
          code: 'INTERNAL',
          message: 'Unexpected error',
        });
        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain('stack');
        expect(bodyStr).not.toContain('Error:');
        expect(bodyStr).not.toContain('at ');
        expect(bodyStr).not.toContain('SELECT');
        expect(bodyStr).not.toContain('.ts:');
      });
  });

  it('STANDARD_500_BODY has stable shape', () => {
    expect(STANDARD_500_BODY).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL',
      message: 'Unexpected error',
    });
  });

  it('500 from route with internal throw does not leak stack or SQL', async () => {
    const app = express();
    app.use(express.json());
    app.post('/throw', (_req, res, next) => {
      next(new Error('Connection failed: SELECT * FROM tenant_secrets WHERE id = $1'));
    });
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      send500(res, err, 'Internal server error');
    });

    const res = await request(app)
      .post('/throw')
      .set('Content-Type', 'application/json')
      .send({})
      .expect('Content-Type', /json/)
      .expect(500);
    expect(res.body).toMatchObject({ error: 'Internal Server Error', code: 'INTERNAL', message: 'Unexpected error' });
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('SELECT');
    expect(bodyStr).not.toContain('tenant_secrets');
    expect(bodyStr).not.toContain('Connection failed');
  });
});
