const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const csvPath = path.join('C:', 'Users', 'yasir', 'Downloads', 'sample-gl-january-2026.csv');
const csvBuffer = fs.readFileSync(csvPath);

const records = parse(csvBuffer.toString('utf8'), {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  relax_column_count: true,
  bom: true,
});

const rawHeaders = Object.keys(records[0]);
console.log('=== Raw headers from csv-parse ===');
console.log(JSON.stringify(rawHeaders));
console.log('Header count:', rawHeaders.length);
for (const h of rawHeaders) {
  console.log('  [' + h + '] length=' + h.length + ' chars=' + JSON.stringify([...h].map(c => c.charCodeAt(0))));
}

// Reproduce the mapHeaderToCanonical logic
const GL_COLUMN_MAP = {
  entry_id: ['entryid', 'entry_id', 'entry id', 'je #', 'je#', 'journal entry', 'journalentry'],
  entry_date: ['date', 'entrydate', 'entry_date', 'entry date', 'transactiondate', 'transaction date', 'posting_date', 'value_date'],
  account_code: ['accountcode', 'account_code', 'account code', 'account', 'glaccount', 'gl account'],
  debit: ['debit', 'debits', 'dr', 'debit_amount', 'debit amount'],
  credit: ['credit', 'credits', 'cr', 'credit_amount', 'credit amount'],
  description: ['description', 'desc', 'memo', 'notes', 'narrative'],
};

function normalizeHeader(h) {
  return String(h ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

function mapHeaderToCanonical(rawHeader) {
  const n = normalizeHeader(rawHeader);
  for (const [canonical, variants] of Object.entries(GL_COLUMN_MAP)) {
    for (const v of variants) {
      const vn = normalizeHeader(v);
      if (n === vn || n.includes(vn) || vn.includes(n)) return canonical;
    }
  }
  return null;
}

console.log('\n=== mapHeaderToCanonical results ===');
const headerToCanonical = {};
for (const raw of rawHeaders) {
  const canonical = mapHeaderToCanonical(raw);
  const norm = normalizeHeader(raw);
  console.log('  "' + raw + '" (normalized: "' + norm + '") → ' + (canonical || '(null)'));
  if (canonical && !Object.values(headerToCanonical).includes(canonical)) {
    headerToCanonical[raw] = canonical;
  }
}

console.log('\n=== Final headerToCanonical map ===');
console.log(JSON.stringify(headerToCanonical, null, 2));

// Now show what values are in mapped for first row
console.log('\n=== First row mapped values ===');
const row = records[0];
const mapped = {};
for (const [k, v] of Object.entries(row)) {
  const canon = headerToCanonical[k];
  if (canon && v != null && String(v).trim() !== '') {
    mapped[canon] = String(v).trim();
  }
}
console.log(JSON.stringify(mapped, null, 2));
console.log('\nValue that would be passed to parseGlAmount for debit:', JSON.stringify(mapped.debit));
console.log('Value that would be passed to parseGlAmount for credit:', JSON.stringify(mapped.credit));
