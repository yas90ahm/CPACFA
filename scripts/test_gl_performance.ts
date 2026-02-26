/**
 * Generate large GL test CSV files for performance testing.
 * Run: npx tsx scripts/test_gl_performance.ts
 *
 * Then upload via POST /api/gl/ingest?period=2024-Q1-PERF and check perfMetrics.
 */

import fs from 'fs';
import path from 'path';

function generateLargeGLCSV(numLines: number, filename: string): void {
  const lines: string[] = [];
  lines.push('entry_id,entry_date,account_code,debit,credit,description');

  const numEntries = Math.floor(numLines / 2.5); // ~2.5 lines per entry average

  for (let i = 1; i <= numEntries; i++) {
    const entryId = `JE-${String(i).padStart(6, '0')}`;
    const date = '2024-03-15';

    const linesPerEntry = Math.random() > 0.5 ? 2 : 3;

    if (linesPerEntry === 2) {
      const amount = Math.floor(Math.random() * 100000) + 1000;
      lines.push(`${entryId},${date},1000,${amount},0,Test transaction ${i}`);
      lines.push(`${entryId},${date},4000,0,${amount},Test transaction ${i}`);
    } else {
      const amount1 = Math.floor(Math.random() * 50000) + 1000;
      const amount2 = Math.floor(Math.random() * 50000) + 1000;
      lines.push(`${entryId},${date},1000,${amount1 + amount2},0,Test transaction ${i}`);
      lines.push(`${entryId},${date},4000,0,${amount1},Test transaction ${i}`);
      lines.push(`${entryId},${date},5000,0,${amount2},Test transaction ${i}`);
    }
  }

  const dir = path.join(process.cwd(), 'test_data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, lines.join('\n'));
  console.log(`Generated ${filepath} with ${lines.length - 1} lines`);
}

// Generate test files
generateLargeGLCSV(1000, 'gl_perf_1k.csv');
generateLargeGLCSV(5000, 'gl_perf_5k.csv');
generateLargeGLCSV(10000, 'gl_perf_10k.csv');
generateLargeGLCSV(30000, 'gl_perf_30k.csv');

console.log('\nPerformance test files generated.');
console.log('Upload via POST /api/gl/ingest?period=2024-Q1-PERF and check perfMetrics in response.');
console.log('Target: 5K lines <10s, 30K lines <45s total.');
