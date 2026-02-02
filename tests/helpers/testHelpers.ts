/**
 * Test helpers for integration tests
 */

import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

interface TestTenant {
  id: string;
  name: string;
  pool: Pool;
}

const testTenants: Map<string, TestTenant> = new Map();

/**
 * Create a test tenant with isolated database
 */
export async function createTestTenant(): Promise<TestTenant> {
  const tenantId = `test_${uuidv4()}`;
  const tenantName = `Test Tenant ${tenantId}`;
  
  // Create a pool for the test tenant
  const pool = new Pool({
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    database: process.env.TEST_DB_NAME || 'cpacfa_test',
    user: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
  });

  // Run migrations for test tenant
  await runMigrations(pool, tenantId);

  const tenant: TestTenant = {
    id: tenantId,
    name: tenantName,
    pool,
  };

  testTenants.set(tenantId, tenant);
  return tenant;
}

/**
 * Clean up test tenant data and connections
 */
export async function cleanupTestTenant(tenantId: string): Promise<void> {
  const tenant = testTenants.get(tenantId);
  if (!tenant) return;

  // Drop tenant schema
  await tenant.pool.query(`DROP SCHEMA IF EXISTS ${tenantId} CASCADE`);
  
  // Close pool
  await tenant.pool.end();
  
  testTenants.delete(tenantId);
}

/**
 * Run database migrations for a tenant
 */
async function runMigrations(pool: Pool, tenantId: string): Promise<void> {
  // Create tenant schema
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${tenantId}`);
  
  // Run migrations (simplified for testing)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${tenantId}.users (
      id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${tenantId}.stock_grants (
      id VARCHAR(255) PRIMARY KEY,
      grant_type VARCHAR(50) NOT NULL,
      grant_date DATE NOT NULL,
      quantity INT NOT NULL,
      grantee_id VARCHAR(255) NOT NULL,
      fair_value_per_share NUMERIC(10, 2),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  // Add more tables as needed for tests
}

/**
 * Generate a test authentication token
 */
export function getTestAuthToken(tenantId: string): string {
  const secret = process.env.JWT_SECRET || 'test_secret_key';
  
  return jwt.sign(
    {
      userId: 'test_user_123',
      tenantId,
      email: 'test@example.com',
    },
    secret,
    { expiresIn: '1h' }
  );
}

/**
 * Create a test user in the database
 */
export async function createTestUser(
  tenantId: string,
  email: string,
  password: string
): Promise<{ id: string; email: string }> {
  const tenant = testTenants.get(tenantId);
  if (!tenant) throw new Error('Tenant not found');

  const userId = uuidv4();
  const passwordHash = 'hashed_' + password; // Simplified for testing

  await tenant.pool.query(
    `INSERT INTO ${tenantId}.users (id, email, password_hash) VALUES ($1, $2, $3)`,
    [userId, email, passwordHash]
  );

  return { id: userId, email };
}

/**
 * Clean up all test tenants (for global teardown)
 */
export async function cleanupAllTestTenants(): Promise<void> {
  const tenantIds = Array.from(testTenants.keys());
  await Promise.all(tenantIds.map(cleanupTestTenant));
}
