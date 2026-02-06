/**
 * Jest setup file for integration tests
 */

import { beforeAll, afterAll } from '@jest/globals';
import { cleanupAllTestTenants } from './helpers/testHelpers.js';

// Set test environment variables (preserve NODE_ENV=production for auth bypass production tests)
if (process.env.TEST_AUTH_PRODUCTION !== '1') {
  process.env.NODE_ENV = 'test';
  process.env.REQUIRE_AUTH = 'false';
  // Ensure AI mocks are on so no test calls live LLMs (deterministic, no timeouts).
  process.env.AI_MOCK = 'true';
  process.env.AI_MOCK_CLASSIFIER = 'true';
  process.env.AI_MOCK_ADVISOR = 'true';
}
process.env.JWT_SECRET = 'test_secret_key_for_testing_only';
process.env.TEST_DB_HOST = process.env.TEST_DB_HOST || 'localhost';
process.env.TEST_DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.TEST_DB_NAME = process.env.TEST_DB_NAME || 'cpacfa_test';
process.env.TEST_DB_USER = process.env.TEST_DB_USER || 'postgres';
process.env.TEST_DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'postgres';

// Timeout for global hooks when DATABASE_URL is set (schema verification + pool init can exceed default 5s)
const GLOBAL_SETUP_TIMEOUT_MS = 20000;

// Global setup: when DATABASE_URL is set, verify schema before running tests (fail fast if tables missing)
beforeAll(async () => {
  if (process.env.DATABASE_URL?.trim()) {
    const { getControlPool } = await import('../src/db/index.js');
    const { verifySchema } = await import('../src/db/schema_verify.js');
    const pool = getControlPool();
    const result = await verifySchema(pool);
    if (!result.ok) {
      throw new Error(`Schema verification failed: ${result.errors.join('; ')}. Run npm run db:migrate or npm run db:reset.`);
    }
  }
  console.log('Starting test suite...');
}, GLOBAL_SETUP_TIMEOUT_MS);

// Global teardown: close DB pools so Jest exits cleanly (no open handles)
afterAll(async () => {
  await cleanupAllTestTenants();
  if (process.env.DATABASE_URL?.trim()) {
    const { closePool } = await import('../src/db/index.js');
    await closePool();
  }
  console.log('Test suite complete. All test tenants cleaned up.');
}, GLOBAL_SETUP_TIMEOUT_MS);

// Increase timeout for integration tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).jest?.setTimeout(30000);
