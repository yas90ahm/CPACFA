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

/** Quote identifier for PostgreSQL (schema/table names); escapes double quotes. */
function quoteId(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/**
 * Create a test tenant with isolated database.
 * Uses DATABASE_URL when set (same as app); otherwise TEST_DB_* for local test DB.
 */
export async function createTestTenant(): Promise<TestTenant> {
  const tenantId = `test_${uuidv4()}`;
  const tenantName = `Test Tenant ${tenantId}`;

  const pool =
    process.env.DATABASE_URL?.trim()
      ? new Pool({ connectionString: process.env.DATABASE_URL.trim(), max: 5 })
      : new Pool({
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

  // Drop tenant schema (quoted: tenantId may contain hyphens from UUID)
  await tenant.pool.query(`DROP SCHEMA IF EXISTS ${quoteId(tenantId)} CASCADE`);
  
  // Close pool
  await tenant.pool.end();
  
  testTenants.delete(tenantId);
}

/**
 * Run database migrations for a tenant
 */
async function runMigrations(pool: Pool, tenantId: string): Promise<void> {
  const q = quoteId(tenantId);
  // Create tenant schema (quoted: tenantId may contain hyphens from UUID)
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${q}`);

  // Run migrations (simplified for testing)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${q}.users (
      id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${q}.stock_grants (
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
  return getTestAuthTokenWithRole(tenantId, undefined);
}

/**
 * Generate a test authentication token with a specific role (e.g. 'approver' for certify_close, period_lock).
 */
export function getTestAuthTokenWithRole(tenantId: string, role?: string): string {
  const secret = process.env.JWT_SECRET || 'test_secret_key';
  const payload: Record<string, unknown> = {
    userId: 'test_user_123',
    tenantId,
    email: 'test@example.com',
  };
  if (role) payload.role = role;
  return jwt.sign(payload as object, secret as string, { expiresIn: '1h' });
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
    `INSERT INTO ${quoteId(tenantId)}.users (id, email, password_hash) VALUES ($1, $2, $3)`,
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
