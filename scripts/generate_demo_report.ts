/**
 * Generates the CloudMetrics demo report HTML with embedded JSON from demo_report_runner.
 * Run: npx ts-node scripts/generate_demo_report.ts
 * Output: docs/CLOUDMETRICS_DEMO_REPORT.html (with data embedded)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const root = path.resolve(__dirname, '..');
const outputPath = path.join(root, 'docs', 'CLOUDMETRICS_DEMO_REPORT.html');

// Run demo_report_runner and capture JSON
const runnerPath = path.join(root, 'scripts', 'demo_report_runner.ts');
const json = execSync(`npx ts-node "${runnerPath}"`, {
  encoding: 'utf8',
  cwd: root,
});

const data = json.trim();
let html = fs.readFileSync(outputPath, 'utf8');

html = html.replace('__DEMO_DATA_PLACEHOLDER__', data);

fs.writeFileSync(outputPath, html);
console.log('Generated:', outputPath);
