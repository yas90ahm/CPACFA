/**
 * Meridian SaaS Inc. — Demo GL Dataset Generator
 * Generates ~800 GL lines for Jan 2026 and ~750 for Dec 2025 (prior period).
 * Revenue target: ~$7.1M/month (mid-market PE-backed SaaS, $85M ARR).
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Chart of Accounts ──
const COA = [
  // Assets
  ['1000', 'Cash and Cash Equivalents'],
  ['1010', 'Restricted Cash'],
  ['1100', 'Accounts Receivable'],
  ['1110', 'Allowance for Doubtful Accounts'],
  ['1120', 'Unbilled Receivables'],
  ['1200', 'Prepaid Expenses'],
  ['1210', 'Prepaid Insurance'],
  ['1220', 'Prepaid Software Licenses'],
  ['1230', 'Prepaid Marketing'],
  ['1300', 'Other Current Assets'],
  ['1500', 'Property and Equipment'],
  ['1510', 'Accumulated Depreciation - P&E'],
  ['1600', 'Capitalized Software Development'],
  ['1610', 'Accumulated Amortization - Software'],
  ['1700', 'Goodwill'],
  ['1710', 'Other Intangible Assets'],
  // Liabilities
  ['2000', 'Accounts Payable'],
  ['2050', 'Accrued Expenses'],
  ['2100', 'Accrued Compensation'],
  ['2110', 'Accrued Payroll Taxes'],
  ['2120', 'Accrued Benefits'],
  ['2130', 'Accrued Commissions'],
  ['2140', 'Accrued Professional Fees'],
  ['2200', 'Deferred Revenue - Current'],
  ['2210', 'Deferred Revenue - Long-term'],
  ['2300', 'Current Portion of Long-term Debt'],
  ['2310', 'Line of Credit'],
  ['2400', 'Income Taxes Payable'],
  ['2500', 'Long-term Debt'],
  ['2600', 'Other Long-term Liabilities'],
  // Equity
  ['3000', 'Common Stock'],
  ['3100', 'Additional Paid-in Capital'],
  ['3200', 'Retained Earnings'],
  ['3300', 'Accumulated Other Comprehensive Income'],
  // Revenue
  ['4000', 'Subscription Revenue'],
  ['4010', 'Usage-based Revenue'],
  ['4100', 'Professional Services Revenue'],
  ['4200', 'Support and Maintenance Revenue'],
  ['4300', 'Other Revenue'],
  // COGS
  ['5000', 'COGS - Hosting and Infrastructure'],
  ['5010', 'COGS - Data and Third-party APIs'],
  ['5100', 'COGS - Customer Support'],
  ['5110', 'COGS - Professional Services Delivery'],
  ['5200', 'COGS - Allocated Overhead'],
  // R&D
  ['6000', 'R&D - Salaries and Benefits'],
  ['6010', 'R&D - Stock-based Compensation'],
  ['6100', 'R&D - Contractors'],
  ['6200', 'R&D - Cloud and Dev Tools'],
  ['6300', 'R&D - Depreciation and Amortization'],
  // S&M
  ['7000', 'S&M - Salaries and Benefits'],
  ['7010', 'S&M - Stock-based Compensation'],
  ['7100', 'S&M - Demand Generation'],
  ['7110', 'S&M - Events and Sponsorships'],
  ['7200', 'S&M - Sales Commissions'],
  ['7300', 'S&M - Travel and Entertainment'],
  // G&A
  ['8000', 'G&A - Salaries and Benefits'],
  ['8010', 'G&A - Stock-based Compensation'],
  ['8100', 'G&A - Legal and Professional'],
  ['8200', 'G&A - Insurance'],
  ['8300', 'G&A - Office and Facilities'],
  ['8310', 'G&A - Rent'],
  ['8400', 'G&A - Depreciation and Amortization'],
  ['8500', 'G&A - Bad Debt Expense'],
  ['8600', 'G&A - Software and Subscriptions'],
  // Other
  ['9000', 'Interest Expense'],
  ['9100', 'Interest Income'],
  ['9200', 'Other Income (Expense)'],
  ['9300', 'Income Tax Expense'],
  ['9900', 'Foreign Currency Gain (Loss)'],
];

// ── Helpers ──
function fmt(n: number): string {
  return n.toFixed(2);
}

function randBetween(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function randDate(year: number, month: number): string {
  const maxDay = month === 2 ? 28 : [4, 6, 9, 11].includes(month) ? 30 : 31;
  const day = Math.floor(Math.random() * maxDay) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface GLLine {
  entry_id: string;
  entry_date: string;
  account_code: string;
  account_name: string;
  debit: string;
  credit: string;
  description: string;
}

let entryCounter = 0;
function nextEntry(prefix: string): string {
  entryCounter++;
  return `${prefix}-${String(entryCounter).padStart(4, '0')}`;
}

function acctName(code: string): string {
  return COA.find((c) => c[0] === code)?.[1] ?? code;
}

function line(eid: string, date: string, code: string, dr: number, cr: number, desc: string): GLLine {
  return {
    entry_id: eid,
    entry_date: date,
    account_code: code,
    account_name: acctName(code),
    debit: fmt(dr),
    credit: fmt(cr),
    description: desc,
  };
}

// ── GL Generator for a Month ──
function generateMonth(year: number, month: number, params: {
  subscriptionRevenue: number;
  usageRevenue: number;
  psRevenue: number;
  supportRevenue: number;
  revenueMultiplier?: number;
}): GLLine[] {
  entryCounter = 0;
  const lines: GLLine[] = [];
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const mul = params.revenueMultiplier ?? 1;

  // ═══════════════════════════════════════
  // REVENUE RECOGNITION (~$7.1M target)
  // ═══════════════════════════════════════

  // 1. Subscription Revenue — recognized from deferred rev + new bookings
  //    Split across 100 customer "batches" for realism
  const subRevPerBatch = params.subscriptionRevenue / 100;
  for (let i = 1; i <= 100; i++) {
    const eid = nextEntry('JE-SUB');
    const amt = randBetween(subRevPerBatch * 0.7, subRevPerBatch * 1.3);
    const date = randDate(year, month);
    lines.push(line(eid, date, '2200', amt, 0, `Subscription revenue recognition - Batch ${i}`));
    lines.push(line(eid, date, '4000', 0, amt, `Subscription revenue recognition - Batch ${i}`));
  }

  // 2. Usage-based Revenue — 25 batches
  const usagePerBatch = params.usageRevenue / 25;
  for (let i = 1; i <= 25; i++) {
    const eid = nextEntry('JE-USG');
    const amt = randBetween(usagePerBatch * 0.6, usagePerBatch * 1.4);
    const date = randDate(year, month);
    lines.push(line(eid, date, '1120', amt, 0, `Usage-based revenue accrual - Cohort ${i}`));
    lines.push(line(eid, date, '4010', 0, amt, `Usage-based revenue accrual - Cohort ${i}`));
  }

  // 3. Professional Services Revenue — 20 projects
  const psPerProject = params.psRevenue / 20;
  for (let i = 1; i <= 20; i++) {
    const eid = nextEntry('JE-PS');
    const amt = randBetween(psPerProject * 0.5, psPerProject * 1.5);
    const date = randDate(year, month);
    lines.push(line(eid, date, '1100', amt, 0, `Professional services - Project IMPL-${1000 + i}`));
    lines.push(line(eid, date, '4100', 0, amt, `Professional services - Project IMPL-${1000 + i}`));
  }

  // 4. Support Revenue — 10 batches
  const supportPerBatch = params.supportRevenue / 10;
  for (let i = 1; i <= 10; i++) {
    const eid = nextEntry('JE-SUP');
    const amt = randBetween(supportPerBatch * 0.8, supportPerBatch * 1.2);
    const date = randDate(year, month);
    lines.push(line(eid, date, '2200', amt, 0, `Support contract revenue recognition - Tier ${i}`));
    lines.push(line(eid, date, '4200', 0, amt, `Support contract revenue recognition - Tier ${i}`));
  }

  // ═══════════════════════════════════════
  // CASH COLLECTIONS (~95% of billed revenue)
  // ═══════════════════════════════════════
  const totalBilled = params.subscriptionRevenue + params.psRevenue + params.supportRevenue;
  const collections = totalBilled * 0.95;
  const collectionBatches = 40;
  const collPerBatch = collections / collectionBatches;
  for (let i = 1; i <= 40; i++) {
    const eid = nextEntry('JE-COLL');
    const amt = randBetween(collPerBatch * 0.6, collPerBatch * 1.4);
    const date = randDate(year, month);
    lines.push(line(eid, date, '1000', amt, 0, `Customer payment received - Batch ${i}`));
    lines.push(line(eid, date, '1100', 0, amt, `Customer payment received - Batch ${i}`));
  }

  // ═══════════════════════════════════════
  // NEW BOOKINGS → DEFERRED REVENUE
  // ═══════════════════════════════════════
  const newBookings = params.subscriptionRevenue * 1.15; // Growth
  const bookingBatches = 30;
  const bookPerBatch = newBookings / bookingBatches;
  for (let i = 1; i <= 30; i++) {
    const eid = nextEntry('JE-BOOK');
    const amt = randBetween(bookPerBatch * 0.5, bookPerBatch * 1.5);
    const date = randDate(year, month);
    lines.push(line(eid, date, '1100', amt, 0, `New subscription booking - Deal ${2000 + i}`));
    lines.push(line(eid, date, '2200', 0, amt, `New subscription booking - Deal ${2000 + i}`));
  }

  // ═══════════════════════════════════════
  // COGS
  // ═══════════════════════════════════════

  // Hosting — 8 vendors
  for (let i = 1; i <= 8; i++) {
    const eid = nextEntry('JE-HOST');
    const vendors = ['AWS', 'GCP', 'Cloudflare', 'Datadog', 'Snowflake', 'MongoDB Atlas', 'Redis Cloud', 'Fastly'];
    const amt = randBetween(40000, 140000);
    const date = randDate(year, month);
    lines.push(line(eid, date, '5000', amt, 0, `Cloud hosting - ${vendors[i - 1]}`));
    lines.push(line(eid, date, '2000', 0, amt, `Cloud hosting - ${vendors[i - 1]}`));
  }

  // Third-party APIs — 6 vendors
  for (let i = 1; i <= 6; i++) {
    const eid = nextEntry('JE-API');
    const vendors = ['Twilio', 'SendGrid', 'Stripe', 'Plaid', 'Clearbit', 'ZoomInfo'];
    const amt = randBetween(20000, 100000);
    const date = randDate(year, month);
    lines.push(line(eid, date, '5010', amt, 0, `API/data vendor - ${vendors[i - 1]}`));
    lines.push(line(eid, date, '2000', 0, amt, `API/data vendor - ${vendors[i - 1]}`));
  }

  // Customer Support team cost
  {
    const eid = nextEntry('JE-CSUP');
    const date = `${ym}-15`;
    const amt = randBetween(460000, 540000);
    lines.push(line(eid, date, '5100', amt, 0, 'Customer support team - monthly allocation'));
    lines.push(line(eid, date, '2100', 0, amt, 'Customer support team - monthly allocation'));
  }

  // PS Delivery cost
  {
    const eid = nextEntry('JE-PSD');
    const date = `${ym}-15`;
    const amt = randBetween(380000, 420000);
    lines.push(line(eid, date, '5110', amt, 0, 'PS delivery team - monthly allocation'));
    lines.push(line(eid, date, '2100', 0, amt, 'PS delivery team - monthly allocation'));
  }

  // COGS overhead allocation
  {
    const eid = nextEntry('JE-COH');
    const date = `${ym}-28`;
    const amt = randBetween(80000, 120000);
    lines.push(line(eid, date, '5200', amt, 0, 'COGS allocated overhead'));
    lines.push(line(eid, date, '2050', 0, amt, 'COGS allocated overhead'));
  }

  // ═══════════════════════════════════════
  // PAYROLL (bi-weekly, 2 runs)
  // ═══════════════════════════════════════
  for (const payDate of [`${ym}-15`, `${ym}-28`]) {
    const eid = nextEntry('JE-PAY');
    // R&D team
    const rdSalary = randBetween(580000, 620000);
    lines.push(line(eid, payDate, '6000', rdSalary, 0, 'R&D salaries and benefits'));
    // S&M team
    const smSalary = randBetween(420000, 460000);
    lines.push(line(eid, payDate, '7000', smSalary, 0, 'S&M salaries and benefits'));
    // G&A team
    const gaSalary = randBetween(280000, 320000);
    lines.push(line(eid, payDate, '8000', gaSalary, 0, 'G&A salaries and benefits'));
    // Payroll taxes
    const totalSalary = rdSalary + smSalary + gaSalary;
    const taxes = totalSalary * 0.085;
    lines.push(line(eid, payDate, '2110', 0, taxes, 'Payroll tax accrual'));
    // Benefits
    const benefits = totalSalary * 0.12;
    lines.push(line(eid, payDate, '2120', 0, benefits, 'Benefits accrual'));
    // Net pay
    lines.push(line(eid, payDate, '1000', 0, totalSalary - taxes - benefits, 'Net payroll disbursement'));
    lines.push(line(eid, payDate, '2100', 0, taxes + benefits, 'Payroll liabilities'));

    // Reclassify the split — balance off accrued compensation
    // Actually let me simplify: debit expense, credit cash + accrued
    // The entry above is unbalanced. Let me fix:
  }

  // Fix: rewrite payroll entries properly
  // Remove last 14 lines (2 payroll entries x 7 lines each) and redo
  lines.splice(lines.length - 14, 14);
  for (const payDate of [`${ym}-15`, `${ym}-28`]) {
    const eid = nextEntry('JE-PAY');
    const rdSalary = randBetween(580000, 620000);
    const smSalary = randBetween(420000, 460000);
    const gaSalary = randBetween(280000, 320000);
    const totalGross = rdSalary + smSalary + gaSalary;
    const taxes = Math.round(totalGross * 0.085 * 100) / 100;
    const benefits = Math.round(totalGross * 0.12 * 100) / 100;
    const netPay = Math.round((totalGross - taxes - benefits) * 100) / 100;

    lines.push(line(eid, payDate, '6000', rdSalary, 0, 'R&D salaries and benefits'));
    lines.push(line(eid, payDate, '7000', smSalary, 0, 'S&M salaries and benefits'));
    lines.push(line(eid, payDate, '8000', gaSalary, 0, 'G&A salaries and benefits'));
    lines.push(line(eid, payDate, '2110', 0, taxes, 'Payroll tax accrual'));
    lines.push(line(eid, payDate, '2120', 0, benefits, 'Benefits accrual'));
    lines.push(line(eid, payDate, '1000', 0, netPay, 'Net payroll disbursement'));
  }

  // ═══════════════════════════════════════
  // STOCK-BASED COMPENSATION
  // ═══════════════════════════════════════
  {
    const eid = nextEntry('JE-SBC');
    const date = `${ym}-28`;
    const rdSbc = randBetween(85000, 95000);
    const smSbc = randBetween(45000, 55000);
    const gaSbc = randBetween(30000, 35000);
    lines.push(line(eid, date, '6010', rdSbc, 0, 'R&D stock-based compensation'));
    lines.push(line(eid, date, '7010', smSbc, 0, 'S&M stock-based compensation'));
    lines.push(line(eid, date, '8010', gaSbc, 0, 'G&A stock-based compensation'));
    lines.push(line(eid, date, '3100', 0, rdSbc + smSbc + gaSbc, 'APIC - stock-based compensation'));
  }

  // ═══════════════════════════════════════
  // R&D EXPENSES (non-payroll)
  // ═══════════════════════════════════════

  // Contractors — 12 engagements
  for (let i = 1; i <= 12; i++) {
    const eid = nextEntry('JE-RDC');
    const amt = randBetween(12000, 45000);
    const date = randDate(year, month);
    lines.push(line(eid, date, '6100', amt, 0, `R&D contractor - Engagement ENG-${3000 + i}`));
    lines.push(line(eid, date, '2000', 0, amt, `R&D contractor - Engagement ENG-${3000 + i}`));
  }

  // Dev tools and cloud
  for (let i = 1; i <= 5; i++) {
    const eid = nextEntry('JE-RDT');
    const tools = ['GitHub Enterprise', 'Jira/Confluence', 'Figma', 'CircleCI', 'LaunchDarkly'];
    const amt = randBetween(5000, 25000);
    const date = randDate(year, month);
    lines.push(line(eid, date, '6200', amt, 0, `R&D tools - ${tools[i - 1]}`));
    lines.push(line(eid, date, '2000', 0, amt, `R&D tools - ${tools[i - 1]}`));
  }

  // ═══════════════════════════════════════
  // S&M EXPENSES (non-payroll)
  // ═══════════════════════════════════════

  // Demand generation — 10 campaigns
  for (let i = 1; i <= 10; i++) {
    const eid = nextEntry('JE-MKT');
    const channels = ['Google Ads', 'LinkedIn Ads', 'Content Syndication', 'SEO Agency',
      'Webinar Platform', 'ABM Platform', 'Social Media', 'PR Agency', 'Analyst Relations', 'Review Sites'];
    const amt = randBetween(8000, 35000);
    const date = randDate(year, month);
    lines.push(line(eid, date, '7100', amt, 0, `Marketing - ${channels[i - 1]}`));
    lines.push(line(eid, date, '2000', 0, amt, `Marketing - ${channels[i - 1]}`));
  }

  // Events
  for (let i = 1; i <= 6; i++) {
    const eid = nextEntry('JE-EVT');
    const events = ['SaaStr Annual', 'AWS re:Invent', 'Industry Conference', 'Dreamforce', 'Gartner Summit', 'Web Summit'];
    const amt = randBetween(15000, 65000);
    const date = randDate(year, month);
    lines.push(line(eid, date, '7110', amt, 0, `Event - ${events[i - 1]}`));
    lines.push(line(eid, date, '2000', 0, amt, `Event - ${events[i - 1]}`));
  }

  // Sales commissions
  {
    const eid = nextEntry('JE-COM');
    const date = `${ym}-28`;
    const amt = randBetween(280000, 320000);
    lines.push(line(eid, date, '7200', amt, 0, 'Sales commissions accrual'));
    lines.push(line(eid, date, '2130', 0, amt, 'Sales commissions accrual'));
  }

  // Travel and entertainment — 15 entries
  for (let i = 1; i <= 15; i++) {
    const eid = nextEntry('JE-TRV');
    const amt = randBetween(2000, 12000);
    const date = randDate(year, month);
    lines.push(line(eid, date, '7300', amt, 0, `T&E - Sales travel expense report ${i}`));
    lines.push(line(eid, date, '1000', 0, amt, `T&E - Sales travel expense report ${i}`));
  }

  // ═══════════════════════════════════════
  // G&A EXPENSES (non-payroll)
  // ═══════════════════════════════════════

  // Legal and professional
  for (let i = 1; i <= 6; i++) {
    const eid = nextEntry('JE-LEG');
    const firms = ['Wilson Sonsini', 'PwC', 'Deloitte Tax', 'KPMG Advisory', 'Cooley LLP', 'Ernst & Young'];
    const amt = randBetween(15000, 55000);
    const date = randDate(year, month);
    lines.push(line(eid, date, '8100', amt, 0, `Legal/professional - ${firms[i - 1]}`));
    lines.push(line(eid, date, '2140', 0, amt, `Legal/professional - ${firms[i - 1]}`));
  }

  // Insurance
  {
    const eid = nextEntry('JE-INS');
    const date = `${ym}-01`;
    const amt = randBetween(28000, 35000);
    lines.push(line(eid, date, '8200', amt, 0, 'Monthly insurance expense'));
    lines.push(line(eid, date, '1210', 0, amt, 'Prepaid insurance amortization'));
  }

  // Office and facilities
  {
    const eid = nextEntry('JE-OFC');
    const date = `${ym}-01`;
    const amt = randBetween(35000, 45000);
    lines.push(line(eid, date, '8300', amt, 0, 'Office expenses - supplies, utilities'));
    lines.push(line(eid, date, '1000', 0, amt, 'Office expenses'));
  }

  // Rent
  {
    const eid = nextEntry('JE-RNT');
    const date = `${ym}-01`;
    const amt = 125000; // fixed lease
    lines.push(line(eid, date, '8310', amt, 0, 'Monthly rent - HQ and satellite offices'));
    lines.push(line(eid, date, '1000', 0, amt, 'Rent payment'));
  }

  // Software subscriptions
  for (let i = 1; i <= 10; i++) {
    const eid = nextEntry('JE-SFT');
    const subs = ['Salesforce', 'Workday', 'Slack', 'Zoom', 'DocuSign', 'Netsuite', 'HubSpot', 'Okta', 'Notion', 'PagerDuty'];
    const amt = randBetween(3000, 18000);
    const date = randDate(year, month);
    lines.push(line(eid, date, '8600', amt, 0, `SaaS subscription - ${subs[i - 1]}`));
    lines.push(line(eid, date, '2000', 0, amt, `SaaS subscription - ${subs[i - 1]}`));
  }

  // Bad debt expense
  {
    const eid = nextEntry('JE-BD');
    const date = `${ym}-28`;
    const amt = randBetween(15000, 35000);
    lines.push(line(eid, date, '8500', amt, 0, 'Bad debt expense - monthly provision'));
    lines.push(line(eid, date, '1110', 0, amt, 'Allowance for doubtful accounts increase'));
  }

  // ═══════════════════════════════════════
  // DEPRECIATION & AMORTIZATION
  // ═══════════════════════════════════════
  {
    const eid = nextEntry('JE-DEP');
    const date = `${ym}-28`;
    const rdDepAmt = randBetween(35000, 45000);
    const gaDepAmt = randBetween(18000, 22000);
    lines.push(line(eid, date, '6300', rdDepAmt, 0, 'R&D depreciation and amortization'));
    lines.push(line(eid, date, '8400', gaDepAmt, 0, 'G&A depreciation and amortization'));
    lines.push(line(eid, date, '1510', 0, gaDepAmt, 'Accumulated depreciation - P&E'));
    lines.push(line(eid, date, '1610', 0, rdDepAmt, 'Accumulated amortization - software'));
  }

  // ═══════════════════════════════════════
  // INTEREST & OTHER
  // ═══════════════════════════════════════
  {
    const eid = nextEntry('JE-INT');
    const date = `${ym}-28`;
    const intExp = randBetween(32000, 38000);
    lines.push(line(eid, date, '9000', intExp, 0, 'Interest expense on term loan'));
    lines.push(line(eid, date, '2500', 0, intExp, 'Accrued interest on term loan'));
  }
  {
    const eid = nextEntry('JE-INC');
    const date = `${ym}-28`;
    const intInc = randBetween(8000, 12000);
    lines.push(line(eid, date, '1000', intInc, 0, 'Interest income - money market'));
    lines.push(line(eid, date, '9100', 0, intInc, 'Interest income earned'));
  }

  // FX gain/loss
  {
    const eid = nextEntry('JE-FX');
    const date = `${ym}-28`;
    const fxAmt = randBetween(2000, 8000);
    const isGain = Math.random() > 0.5;
    if (isGain) {
      lines.push(line(eid, date, '1000', fxAmt, 0, 'FX gain on foreign receivables'));
      lines.push(line(eid, date, '9900', 0, fxAmt, 'Foreign currency gain'));
    } else {
      lines.push(line(eid, date, '9900', fxAmt, 0, 'Foreign currency loss'));
      lines.push(line(eid, date, '1000', 0, fxAmt, 'FX loss on foreign receivables'));
    }
  }

  // Income tax accrual
  {
    const eid = nextEntry('JE-TAX');
    const date = `${ym}-28`;
    const taxAmt = randBetween(85000, 110000);
    lines.push(line(eid, date, '9300', taxAmt, 0, 'Income tax expense - monthly provision'));
    lines.push(line(eid, date, '2400', 0, taxAmt, 'Income taxes payable'));
  }

  // ═══════════════════════════════════════
  // PREPAID AMORTIZATION
  // ═══════════════════════════════════════
  for (let i = 1; i <= 8; i++) {
    const eid = nextEntry('JE-PRE');
    const items = ['Annual SaaS license', 'Conference passes', 'Annual insurance premium',
      'Marketing retainer', 'Legal retainer', 'Training subscriptions', 'Domain renewals', 'SSL certificates'];
    const amt = randBetween(3000, 18000);
    const date = `${ym}-01`;
    lines.push(line(eid, date, items[i - 1].includes('Insurance') ? '8200' : items[i - 1].includes('Marketing') ? '7100' : '8600',
      amt, 0, `Prepaid amortization - ${items[i - 1]}`));
    lines.push(line(eid, date, items[i - 1].includes('Insurance') ? '1210' : '1220',
      0, amt, `Prepaid amortization - ${items[i - 1]}`));
  }

  // ═══════════════════════════════════════
  // ACCRUAL ADJUSTMENTS
  // ═══════════════════════════════════════
  for (let i = 1; i <= 6; i++) {
    const eid = nextEntry('JE-ACC');
    const items = ['Audit fees', 'Consulting fees', 'IT support', 'Recruiting fees', 'Board fees', 'Compliance review'];
    const amt = randBetween(5000, 25000);
    const date = `${ym}-28`;
    lines.push(line(eid, date, '8100', amt, 0, `Accrual - ${items[i - 1]}`));
    lines.push(line(eid, date, '2140', 0, amt, `Accrual - ${items[i - 1]}`));
  }

  // ═══════════════════════════════════════
  // CUSTOMER REFUNDS & CREDITS
  // ═══════════════════════════════════════
  for (let i = 1; i <= 8; i++) {
    const eid = nextEntry('JE-REF');
    const amt = randBetween(2000, 15000);
    const date = randDate(year, month);
    lines.push(line(eid, date, '4000', amt, 0, `Customer credit memo - CM-${5000 + i}`));
    lines.push(line(eid, date, '1100', 0, amt, `Customer credit memo - CM-${5000 + i}`));
  }

  // ═══════════════════════════════════════
  // OTHER REVENUE / MISC
  // ═══════════════════════════════════════
  for (let i = 1; i <= 5; i++) {
    const eid = nextEntry('JE-OTH');
    const items = ['Data licensing', 'API marketplace', 'Training workshops', 'Consulting referral', 'White-label'];
    const amt = randBetween(5000, 25000);
    const date = randDate(year, month);
    lines.push(line(eid, date, '1100', amt, 0, `Other revenue - ${items[i - 1]}`));
    lines.push(line(eid, date, '4300', 0, amt, `Other revenue - ${items[i - 1]}`));
  }

  // ═══════════════════════════════════════
  // EMPLOYEE EXPENSE REIMBURSEMENTS
  // ═══════════════════════════════════════
  for (let i = 1; i <= 20; i++) {
    const eid = nextEntry('JE-EXP');
    const depts = ['Engineering', 'Sales', 'Marketing', 'Finance', 'Product', 'Legal'];
    const dept = depts[i % depts.length];
    const amt = randBetween(200, 3500);
    const date = randDate(year, month);
    const acct = dept === 'Engineering' ? '6200' : dept === 'Sales' ? '7300' : dept === 'Marketing' ? '7100' : '8300';
    lines.push(line(eid, date, acct, amt, 0, `Employee expense reimb - ${dept} team member ${i}`));
    lines.push(line(eid, date, '1000', 0, amt, `Employee expense reimb - ${dept} team member ${i}`));
  }

  // ═══════════════════════════════════════
  // VENDOR PAYMENTS (clear AP)
  // ═══════════════════════════════════════
  const apPayments = 30;
  for (let i = 1; i <= apPayments; i++) {
    const eid = nextEntry('JE-VPAY');
    const amt = randBetween(15000, 120000);
    const date = randDate(year, month);
    lines.push(line(eid, date, '2000', amt, 0, `Vendor payment - Check/ACH ${4000 + i}`));
    lines.push(line(eid, date, '1000', 0, amt, `Vendor payment - Check/ACH ${4000 + i}`));
  }

  // Commission payout
  {
    const eid = nextEntry('JE-CPAY');
    const date = `${ym}-20`;
    const amt = randBetween(250000, 300000);
    lines.push(line(eid, date, '2130', amt, 0, 'Commission payout'));
    lines.push(line(eid, date, '1000', 0, amt, 'Commission payout'));
  }

  // Debt principal payment
  {
    const eid = nextEntry('JE-DEBT');
    const date = `${ym}-15`;
    const amt = 83333.33; // $1M annual / 12
    lines.push(line(eid, date, '2300', amt, 0, 'Term loan principal payment'));
    lines.push(line(eid, date, '1000', 0, amt, 'Term loan principal payment'));
  }

  return lines;
}

// ── Generate Both Months ──
const jan2026 = generateMonth(2026, 1, {
  subscriptionRevenue: 5500000,
  usageRevenue: 480000,
  psRevenue: 820000,
  supportRevenue: 310000,
});

const dec2025 = generateMonth(2025, 12, {
  subscriptionRevenue: 5280000,
  usageRevenue: 440000,
  psRevenue: 780000,
  supportRevenue: 290000,
});

// ── Write CSV Files ──
function toCSV(rows: GLLine[]): string {
  const header = 'entry_id,entry_date,account_code,account_name,debit,credit,description';
  const body = rows.map((r) =>
    `${r.entry_id},${r.entry_date},${r.account_code},"${r.account_name}",${r.debit},${r.credit},"${r.description}"`
  );
  return [header, ...body].join('\n') + '\n';
}

function toCOACSV(): string {
  const header = 'AccountCode,AccountName';
  const body = COA.map(([code, name]) => `${code},"${name}"`);
  return [header, ...body].join('\n') + '\n';
}

// Validate balance per entry
function validate(rows: GLLine[], label: string) {
  const byEntry = new Map<string, { dr: number; cr: number }>();
  for (const r of rows) {
    const e = byEntry.get(r.entry_id) ?? { dr: 0, cr: 0 };
    e.dr += parseFloat(r.debit);
    e.cr += parseFloat(r.credit);
    byEntry.set(r.entry_id, e);
  }
  let imbalanced = 0;
  for (const [eid, { dr, cr }] of byEntry) {
    if (Math.abs(dr - cr) > 0.02) {
      console.log(`  IMBALANCED: ${eid} dr=${dr.toFixed(2)} cr=${cr.toFixed(2)} diff=${(dr - cr).toFixed(2)}`);
      imbalanced++;
    }
  }
  console.log(`${label}: ${rows.length} lines, ${byEntry.size} entries, ${imbalanced} imbalanced`);
  if (imbalanced > 0) {
    console.error(`ERROR: ${imbalanced} imbalanced entries in ${label}`);
    process.exit(1);
  }
}

validate(jan2026, 'Jan 2026');
validate(dec2025, 'Dec 2025');

writeFileSync(join(__dirname, 'meridian_coa.csv'), toCOACSV());
writeFileSync(join(__dirname, 'meridian_gl_jan_2026.csv'), toCSV(jan2026));
writeFileSync(join(__dirname, 'meridian_gl_dec_2025.csv'), toCSV(dec2025));

console.log('\nFiles written:');
console.log(`  demo/meridian_coa.csv — ${COA.length} accounts`);
console.log(`  demo/meridian_gl_jan_2026.csv — ${jan2026.length} lines`);
console.log(`  demo/meridian_gl_dec_2025.csv — ${dec2025.length} lines`);
console.log('\nMeridian SaaS Inc. demo dataset generation complete.');
