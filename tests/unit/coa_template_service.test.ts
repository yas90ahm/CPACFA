/**
 * Unit tests: CoA template service — QuickBooks, Xero, NetSuite detection and mapping.
 */

import { describe, it, expect } from '@jest/globals';
import {
  detectSourceFromHeaders,
  mapAccountTypeToCategory,
  type CoaTemplate,
} from '../../src/services/coa_template_service.js';

describe('CoA template service', () => {
  describe('detectSourceFromHeaders', () => {
    it('detects QuickBooks from Account, Name, Type headers', () => {
      const headers = ['Account', 'Name', 'Type', 'Debit', 'Credit'];
      expect(detectSourceFromHeaders(headers)).toBe('quickbooks_online');
    });

    it('detects Xero from Account Code, Account Name, Type headers', () => {
      const headers = ['Account Code', 'Account Name', 'Type', 'Tax Type'];
      expect(detectSourceFromHeaders(headers)).toBe('xero');
    });

    it('returns generic when no template matches', () => {
      const headers = ['AccountName', 'Debit', 'Credit'];
      expect(detectSourceFromHeaders(headers)).toBe('generic');
    });
  });

  describe('mapAccountTypeToCategory', () => {
    const qboTemplate: CoaTemplate = {
      source: 'quickbooks_online',
      accountMappings: [
        { account_type: 'Bank', detail_type: null, category: 'ASSET' },
        { account_type: 'Accounts Payable', detail_type: null, category: 'LIABILITY' },
        { account_type: 'Equity', detail_type: null, category: 'EQUITY' },
        { account_type: 'Income', detail_type: null, category: 'REVENUE' },
        { account_type: 'Expense', detail_type: null, category: 'EXPENSE' },
      ],
    };

    it('maps QuickBooks Bank to ASSET', () => {
      expect(mapAccountTypeToCategory(qboTemplate, 'Bank')).toBe('ASSET');
    });

    it('maps QuickBooks Accounts Payable to LIABILITY', () => {
      expect(mapAccountTypeToCategory(qboTemplate, 'Accounts Payable')).toBe('LIABILITY');
    });

    it('returns undefined for unknown type', () => {
      expect(mapAccountTypeToCategory(qboTemplate, 'UnknownType')).toBeUndefined();
    });
  });
});
