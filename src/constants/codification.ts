/**
 * FASB ASC & IASB references for traceability (Compliance)
 * Every accounting entry must be traceable to a specific codification.
 */

import type { CodificationRef } from '../types/financial.js';

/** Balance Sheet presentation — ASC 210-10-45, IAS 1.54 */
export const BALANCE_SHEET: CodificationRef = {
  framework: 'FASB',
  citation: 'ASC 210-10-45',
  description: 'Balance Sheet—Overall Presentation',
};

/** IAS 1 Presentation of Financial Statements — structure */
export const IAS1_PRESENTATION: CodificationRef = {
  framework: 'IASB',
  citation: 'IAS 1.54',
  description: 'Current / non-current classification of assets and liabilities',
};

/** Comprehensive Income / P&L — ASC 220, IAS 1.81 */
export const COMPREHENSIVE_INCOME: CodificationRef = {
  framework: 'FASB',
  citation: 'ASC 220-10-45',
  description: 'Comprehensive Income—Overall Presentation',
};

export const IAS1_INCOME: CodificationRef = {
  framework: 'IASB',
  citation: 'IAS 1.81',
  description: 'Income statement—minimum line items',
};

/** Topic 205 — Presentation of Financial Statements */
export const ASC_205: CodificationRef = {
  framework: 'FASB',
  citation: 'ASC 205-10',
  description: 'Presentation of Financial Statements—Overall',
};

/** Default codification for assets (e.g. ASC 210) */
export const ASSET_REF: CodificationRef = {
  framework: 'FASB',
  citation: 'ASC 210-10-45-4',
  description: 'Balance Sheet—Assets',
};

export const LIABILITY_REF: CodificationRef = {
  framework: 'FASB',
  citation: 'ASC 210-10-45-9',
  description: 'Balance Sheet—Liabilities',
};

export const EQUITY_REF: CodificationRef = {
  framework: 'FASB',
  citation: 'ASC 210-10-45-14',
  description: 'Balance Sheet—Equity',
};

export const REVENUE_REF: CodificationRef = {
  framework: 'FASB',
  citation: 'ASC 220-10-45-2',
  description: 'Income Statement—Revenue',
};

export const EXPENSE_REF: CodificationRef = {
  framework: 'FASB',
  citation: 'ASC 220-10-45-2',
  description: 'Income Statement—Expenses',
};
