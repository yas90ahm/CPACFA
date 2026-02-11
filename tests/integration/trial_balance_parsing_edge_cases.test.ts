/**
 * Edge case tests for CSV/XLSX trial balance parsing.
 * Each case should: parse correctly OR reject with clear error; never crash.
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseCsvToTrialBalance,
  parseXlsxToTrialBalance,
  ingestTrialBalanceFile,
} from '../../src/services/fileIngestion.js';
import { parseAmount } from '../../src/services/trial-balance/parser_utils.js';
import * as XLSX from 'xlsx';

describe('Trial Balance Parsing Edge Cases', () => {
  describe('CSV edge cases', () => {
    it('1. CSV with BOM (byte order mark) parses correctly', () => {
      const BOM = '\uFEFF';
      const csv = `${BOM}AccountName,Debit,Credit
Cash,1000,0
Revenue,0,1000`;
      const result = parseCsvToTrialBalance(Buffer.from(csv, 'utf8'));
      expect(result).toBeDefined();
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.accountName).toBe('Cash');
      expect(result.rows[0]?.debit).toBe(1000);
      expect(result.rows[1]?.accountName).toBe('Revenue');
      expect(result.rows[1]?.credit).toBe(1000);
      expect(result.needsAgenticMapping).toBe(false);
    });

    it('2. CSV with Windows line endings (\\r\\n) parses correctly', () => {
      const csv = 'AccountName,Debit,Credit\r\nCash,1000,0\r\nRevenue,0,1000\r\n';
      const result = parseCsvToTrialBalance(Buffer.from(csv, 'utf8'));
      expect(result).toBeDefined();
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.accountName).toBe('Cash');
      expect(result.rows[1]?.accountName).toBe('Revenue');
    });

    it('3. CSV with quoted fields containing commas parses correctly', () => {
      const csv = `AccountName,Debit,Credit
"Cash, Petty",1000,0
"Revenue, Gross",0,1000`;
      const result = parseCsvToTrialBalance(Buffer.from(csv, 'utf8'));
      expect(result).toBeDefined();
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.accountName).toBe('Cash, Petty');
      expect(result.rows[1]?.accountName).toBe('Revenue, Gross');
    });

    it('4. CSV with extra columns ignores them', () => {
      const csv = `AccountName,Debit,Credit,Notes,ExtraCol
Cash,1000,0,Some note,Ignore
Revenue,0,1000,Other,Foo`;
      const result = parseCsvToTrialBalance(Buffer.from(csv, 'utf8'));
      expect(result).toBeDefined();
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.accountName).toBe('Cash');
      expect(result.rows[0]?.debit).toBe(1000);
      expect(result.rows[1]?.credit).toBe(1000);
    });

    it('5. CSV with missing columns (no Debit/Credit) returns needsAgenticMapping or empty rows', () => {
      const csv = `AccountName,Description
Cash,Primary cash
Revenue,Operating revenue`;
      const result = parseCsvToTrialBalance(Buffer.from(csv, 'utf8'));
      expect(result).toBeDefined();
      // Either needsAgenticMapping is true, or rows are empty/invalid - we should not crash
      expect(result.needsAgenticMapping === true || result.rows.length === 0).toBe(true);
    });
  });

  describe('XLSX edge cases', () => {
    it('6. XLSX with multiple sheets uses first sheet', () => {
      const wb = XLSX.utils.book_new();
      const sheet1 = XLSX.utils.aoa_to_sheet([
        ['AccountName', 'Debit', 'Credit'],
        ['Cash', 1000, 0],
        ['Revenue', 0, 1000],
      ]);
      const sheet2 = XLSX.utils.aoa_to_sheet([
        ['AccountName', 'Debit', 'Credit'],
        ['Other', 0, 0],
      ]);
      XLSX.utils.book_append_sheet(wb, sheet1, 'First');
      XLSX.utils.book_append_sheet(wb, sheet2, 'Second');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      const result = parseXlsxToTrialBalance(buf);
      expect(result).toBeDefined();
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.accountName).toBe('Cash');
      expect(result.rows[1]?.accountName).toBe('Revenue');
    });

    it('7. XLSX with formulas uses values not formulas', () => {
      const wb = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([
        ['AccountName', 'Debit', 'Credit'],
        ['Cash', 1000, 0],
        ['Revenue', 0, 1000],
      ]);
      // Add formula cell - SheetJS typically returns cached value when present
      const cellRef = sheet['C3'];
      if (cellRef) {
        cellRef.f = '=B2+B3';
        cellRef.v = 1000; // cached value
      }
      XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      const result = parseXlsxToTrialBalance(buf);
      expect(result).toBeDefined();
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      // Should not crash; values should be numeric
      result.rows.forEach((r) => {
        expect(typeof r.debit).toBe('number');
        expect(typeof r.credit).toBe('number');
      });
    });
  });

  describe('Amount and account name edge cases', () => {
    it('8. Very long account names (>255 chars) parse without crashing', () => {
      const longName = 'A'.repeat(300);
      const csv = `AccountName,Debit,Credit
"${longName}",1000,0
Revenue,0,1000`;
      const result = parseCsvToTrialBalance(Buffer.from(csv, 'utf8'));
      expect(result).toBeDefined();
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.accountName).toHaveLength(300);
      expect(result.rows[0]?.debit).toBe(1000);
    });

    it('9. Scientific notation in amounts (1.23E+05) parses correctly', () => {
      const csv = `AccountName,Debit,Credit
Cash,1.23E+05,0
Revenue,0,1.23E+05`;
      const result = parseCsvToTrialBalance(Buffer.from(csv, 'utf8'));
      expect(result).toBeDefined();
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.debit).toBeCloseTo(123000, 0);
      expect(result.rows[1]?.credit).toBeCloseTo(123000, 0);
    });

    it('10. Negative amounts in parentheses (1000.00) parses correctly', () => {
      // Debit/Credit format: (1000) in Credit column = 1000 credit (accounting display)
      const csv = `AccountName,Debit,Credit
Cash,1000,0
Revenue,0,(1000.00)`;
      const result = parseCsvToTrialBalance(Buffer.from(csv, 'utf8'));
      expect(result).toBeDefined();
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.accountName).toBe('Cash');
      expect(result.rows[0]?.debit).toBe(1000);
      expect(result.rows[0]?.credit).toBe(0);
      // (1000) parses as -1000; for Credit column we want 1000 credit — parser uses Math.abs for negatives in credit
      expect(result.rows[1]?.accountName).toBe('Revenue');
      expect(result.rows[1]?.debit).toBe(0);
      expect(result.rows[1]?.credit).toBe(1000); // (1000.00) → 1000 credit
    });
  });

  describe('parseAmount unit tests (parser_utils)', () => {
    it('parses scientific notation', () => {
      expect(parseAmount('1.23E+05')).toBeCloseTo(123000, 0);
      expect(parseAmount(1.23e5)).toBeCloseTo(123000, 0);
    });

    it('parses negative in parentheses', () => {
      expect(parseAmount('(1000.00)')).toBe(-1000);
      expect(parseAmount('(1,234.56)')).toBe(-1234.56);
    });
  });

  describe('ingestTrialBalanceFile (routing)', () => {
    it('rejects unsupported mime with clear error', () => {
      expect(() =>
        ingestTrialBalanceFile(Buffer.from('x'), 'application/pdf')
      ).toThrow(/Unsupported file type|CSV or XLSX/);
    });

    it('handles empty CSV without crashing', () => {
      const result = ingestTrialBalanceFile(
        Buffer.from('AccountName,Debit,Credit\n', 'utf8'),
        'text/csv'
      );
      expect(result).toBeDefined();
      expect(result.rows).toHaveLength(0);
    });
  });
});
