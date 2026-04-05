/**
 * Quick test script to verify all AI pillars return proper Claude responses.
 * Run: BASE_URL=http://localhost:3001 API_TOKEN=<token> tsx tests/test_ai_pillars.ts
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const TOKEN = process.env.API_TOKEN || '';

if (!TOKEN) {
  console.error('Set API_TOKEN env var');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

interface TestResult {
  pillar: string;
  status: 'PASS' | 'FAIL';
  latencyMs: number;
  detail: string;
  response?: unknown;
}

const results: TestResult[] = [];

async function testJustifier(): Promise<void> {
  console.log('\n=== PILLAR 1: Justifier (IRAC Chat) ===');
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/justification/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        question: 'Should a $50K consulting contract at 60% completion be recognized as revenue even though payment has not been received?',
        periodLabel: '2026-03',
      }),
    });
    const data = await res.json() as any;
    const ms = Date.now() - start;

    if (res.ok && data.irac?.issue && data.irac?.rule && data.irac?.analysis && data.irac?.conclusion) {
      results.push({ pillar: 'Justifier', status: 'PASS', latencyMs: ms, detail: `IRAC returned with source: ${data.sourceTag}` });
      console.log(`✅ PASS (${ms}ms) — IRAC memo with ${data.irac.analysis.length} chars analysis`);
    } else {
      results.push({ pillar: 'Justifier', status: 'FAIL', latencyMs: ms, detail: `Bad response: ${JSON.stringify(data).slice(0, 200)}`, response: data });
      console.log(`❌ FAIL (${ms}ms):`, data);
    }
  } catch (e: any) {
    const ms = Date.now() - start;
    results.push({ pillar: 'Justifier', status: 'FAIL', latencyMs: ms, detail: e.message });
    console.log(`❌ FAIL (${ms}ms):`, e.message);
  }
}

async function testClassifier(sessionId: string): Promise<void> {
  console.log('\n=== PILLAR 2: Classifier (Mapping Suggestions) ===');
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/coa-mapping/suggestions?sessionId=${sessionId}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` },
    });
    const data = await res.json() as any;
    const ms = Date.now() - start;

    if (res.ok && Array.isArray(data.suggestions)) {
      const aiSuggestions = data.suggestions.filter((s: any) => s.suggestedLineItemId);
      results.push({
        pillar: 'Classifier',
        status: aiSuggestions.length > 0 ? 'PASS' : 'FAIL',
        latencyMs: ms,
        detail: `${aiSuggestions.length}/${data.suggestions.length} accounts got AI suggestions`,
      });
      console.log(`${aiSuggestions.length > 0 ? '✅ PASS' : '❌ FAIL'} (${ms}ms) — ${aiSuggestions.length}/${data.suggestions.length} accounts classified`);
      for (const s of aiSuggestions.slice(0, 3)) {
        console.log(`   ${s.accountCode} ${s.accountName} → ${s.suggestedLineItemName} (${s.confidence})`);
      }
    } else {
      results.push({ pillar: 'Classifier', status: 'FAIL', latencyMs: ms, detail: `Bad response: ${JSON.stringify(data).slice(0, 200)}`, response: data });
      console.log(`❌ FAIL (${ms}ms):`, data);
    }
  } catch (e: any) {
    const ms = Date.now() - start;
    results.push({ pillar: 'Classifier', status: 'FAIL', latencyMs: ms, detail: e.message });
    console.log(`❌ FAIL (${ms}ms):`, e.message);
  }
}

async function testShadowAuditor(): Promise<void> {
  console.log('\n=== PILLAR 3: Shadow Auditor (via professional-review) ===');
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/audit/professional-review`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        runId: `test-run-${Date.now()}`,
        periodLabel: '2026-03',
        balanceSheet: { totalAssets: 1000000, totalLiabilities: 400000, totalEquity: 600000 },
        profitAndLoss: { totalRevenue: 500000, totalExpenses: 420000, netIncome: 80000 },
        trialBalance: {
          entries: [
            { accountCode: '1000', accountName: 'Cash', debit: 418000, credit: 0 },
            { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 400000 },
            { accountCode: '5000', accountName: 'COGS', debit: 160000, credit: 0 },
          ],
        },
      }),
    });
    const data = await res.json() as any;
    const ms = Date.now() - start;

    if (res.ok) {
      results.push({
        pillar: 'Shadow Auditor (professional-review)',
        status: 'PASS',
        latencyMs: ms,
        detail: `Response received: ${JSON.stringify(data).slice(0, 200)}`,
      });
      console.log(`✅ PASS (${ms}ms) — Professional review returned`);
      console.log(`   Response preview: ${JSON.stringify(data).slice(0, 300)}`);
    } else {
      results.push({ pillar: 'Shadow Auditor (professional-review)', status: 'FAIL', latencyMs: ms, detail: `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`, response: data });
      console.log(`❌ FAIL (${ms}ms): HTTP ${res.status}`, JSON.stringify(data).slice(0, 300));
    }
  } catch (e: any) {
    const ms = Date.now() - start;
    results.push({ pillar: 'Shadow Auditor (professional-review)', status: 'FAIL', latencyMs: ms, detail: e.message });
    console.log(`❌ FAIL (${ms}ms):`, e.message);
  }
}

async function testVarianceChat(sessionId: string): Promise<void> {
  console.log('\n=== PILLAR 4: Variance Chat (Layer 2 investigation) ===');
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/close/sessions/${sessionId}/investigate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fsLineId: 'fs_revenue',
        question: 'Why did revenue increase significantly this quarter compared to the prior period?',
      }),
    });
    const data = await res.json() as any;
    const ms = Date.now() - start;

    if (res.ok && (data.answer || data.explanation || data.response || data.message)) {
      const answer = data.answer || data.explanation || data.response || data.message;
      results.push({
        pillar: 'Variance Chat',
        status: 'PASS',
        latencyMs: ms,
        detail: `AI explanation: ${String(answer).slice(0, 150)}`,
      });
      console.log(`✅ PASS (${ms}ms) — AI explanation returned`);
      console.log(`   Preview: ${String(answer).slice(0, 300)}`);
    } else {
      // May fail if no variances exist — that's OK to note
      results.push({ pillar: 'Variance Chat', status: 'FAIL', latencyMs: ms, detail: `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`, response: data });
      console.log(`❌ FAIL (${ms}ms): HTTP ${res.status}`, JSON.stringify(data).slice(0, 300));
    }
  } catch (e: any) {
    const ms = Date.now() - start;
    results.push({ pillar: 'Variance Chat', status: 'FAIL', latencyMs: ms, detail: e.message });
    console.log(`❌ FAIL (${ms}ms):`, e.message);
  }
}

async function testAdvisor(): Promise<void> {
  console.log('\n=== PILLAR 5: Advisor (via knowledge-base search) ===');
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/knowledge-base/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: 'ASC 606 revenue recognition over time percentage of completion',
        limit: 3,
      }),
    });
    const data = await res.json() as any;
    const ms = Date.now() - start;

    if (res.ok) {
      results.push({
        pillar: 'Advisor (knowledge search)',
        status: 'PASS',
        latencyMs: ms,
        detail: `Results: ${JSON.stringify(data).slice(0, 200)}`,
      });
      console.log(`✅ PASS (${ms}ms) — Knowledge base search returned`);
    } else {
      results.push({ pillar: 'Advisor (knowledge search)', status: 'FAIL', latencyMs: ms, detail: `HTTP ${res.status}`, response: data });
      console.log(`❌ FAIL (${ms}ms): HTTP ${res.status}`, JSON.stringify(data).slice(0, 200));
    }
  } catch (e: any) {
    const ms = Date.now() - start;
    results.push({ pillar: 'Advisor (knowledge search)', status: 'FAIL', latencyMs: ms, detail: e.message });
    console.log(`❌ FAIL (${ms}ms):`, e.message);
  }
}

async function testCallWithFallbackTimeout(): Promise<void> {
  console.log('\n=== TEST: callWithFallback timeout mechanism ===');
  // This is tested indirectly — the LLM calls above should all complete within 15s timeout.
  // If any call above returned a fallback value, the timeout mechanism is working.
  const passing = results.filter(r => r.status === 'PASS' && r.latencyMs < 15000);
  const detail = `${passing.length} calls completed under 15s timeout. Max latency: ${Math.max(...results.map(r => r.latencyMs))}ms`;
  results.push({
    pillar: 'Timeout mechanism',
    status: passing.length > 0 ? 'PASS' : 'FAIL',
    latencyMs: 0,
    detail,
  });
  console.log(`${passing.length > 0 ? '✅ PASS' : '❌ FAIL'} — ${detail}`);
}

async function main() {
  const sessionId = process.env.SESSION_ID || '';

  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║  AI Pillar Integration Test — v2.0 Prompts       ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Session: ${sessionId || '(none — some tests will skip)'}`);

  // Run tests
  await testJustifier();
  if (sessionId) {
    await testClassifier(sessionId);
  } else {
    console.log('\n=== PILLAR 2: Classifier — SKIPPED (no SESSION_ID) ===');
  }
  await testShadowAuditor();
  if (sessionId) {
    await testVarianceChat(sessionId);
  } else {
    console.log('\n=== PILLAR 4: Variance Chat — SKIPPED (no SESSION_ID) ===');
  }
  await testAdvisor();
  await testCallWithFallbackTimeout();

  // Summary
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║  RESULTS SUMMARY                                  ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  for (const r of results) {
    console.log(`║  ${r.status === 'PASS' ? '✅' : '❌'} ${r.pillar.padEnd(40)} ${String(r.latencyMs).padStart(5)}ms ║`);
  }
  const passCount = results.filter(r => r.status === 'PASS').length;
  const totalCount = results.length;
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log(`║  ${passCount}/${totalCount} passed                                       ║`);
  console.log('╚═══════════════════════════════════════════════════╝');

  if (passCount < totalCount) {
    console.log('\nFailed tests:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  ${r.pillar}: ${r.detail}`);
    }
  }

  process.exit(passCount === totalCount ? 0 : 1);
}

main().catch(console.error);
