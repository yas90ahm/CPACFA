/**
 * Agentic document classification + schema mapping for ingestion.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { assertNoNumericAmountsInAgentOutput } from '../llm/guardrails.js';
import type {
  DocumentClassification,
  ParsedSheet,
  NormalizedApItem,
  NormalizedArItem,
  NormalizedPayrollItem,
} from './ingestion_agent.js';

export interface AgenticIngestionResult {
  classification: DocumentClassification;
  confidence: number;
  rationale: string;
  schemaMapping?: Record<string, string>;
  normalized?: {
    apItems?: NormalizedApItem[];
    arItems?: NormalizedArItem[];
    payrollItems?: NormalizedPayrollItem[];
  };
}

const SYSTEM = [
  'You are a CPA-grade ingestion classifier.',
  'Given sheet headers and a sample row, classify the document and map fields.',
  'Return ONLY JSON with fields:',
  '{ classification, confidence, rationale, schemaMapping }.',
  'classification must be one of: bank_statement, tax_form, trial_balance, general_ledger, accounts_payable, accounts_receivable, payroll, other.',
  'schemaMapping maps each source header (exact key) to one canonical field name.',
  'Canonical AP: vendor, vendorId, invoiceNumber, invoiceDate, dueDate, amount, totalAmount, taxAmount, currency, status, lineDescription, poNumber.',
  'Canonical AR: customer, customerId, invoiceNumber, invoiceDate, dueDate, amount, totalAmount, taxAmount, currency, status, lineDescription.',
  'Canonical Payroll: employee, employeeId, payDate, payPeriodStart, payPeriodEnd, grossPay, netPay, taxes, benefits, deductions, currency, department.',
  'Canonical Trial Balance / General Ledger: accountName (or account, description, name; if the column holds a single concatenated line with comma-separated values e.g. line#, date, type, account, description, amount, map it to line), accountCode, debit, credit, amount (use when there is only one amount column; caller will put in debit or credit). For trial_balance and general_ledger, schemaMapping must map each relevant source header to exactly one of these canonical names.',
].join(' ');

export async function classifyIngestionAgentic(input: {
  headers: string[];
  sampleRow: Record<string, unknown> | unknown[];
}): Promise<AgenticIngestionResult | null> {
  const prompt = [
    `headers=${JSON.stringify(input.headers)}`,
    `sampleRow=${JSON.stringify(input.sampleRow)}`,
    'Return JSON only.',
  ].join('\n');
  const result = await callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 400,
    parse: parseResult,
    fallback: null,
  });
  if (result) assertNoNumericAmountsInAgentOutput(result, 'agentic_ingestion_classifier');
  return result;
}

function parseResult(raw: string): AgenticIngestionResult | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(slice) as AgenticIngestionResult;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function getByMapping(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  field: string
): string | undefined {
  const key = Object.keys(mapping).find(
    (k) => (mapping[k] ?? mapping[k.toLowerCase()] ?? '').toLowerCase() === field.toLowerCase()
  );
  const value = key ? row[key] : undefined;
  if (value == null) return undefined;
  return String(value).trim() || undefined;
}

function numByMapping(row: Record<string, unknown>, mapping: Record<string, string>, field: string): number | undefined {
  const v = getByMapping(row, mapping, field);
  if (!v) return undefined;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function normalizeByMapping(
  mapping: Record<string, string> | undefined,
  sheets: ParsedSheet[]
): AgenticIngestionResult['normalized'] {
  if (!mapping) return undefined;
  const apItems: NormalizedApItem[] = [];
  const arItems: NormalizedArItem[] = [];
  const payrollItems: NormalizedPayrollItem[] = [];
  for (const sheet of sheets) {
    const rows = sheet.rows.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) as Record<string, unknown>[];
    rows.forEach((r, rowIndex) => {
      const provenance = { sourceSheet: sheet.name, sourceRowIndex: rowIndex };
      apItems.push({
        vendor: getByMapping(r, mapping, 'vendor'),
        vendorId: getByMapping(r, mapping, 'vendorId'),
        invoiceNumber: getByMapping(r, mapping, 'invoiceNumber'),
        invoiceDate: getByMapping(r, mapping, 'invoiceDate'),
        dueDate: getByMapping(r, mapping, 'dueDate'),
        amount: numByMapping(r, mapping, 'amount'),
        totalAmount: numByMapping(r, mapping, 'totalAmount'),
        taxAmount: numByMapping(r, mapping, 'taxAmount'),
        currency: getByMapping(r, mapping, 'currency'),
        status: getByMapping(r, mapping, 'status') as NormalizedApItem['status'],
        lineDescription: getByMapping(r, mapping, 'lineDescription'),
        poNumber: getByMapping(r, mapping, 'poNumber'),
        provenance,
      });
      arItems.push({
        customer: getByMapping(r, mapping, 'customer'),
        customerId: getByMapping(r, mapping, 'customerId'),
        invoiceNumber: getByMapping(r, mapping, 'invoiceNumber'),
        invoiceDate: getByMapping(r, mapping, 'invoiceDate'),
        dueDate: getByMapping(r, mapping, 'dueDate'),
        amount: numByMapping(r, mapping, 'amount'),
        totalAmount: numByMapping(r, mapping, 'totalAmount'),
        taxAmount: numByMapping(r, mapping, 'taxAmount'),
        currency: getByMapping(r, mapping, 'currency'),
        status: getByMapping(r, mapping, 'status') as NormalizedArItem['status'],
        lineDescription: getByMapping(r, mapping, 'lineDescription'),
        provenance,
      });
      payrollItems.push({
        employee: getByMapping(r, mapping, 'employee'),
        employeeId: getByMapping(r, mapping, 'employeeId'),
        payDate: getByMapping(r, mapping, 'payDate'),
        payPeriodStart: getByMapping(r, mapping, 'payPeriodStart'),
        payPeriodEnd: getByMapping(r, mapping, 'payPeriodEnd'),
        grossPay: numByMapping(r, mapping, 'grossPay'),
        netPay: numByMapping(r, mapping, 'netPay'),
        taxes: numByMapping(r, mapping, 'taxes'),
        benefits: numByMapping(r, mapping, 'benefits'),
        deductions: numByMapping(r, mapping, 'deductions'),
        currency: getByMapping(r, mapping, 'currency'),
        department: getByMapping(r, mapping, 'department'),
        provenance,
      });
    });
  }
  return { apItems, arItems, payrollItems };
}
