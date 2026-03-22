/**
 * BAI2 bank statement parser — unit tests.
 */

import { describe, it, expect } from '@jest/globals';
import { parseBAI2, detectFormat, parseBankStatement } from '../../src/services/bank_statement_parser_service.js';

// --- Fixtures ---

const SINGLE_ACCOUNT_BAI2 = [
  '01,JPMORGANCHASE,MERIDIAN,260322,0800,1,,,2/',
  '02,MERIDIAN,JPMORGANCHASE,1,260322,0800,USD,2/',
  '03,4567890123,USD,015,500000,3,0/',
  '16,115,200000,0,JPM123456,CUST001,LOCKBOX DEPOSIT MARCH/',
  '16,415,50000,0,JPM123457,CUST002,ACH DEBIT VENDOR PAYMENT/',
  '16,395,150000,0,JPM123458,CHECK4872,CHECK PAID/',
  '49,400000,4/',
  '98,400000,1,5/',
  '99,400000,1,6/',
].join('\n');

const MULTI_ACCOUNT_BAI2 = [
  '01,BOFA,ACMECORP,260322,0800,1,,,2/',
  '02,ACMECORP,BOFA,1,260322,0800,USD,2/',
  '03,1111111111,USD,015,300000,2,0/',
  '16,115,100000,0,REF001,CREF001,DEPOSIT ONE/',
  '16,415,200000,0,REF002,CREF002,ACH DEBIT TWO/',
  '49,300000,3/',
  '03,2222222222,USD,015,150000,1,0/',
  '16,195,150000,0,REF003,CREF003,OTHER CREDIT/',
  '49,150000,2/',
  '98,450000,2,7/',
  '99,450000,1,8/',
].join('\n');

const CONTINUATION_BAI2 = [
  '01,CITI,TENANT,260322,0800,1,,,2/',
  '02,TENANT,CITI,1,260322,0800,USD,2/',
  '03,9999999999,USD,015,100000,1,0/',
  '16,165,100000,0,BANKREF1,CUSTREF1,ACH CREDIT FIRST PART/',
  '88,CONTINUATION OF DESCRIPTION/',
  '49,100000,2/',
  '98,100000,1,3/',
  '99,100000,1,4/',
].join('\n');

const EMPTY_TEXT_BAI2 = [
  '01,WELLS,TENANT,260322,0800,1,,,2/',
  '02,TENANT,WELLS,1,260322,0800,USD,2/',
  '03,5555555555,USD,015,75000,1,0/',
  '16,115,75000,0,WREF1,WCREF1,/',
  '49,75000,2/',
  '98,75000,1,3/',
  '99,75000,1,4/',
].join('\n');

const VALUE_DATED_BAI2 = [
  '01,JPMORGANCHASE,TENANT,260322,0800,1,,,2/',
  '02,TENANT,JPMORGANCHASE,1,260322,0800,USD,2/',
  '03,7777777777,USD,015,250000,1,0/',
  '16,165,250000,V,260325,0800,BANKREFV,CUSTREFV,VALUE DATED ACH/',
  '49,250000,2/',
  '98,250000,1,3/',
  '99,250000,1,4/',
].join('\n');

const MISMATCHED_TOTAL_BAI2 = [
  '01,JPMORGANCHASE,MERIDIAN,260322,0800,1,,,2/',
  '02,MERIDIAN,JPMORGANCHASE,1,260322,0800,USD,2/',
  '03,4567890123,USD,015,500000,1,0/',
  '16,115,200000,0,JPM123456,CUST001,LOCKBOX DEPOSIT/',
  '49,999999,2/',  // Wrong account total
  '98,999999,1,3/',
  '99,999999,1,4/', // Wrong file total
].join('\n');

// --- Tests ---

describe('BAI2 Parser', () => {
  describe('Format detection', () => {
    it('detects BAI2 format from first line starting with 01,', () => {
      expect(detectFormat(SINGLE_ACCOUNT_BAI2)).toBe('bai2');
    });

    it('parseBankStatement routes BAI2 to parseBAI2', () => {
      const result = parseBankStatement(SINGLE_ACCOUNT_BAI2);
      expect(result.format).toBe('bai2');
      expect(result.success).toBe(true);
    });

    it('does not detect CSV as BAI2', () => {
      expect(detectFormat('Date,Description,Amount\n2026-01-01,Test,100.00')).toBe('csv');
    });
  });

  describe('Single-account parsing', () => {
    it('parses a valid single-account BAI2 file correctly', () => {
      const result = parseBAI2(SINGLE_ACCOUNT_BAI2);

      expect(result.success).toBe(true);
      expect(result.format).toBe('bai2');
      expect(result.transactions).toHaveLength(3);
      expect(result.accountIdentifier).toBe('4567890123');
      expect(result.statementDate).toBe('2026-03-22');
    });

    it('parses the lockbox deposit as a credit with positive amount', () => {
      const result = parseBAI2(SINGLE_ACCOUNT_BAI2);
      const lockbox = result.transactions[0];

      expect(lockbox.amount).toBe('2000.00');
      expect(lockbox.transactionType).toBe('deposit');
      expect(lockbox.description).toBe('LOCKBOX DEPOSIT MARCH');
      expect(lockbox.reference).toBe('JPM123456');
    });

    it('parses ACH debit with negative amount', () => {
      const result = parseBAI2(SINGLE_ACCOUNT_BAI2);
      const achDebit = result.transactions[1];

      expect(achDebit.amount).toBe('-500.00');
      expect(achDebit.transactionType).toBe('withdrawal');
      expect(achDebit.description).toBe('ACH DEBIT VENDOR PAYMENT');
    });

    it('parses check paid as debit with negative amount and check type', () => {
      const result = parseBAI2(SINGLE_ACCOUNT_BAI2);
      const check = result.transactions[2];

      expect(check.amount).toBe('-1500.00');
      expect(check.transactionType).toBe('check');
      expect(check.checkNumber).toBe('CHECK4872');
    });
  });

  describe('Multi-account parsing', () => {
    it('parses all accounts from a multi-account BAI2 file', () => {
      const result = parseBAI2(MULTI_ACCOUNT_BAI2);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(3);
      expect(result.accountIdentifier).toBe('1111111111;2222222222');
    });

    it('assigns correct amounts per account', () => {
      const result = parseBAI2(MULTI_ACCOUNT_BAI2);

      // Account 1: deposit $1000, ACH debit -$2000
      expect(result.transactions[0].amount).toBe('1000.00');
      expect(result.transactions[1].amount).toBe('-2000.00');
      // Account 2: other credit $1500
      expect(result.transactions[2].amount).toBe('1500.00');
    });
  });

  describe('Continuation records (type 88)', () => {
    it('appends continuation text to the preceding transaction description', () => {
      const result = parseBAI2(CONTINUATION_BAI2);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].description).toContain('ACH CREDIT FIRST PART');
      expect(result.transactions[0].description).toContain('CONTINUATION OF DESCRIPTION');
    });
  });

  describe('Credit type codes', () => {
    it('type 115 (lockbox deposit) produces positive amount', () => {
      const result = parseBAI2(SINGLE_ACCOUNT_BAI2);
      expect(parseFloat(result.transactions[0].amount)).toBeGreaterThan(0);
    });

    it('type 195 (other credit) produces positive amount', () => {
      const result = parseBAI2(MULTI_ACCOUNT_BAI2);
      // Third transaction is type 195
      expect(parseFloat(result.transactions[2].amount)).toBeGreaterThan(0);
    });

    it('type 165 (ACH credit) produces positive amount', () => {
      const result = parseBAI2(CONTINUATION_BAI2);
      expect(parseFloat(result.transactions[0].amount)).toBeGreaterThan(0);
    });
  });

  describe('Debit type codes', () => {
    it('type 395 (check paid) produces negative amount', () => {
      const result = parseBAI2(SINGLE_ACCOUNT_BAI2);
      expect(parseFloat(result.transactions[2].amount)).toBeLessThan(0);
    });

    it('type 415 (ACH debit) produces negative amount', () => {
      const result = parseBAI2(SINGLE_ACCOUNT_BAI2);
      expect(parseFloat(result.transactions[1].amount)).toBeLessThan(0);
    });
  });

  describe('Decimal.js amount handling', () => {
    it('divides BAI2 implied-decimal amounts by 100 correctly', () => {
      const result = parseBAI2(SINGLE_ACCOUNT_BAI2);
      // 200000 cents = $2000.00
      expect(result.transactions[0].amount).toBe('2000.00');
      // 50000 cents = $500.00
      expect(result.transactions[1].amount).toBe('-500.00');
      // 150000 cents = $1500.00
      expect(result.transactions[2].amount).toBe('-1500.00');
    });

    it('amounts are string representations with exactly 2 decimal places', () => {
      const result = parseBAI2(SINGLE_ACCOUNT_BAI2);
      for (const txn of result.transactions) {
        expect(txn.amount).toMatch(/^-?\d+\.\d{2}$/);
      }
    });
  });

  describe('Control total validation', () => {
    it('passes validation on a valid file with no errors', () => {
      const result = parseBAI2(SINGLE_ACCOUNT_BAI2);
      // No validation warnings expected — totals match
      const warnings = result.errors.filter((e) => e.includes('validation warning'));
      expect(warnings).toHaveLength(0);
    });

    it('logs warning on control total mismatch without throwing', () => {
      const result = parseBAI2(MISMATCHED_TOTAL_BAI2);

      // Should still succeed (not throw)
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);

      // Should have validation warnings
      const warnings = result.errors.filter((e) => e.includes('validation warning'));
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('mismatch'))).toBe(true);
    });
  });

  describe('Empty TEXT field', () => {
    it('parses without error when TEXT field is empty', () => {
      const result = parseBAI2(EMPTY_TEXT_BAI2);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].description).toBe('');
      expect(result.transactions[0].amount).toBe('750.00');
    });
  });

  describe('Funds type V (value dated)', () => {
    it('parses value-dated transactions correctly', () => {
      const result = parseBAI2(VALUE_DATED_BAI2);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);

      const txn = result.transactions[0];
      expect(txn.amount).toBe('2500.00');
      expect(txn.reference).toBe('BANKREFV');
      expect(txn.description).toBe('VALUE DATED ACH');
    });
  });

  describe('Edge cases', () => {
    it('handles trailing newlines gracefully', () => {
      const withTrailing = SINGLE_ACCOUNT_BAI2 + '\n\n\n';
      const result = parseBAI2(withTrailing);
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(3);
    });

    it('handles Windows-style line endings (CRLF)', () => {
      const crlf = SINGLE_ACCOUNT_BAI2.replace(/\n/g, '\r\n');
      const result = parseBAI2(crlf);
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(3);
    });
  });
});
