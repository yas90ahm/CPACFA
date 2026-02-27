import Decimal from 'decimal.js';
import { getGroup1Scenarios } from './scenarios/group1-industries';
import { getGroup2Scenarios } from './scenarios/group2-aje';
import { getGroup3Scenarios } from './scenarios/group3-recon';
import { getGroup4Scenarios } from './scenarios/group4-variance';
import { getGroup5Scenarios } from './scenarios/group5-ties';
import { getGroup6Scenarios } from './scenarios/group6-precision';
import { getGroup7Scenarios } from './scenarios/group7-bad-data';

const all = [
  ...getGroup1Scenarios(),
  ...getGroup2Scenarios(),
  ...getGroup3Scenarios(),
  ...getGroup4Scenarios(),
  ...getGroup5Scenarios(),
  ...getGroup6Scenarios(),
  ...getGroup7Scenarios(),
];

console.log('Total scenarios:', all.length);
let errors = 0;

for (const s of all) {
  if (s.skipReason || s.accounts.length === 0 || s.expected?.expectError) continue;
  let totalD = new Decimal(0);
  let totalC = new Decimal(0);
  for (const a of s.accounts) {
    totalD = totalD.plus(a.debit);
    totalC = totalC.plus(a.credit);
  }
  if (!totalD.equals(totalC)) {
    console.error(`IMBALANCED S${String(s.id).padStart(2,'0')}: ${s.name} D=${totalD.toFixed(2)} C=${totalC.toFixed(2)} diff=${totalD.minus(totalC).toFixed(2)}`);
    errors++;
  }
}
if (errors === 0) console.log('All non-error scenarios have balanced GLs!');

// Check BS equation: A = L + E
let bsErrors = 0;
for (const s of all) {
  if (s.skipReason || s.accounts.length === 0 || s.expected?.expectError) continue;
  const t = s.expected.totals;
  const a = new Decimal(t.totalAssets);
  const l = new Decimal(t.totalLiabilities);
  const e = new Decimal(t.totalEquity);
  if (!a.equals(l.plus(e))) {
    console.error(`BS EQUATION FAIL S${String(s.id).padStart(2,'0')}: A=${t.totalAssets} L=${t.totalLiabilities} E=${t.totalEquity} L+E=${l.plus(e).toFixed(2)}`);
    bsErrors++;
  }
}
if (bsErrors === 0) console.log('All BS equations (A = L + E) verified!');
else console.log(`${bsErrors} BS equation failures`);

// Also check prior period balances for variance scenarios
let priorErrors = 0;
for (const s of all) {
  if (!s.priorPeriod) continue;
  let totalD = new Decimal(0);
  let totalC = new Decimal(0);
  for (const a of s.priorPeriod.accounts) {
    totalD = totalD.plus(a.debit);
    totalC = totalC.plus(a.credit);
  }
  if (!totalD.equals(totalC)) {
    console.error(`IMBALANCED PRIOR S${String(s.id).padStart(2,'0')}: D=${totalD.toFixed(2)} C=${totalC.toFixed(2)} diff=${totalD.minus(totalC).toFixed(2)}`);
    priorErrors++;
  }
}
if (priorErrors === 0) console.log('All prior period GLs balanced!');

console.log(`\nSummary: ${errors + bsErrors + priorErrors} total errors`);
process.exit(errors + bsErrors + priorErrors > 0 ? 1 : 0);
