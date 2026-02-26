/**
 * Runs before any test file is loaded so server.ts does not call start() when imported.
 * Load root .env so DATABASE_URL (and other vars) are available when running from tests/.
 * Set cwd to project root so src/db finds migrations/ (not tests/migrations).
 */
import path from 'path';
import fs from 'fs';

const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

const rootEnv = path.join(projectRoot, '.env');
if (fs.existsSync(rootEnv)) {
  const content = fs.readFileSync(rootEnv, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    }
  }
}

if (process.env.TEST_AUTH_PRODUCTION !== '1') {
  process.env.NODE_ENV = 'test';
  // Force AI mocks so integration tests never call live LLMs (deterministic, no timeouts).
  process.env.AI_MOCK = 'true';
  process.env.AI_MOCK_CLASSIFIER = 'true';
  process.env.AI_MOCK_ADVISOR = 'true';
}

// CI: never silently skip — require DATABASE_URL and fail hard if missing
if (process.env.CI === 'true') {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      'CI: DATABASE_URL is required for integration tests. Set it in the environment or run db:reset first.'
    );
    process.exit(1);
  }
} else if (!process.env.DATABASE_URL?.trim()) {
  console.warn(
    'DATABASE_URL not set; integration tests requiring a database will be skipped. Set DATABASE_URL to run them.'
  );
}
