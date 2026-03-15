/**
 * Parse the 2025 GAAP Taxonomy Excel file and output xbrl_parsed_taxonomy.json.
 * Run: npx tsx src/scripts/parse_xbrl_taxonomy.ts
 *
 * Reads the "Concepts" sheet from data/2025_GAAP_Taxonomy.xlsx.
 * Columns (from row 0 header):
 *   0: prefix, 1: name, 2: type, 3: enumerations, 4: substitutionGroup,
 *   5: balance, 6: periodType, 7: abstract, 8: typedDomainRef,
 *   9: ext. enum domain, 10: ext. enum linkrole, 11: label, 12: documentation,
 *   13: deprecatedLabel, 14: deprecatedDate
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const FILE_PATH = path.join(__dirname, '../../data/2025_GAAP_Taxonomy.xlsx');
const OUTPUT_PATH = path.join(__dirname, '../../data/xbrl_parsed_taxonomy.json');

interface ParsedElement {
  id: string;
  element_name: string;
  label: string;
  documentation: string | null;
  balance_type: 'debit' | 'credit' | 'na';
  period_type: 'instant' | 'duration' | 'na';
  abstract: boolean;
  deprecated: boolean;
  statement: 'BS' | 'IS' | 'CF' | 'OCI' | 'other';
}

/** Classify element into a financial statement based on period type and name patterns. */
function classifyStatement(
  elementName: string,
  label: string,
  periodType: string,
  balanceType: string
): 'BS' | 'IS' | 'CF' | 'OCI' | 'other' {
  const nameLower = elementName.toLowerCase();
  const labelLower = label.toLowerCase();

  // OCI patterns (check first — they can be instant or duration)
  const ociPatterns = [
    'othercomprehensiveincome', 'comprehensiveincomeloss',
    'accumulatedothercomprehensive', 'ocibeforereclassification',
    'reclassificationfromaccumulatedother',
  ];
  for (const p of ociPatterns) {
    if (nameLower.includes(p)) return 'OCI';
  }

  // Cash Flow patterns
  const cfPatterns = [
    'cashflow', 'netcashprovided', 'netcashused',
    'paymentstoacquire', 'proceedsfromsaleof', 'proceedsfromissuanceof',
    'repaymentof', 'paymentsfordividends', 'paymentsofdividends',
    'paymentstoacquirebusinesses', 'capitalexpenditure',
    'depreciationdepletionandamortization',
    'increasedecreasein', 'adjustmentstononcash',
    'cashcashequivalentsrestrictedcashandrestrictedcash',
  ];
  for (const p of cfPatterns) {
    if (nameLower.includes(p)) return 'CF';
  }

  // BS patterns — instant period type is strong signal
  if (periodType === 'instant') {
    return 'BS';
  }

  // IS patterns — duration period type
  if (periodType === 'duration') {
    const isPatterns = [
      'revenue', 'expense', 'income', 'cost', 'gain', 'loss',
      'earnings', 'profit', 'sales', 'margin', 'impairment',
      'writeoff', 'writedown', 'amortization', 'depreciation',
      'tax', 'interest', 'dividend', 'fee', 'commission',
      'compensation', 'benefit', 'charge', 'provision',
    ];
    for (const p of isPatterns) {
      if (nameLower.includes(p)) return 'IS';
    }
    return 'other';
  }

  return 'other';
}

function main(): void {
  console.log(`Reading taxonomy file: ${FILE_PATH}`);
  const workbook = XLSX.readFile(FILE_PATH);

  const sheet = workbook.Sheets['Concepts'];
  if (!sheet) {
    console.error('No "Concepts" sheet found in workbook.');
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  console.log(`Total rows in Concepts sheet: ${rows.length}`);

  // Row 0 is header
  const header = rows[0] as string[];
  console.log('Header columns:', header);

  const elements: ParsedElement[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.length < 12) {
      skipped++;
      continue;
    }

    const prefix = String(row[0] ?? '').trim();
    const name = String(row[1] ?? '').trim();
    const balance = String(row[5] ?? '').trim().toLowerCase();
    const periodTypeRaw = String(row[6] ?? '').trim().toLowerCase();
    const abstractRaw = row[7];
    const label = String(row[11] ?? '').trim();
    const documentation = row[12] != null ? String(row[12]).trim() : null;
    const deprecatedLabel = row[13] != null ? String(row[13]).trim() : '';
    const deprecatedDate = row[14] != null ? String(row[14]).trim() : '';

    if (!name || !label) {
      skipped++;
      continue;
    }

    // Only include us-gaap and srt prefixes (core taxonomy)
    if (prefix !== 'us-gaap' && prefix !== 'srt') {
      skipped++;
      continue;
    }

    const id = `${prefix}:${name}`;
    const balanceType: 'debit' | 'credit' | 'na' =
      balance === 'debit' ? 'debit' : balance === 'credit' ? 'credit' : 'na';
    const periodType: 'instant' | 'duration' | 'na' =
      periodTypeRaw === 'instant' ? 'instant' : periodTypeRaw === 'duration' ? 'duration' : 'na';
    const isAbstract = abstractRaw === true || abstractRaw === 'true' || abstractRaw === 1 || abstractRaw === 'abstract';
    const isDeprecated = !!deprecatedLabel || !!deprecatedDate;

    const statement = classifyStatement(name, label, periodType, balanceType);

    elements.push({
      id,
      element_name: name,
      label,
      documentation: documentation || null,
      balance_type: balanceType,
      period_type: periodType,
      abstract: isAbstract,
      deprecated: isDeprecated,
      statement,
    });
  }

  console.log(`\nParsed ${elements.length} elements (skipped ${skipped} rows)`);

  // Breakdown by statement
  const byStatement: Record<string, number> = {};
  let abstractCount = 0;
  let deprecatedCount = 0;
  for (const el of elements) {
    byStatement[el.statement] = (byStatement[el.statement] ?? 0) + 1;
    if (el.abstract) abstractCount++;
    if (el.deprecated) deprecatedCount++;
  }

  console.log('\nBreakdown by statement:');
  for (const [stmt, count] of Object.entries(byStatement).sort()) {
    console.log(`  ${stmt}: ${count}`);
  }
  console.log(`\nAbstract elements: ${abstractCount}`);
  console.log(`Deprecated elements: ${deprecatedCount}`);

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(elements, null, 2), 'utf-8');
  console.log(`\nWrote ${elements.length} elements to ${OUTPUT_PATH}`);
}

main();
