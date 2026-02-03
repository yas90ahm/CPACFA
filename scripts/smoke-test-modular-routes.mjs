/**
 * Smoke test for modularized trial-balance and cfo-dashboard routes.
 * Run: node scripts/smoke-test-modular-routes.mjs
 * Requires server to be running on PORT (default 3001), or set BASE_URL.
 */

import http from 'node:http';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

function request(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request(
      { method, hostname: url.hostname, port: url.port || 80, path: url.pathname + url.search },
      (res) => {
        let body = '';
        res.on('data', (ch) => (body += ch));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: body.slice(0, 200) }));
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.end();
  });
}

async function main() {
  const tests = [
    ['GET', '/api/cfo-dashboard/kpi-targets', (r) => r.statusCode === 200],
    ['GET', '/api/cfo-dashboard/scenarios', (r) => r.statusCode === 200],
    ['GET', '/api/trial-balance/supported', (r) => r.statusCode === 200],
  ];
  let passed = 0;
  let failed = 0;
  for (const [method, path, check] of tests) {
    try {
      const res = await request(method, path);
      const ok = check(res);
      if (ok) {
        console.log(`PASS ${method} ${path} -> ${res.statusCode}`);
        passed++;
      } else {
        console.log(`FAIL ${method} ${path} -> ${res.statusCode} (expected pass)`);
        failed++;
      }
    } catch (e) {
      console.log(`FAIL ${method} ${path} -> ${e.message}`);
      failed++;
    }
  }
  console.log('\n' + (failed === 0 ? `All ${passed} smoke tests passed.` : `${passed} passed, ${failed} failed.`));
  process.exit(failed > 0 ? 1 : 0);
}

main();
