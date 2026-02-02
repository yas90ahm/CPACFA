/**
 * Jest setup file for integration tests
 */

import { cleanupAllTestTenants } from './helpers/testHelpers.js';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_testing_only';
process.env.TEST_DB_HOST = process.env.TEST_DB_HOST || 'localhost';
process.env.TEST_DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.TEST_DB_NAME = process.env.TEST_DB_NAME || 'cpacfa_test';
process.env.TEST_DB_USER = process.env.TEST_DB_USER || 'postgres';
process.env.TEST_DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'postgres';

// Global setup
beforeAll(async () => {
  console.log('Starting test suite...');
});

// Global teardown
afterAll(async () => {
  await cleanupAllTestTenants();
  console.log('Test suite complete. All test tenants cleaned up.');
});

// Increase timeout for integration tests
jest.setTimeout(30000);
