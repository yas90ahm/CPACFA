/**
 * API Client and Test Framework for UAT Suite
 */

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

export interface ApiResponse {
  status: number;
  body: any;
  headers: Headers;
  duration: number;
}

export class ApiClient {
  constructor(public baseUrl: string) {}

  async request(
    method: string,
    path: string,
    opts: {
      token?: string;
      tenantId?: string;
      body?: unknown;
      params?: Record<string, string>;
    } = {}
  ): Promise<ApiResponse> {
    const url = new URL(path, this.baseUrl);
    if (opts.params) {
      for (const [k, v] of Object.entries(opts.params)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {};
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
    if (opts.tenantId) headers['x-tenant-id'] = opts.tenantId;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const start = performance.now();
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const duration = Math.round(performance.now() - start);

    let body: any;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('json')) {
      body = await res.json();
    } else if (ct.includes('text') || ct.includes('html')) {
      body = await res.text();
    } else {
      body = Buffer.from(await res.arrayBuffer());
    }

    return { status: res.status, body, headers: res.headers, duration };
  }

  async get(path: string, opts: { token?: string; tenantId?: string; params?: Record<string, string> } = {}) {
    return this.request('GET', path, opts);
  }

  async post(path: string, body?: unknown, opts: { token?: string; tenantId?: string; params?: Record<string, string> } = {}) {
    return this.request('POST', path, { ...opts, body });
  }

  async patch(path: string, body?: unknown, opts: { token?: string; tenantId?: string } = {}) {
    return this.request('PATCH', path, { ...opts, body });
  }

  async put(path: string, body?: unknown, opts: { token?: string; tenantId?: string } = {}) {
    return this.request('PUT', path, { ...opts, body });
  }

  async delete(path: string, opts: { token?: string; tenantId?: string } = {}) {
    return this.request('DELETE', path, opts);
  }

  async uploadFile(
    path: string,
    csvContent: string,
    filename: string,
    opts: {
      token?: string;
      tenantId?: string;
      params?: Record<string, string>;
      fields?: Record<string, string>;
    } = {}
  ): Promise<ApiResponse> {
    const url = new URL(path, this.baseUrl);
    if (opts.params) {
      for (const [k, v] of Object.entries(opts.params)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }

    const formData = new FormData();
    formData.append('file', new Blob([csvContent], { type: 'text/csv' }), filename);
    if (opts.fields) {
      for (const [k, v] of Object.entries(opts.fields)) {
        formData.append(k, v);
      }
    }

    const headers: Record<string, string> = {};
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
    if (opts.tenantId) headers['x-tenant-id'] = opts.tenantId;

    const start = performance.now();
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: formData,
    });
    const duration = Math.round(performance.now() - start);

    let body: any;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('json')) {
      body = await res.json();
    } else if (ct.includes('text') || ct.includes('html')) {
      body = await res.text();
    } else {
      body = Buffer.from(await res.arrayBuffer());
    }

    return { status: res.status, body, headers: res.headers, duration };
  }
}

// ---------------------------------------------------------------------------
// Test Framework
// ---------------------------------------------------------------------------

export interface TestResult {
  id: string;
  group: string;
  name: string;
  passed: boolean;
  skipped: boolean;
  duration: number;
  error?: string;
  httpStatus?: number;
}

export class TestRunner {
  results: TestResult[] = [];
  private currentGroup = '';
  private groupIndex = 0;
  private testIndex = 0;
  private perfMetrics: Array<{ label: string; duration: number }> = [];

  group(name: string) {
    this.currentGroup = name;
    this.groupIndex++;
    this.testIndex = 0;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Group ${this.groupIndex}: ${name}`);
    console.log('='.repeat(60));
  }

  async test(name: string, fn: () => Promise<void>): Promise<TestResult> {
    this.testIndex++;
    const id = `${this.groupIndex}.${this.testIndex}`;
    const start = performance.now();
    try {
      await fn();
      const duration = Math.round(performance.now() - start);
      const result: TestResult = { id, group: this.currentGroup, name, passed: true, skipped: false, duration };
      this.results.push(result);
      console.log(`  \u2713 [${id}] ${name} (${duration}ms)`);
      return result;
    } catch (err: any) {
      const duration = Math.round(performance.now() - start);
      const error = err?.message ?? String(err);
      const result: TestResult = {
        id,
        group: this.currentGroup,
        name,
        passed: false,
        skipped: false,
        duration,
        error: error.slice(0, 500),
      };
      this.results.push(result);
      console.log(`  \u2717 [${id}] ${name} (${duration}ms)`);
      console.log(`         ${error.slice(0, 200)}`);
      return result;
    }
  }

  skip(name: string, reason: string): TestResult {
    this.testIndex++;
    const id = `${this.groupIndex}.${this.testIndex}`;
    const result: TestResult = {
      id,
      group: this.currentGroup,
      name,
      passed: false,
      skipped: true,
      duration: 0,
      error: `SKIPPED: ${reason}`,
    };
    this.results.push(result);
    console.log(`  - [${id}] ${name} (SKIPPED: ${reason})`);
    return result;
  }

  recordPerf(label: string, duration: number) {
    this.perfMetrics.push({ label, duration });
  }

  generateReport(): string {
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed && !r.skipped).length;
    const skipped = this.results.filter(r => r.skipped).length;
    const totalDuration = this.results.reduce((s, r) => s + r.duration, 0);

    const groups = [...new Set(this.results.map(r => r.group))];

    let md = `# UAT Test Report — Sovereign CPA Engine\n\n`;
    md += `**Generated:** ${new Date().toISOString()}\n`;
    md += `**Total Tests:** ${total} | **Passed:** ${passed} | **Failed:** ${failed} | **Skipped:** ${skipped}\n`;
    md += `**Pass Rate:** ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%\n`;
    md += `**Total Duration:** ${(totalDuration / 1000).toFixed(1)}s\n\n`;

    // Summary table
    md += `## Summary by Group\n\n`;
    md += `| # | Group | Passed | Failed | Skipped | Duration |\n`;
    md += `|---|-------|--------|--------|---------|----------|\n`;
    for (const g of groups) {
      const gr = this.results.filter(r => r.group === g);
      const gp = gr.filter(r => r.passed).length;
      const gf = gr.filter(r => !r.passed && !r.skipped).length;
      const gs = gr.filter(r => r.skipped).length;
      const gd = gr.reduce((s, r) => s + r.duration, 0);
      const idx = groups.indexOf(g) + 1;
      const icon = gf > 0 ? '\u2717' : '\u2713';
      md += `| ${idx} | ${icon} ${g} | ${gp} | ${gf} | ${gs} | ${(gd / 1000).toFixed(1)}s |\n`;
    }
    md += `\n`;

    // Failures detail
    const failures = this.results.filter(r => !r.passed && !r.skipped);
    if (failures.length > 0) {
      md += `## Failures (${failures.length})\n\n`;
      for (const f of failures) {
        md += `### [${f.id}] ${f.group} > ${f.name}\n`;
        md += `- **Duration:** ${f.duration}ms\n`;
        md += `- **Error:** \`${f.error}\`\n\n`;
      }
    }

    // Skipped detail
    const skippedTests = this.results.filter(r => r.skipped);
    if (skippedTests.length > 0) {
      md += `## Skipped Tests (${skippedTests.length})\n\n`;
      for (const s of skippedTests) {
        md += `- [${s.id}] ${s.group} > ${s.name} — ${s.error}\n`;
      }
      md += `\n`;
    }

    // Performance metrics
    if (this.perfMetrics.length > 0) {
      md += `## Performance Metrics\n\n`;
      md += `| Operation | Duration |\n`;
      md += `|-----------|----------|\n`;
      for (const p of this.perfMetrics) {
        md += `| ${p.label} | ${p.duration}ms |\n`;
      }
      md += `\n`;
    }

    // Full results table
    md += `## Full Test Results\n\n`;
    md += `| ID | Group | Test | Status | Duration | Error |\n`;
    md += `|----|-------|------|--------|----------|-------|\n`;
    for (const r of this.results) {
      const status = r.passed ? '\u2713 PASS' : r.skipped ? '- SKIP' : '\u2717 FAIL';
      const err = r.error ? r.error.slice(0, 80).replace(/\|/g, '\\|').replace(/\n/g, ' ') : '';
      md += `| ${r.id} | ${r.group} | ${r.name} | ${status} | ${r.duration}ms | ${err} |\n`;
    }
    md += `\n---\n*Report generated by UAT Runner*\n`;

    return md;
  }
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

export function assertStatus(res: ApiResponse, expected: number | number[], context?: string): void {
  const ok = Array.isArray(expected) ? expected.includes(res.status) : res.status === expected;
  if (!ok) {
    const ctx = context ? ` (${context})` : '';
    const body = typeof res.body === 'string' ? res.body.slice(0, 200) : JSON.stringify(res.body).slice(0, 200);
    throw new Error(`Expected status ${expected}, got ${res.status}${ctx}: ${body}`);
  }
}

export function assertHasField(obj: any, field: string, context?: string): void {
  if (obj == null || obj[field] === undefined) {
    const ctx = context ? ` (${context})` : '';
    throw new Error(`Missing field '${field}'${ctx} in: ${JSON.stringify(obj).slice(0, 200)}`);
  }
}
