/**
 * Chart of Accounts upload service — parse CSV, validate, upsert.
 * COA is uploaded once during onboarding, reused for all periods.
 */

import { parse } from 'csv-parse/sync';
import type { Pool } from 'pg';
import type { CoaUploadRow } from '../types/coa.js';
import * as coaRepository from '../db/repositories/coa_repository.js';

const VALID_ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;

/** COA column mappings: raw header variants → canonical key */
const COA_COLUMN_MAP: Record<string, readonly string[]> = {
  account_code: [
    'accountcode',
    'account_code',
    'account code',
    'code',
    'gl_code',
    'ledger_code',
    'account_number',
    'acct_no',
    'acct code',
  ],
  account_name: [
    'accountname',
    'account_name',
    'account name',
    'name',
    'description',
    'gl_account',
    'ledger_account',
    'account_description',
  ],
  account_type: [
    'accounttype',
    'account_type',
    'account type',
    'type',
    'accttype',
    'acct_type',
    'category',
  ],
  account_subtype: ['account_subtype', 'account subtype', 'subtype', 'sub_type', 'sub type'],
  parent_account_code: [
    'parent_account_code',
    'parent account code',
    'parent_code',
    'parent code',
    'parent',
  ],
};

function normalizeHeader(h: string): string {
  return String(h ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

function mapHeaderToCanonical(rawHeader: string): string | null {
  const n = normalizeHeader(rawHeader);
  for (const [canonical, variants] of Object.entries(COA_COLUMN_MAP)) {
    for (const v of variants) {
      const vn = normalizeHeader(v);
      if (n === vn || n.includes(vn) || vn.includes(n)) return canonical;
    }
  }
  return null;
}

/**
 * Parse COA CSV file to structured data.
 * Expected columns: account_code, account_name, account_type; optional: account_subtype, parent_account_code.
 * Handles variations like "Account Code", "Code", "Acct Code".
 */
export function parseCoaCsv(fileBuffer: Buffer): CoaUploadRow[] {
  const input = fileBuffer.toString('utf8');
  const records = parse(input, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, unknown>[];

  if (records.length === 0) return [];

  const rawHeaders = Object.keys(records[0]!);
  const headerToCanonical: Record<string, string> = {};
  for (const raw of rawHeaders) {
    const canonical = mapHeaderToCanonical(raw);
    if (canonical && !Object.values(headerToCanonical).includes(canonical)) {
      headerToCanonical[raw] = canonical;
    }
  }

  const rows: CoaUploadRow[] = [];
  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const mapped: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      const canon = headerToCanonical[k];
      if (canon && v != null && String(v).trim() !== '') {
        mapped[canon] = String(v).trim();
      }
    }
    const accountCode = mapped.account_code;
    const accountName = mapped.account_name;
    const accountType = mapped.account_type;
    if (!accountCode || !accountName || !accountType) continue;
    rows.push({
      account_code: accountCode,
      account_name: accountName,
      account_type: accountType,
      ...(mapped.account_subtype && { account_subtype: mapped.account_subtype }),
      ...(mapped.parent_account_code && { parent_account_code: mapped.parent_account_code }),
    });
  }
  return rows;
}

/**
 * Validate COA data before upload.
 * - Check account_type is valid (Asset|Liability|Equity|Revenue|Expense)
 * - Check no duplicate account_codes
 * - Check required fields present
 */
export function validateCoaData(rows: CoaUploadRow[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seenCodes = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const lineNum = i + 2; // 1-based, +1 for header

    const code = String(row.account_code ?? '').trim();
    const name = String(row.account_name ?? '').trim();
    const typeVal = String(row.account_type ?? '').trim();

    if (!code) errors.push(`Row ${lineNum}: account_code is required`);
    if (!name) errors.push(`Row ${lineNum}: account_name is required`);
    if (!typeVal) errors.push(`Row ${lineNum}: account_type is required`);

    if (typeVal && !VALID_ACCOUNT_TYPES.includes(typeVal as (typeof VALID_ACCOUNT_TYPES)[number])) {
      errors.push(
        `Row ${lineNum}: invalid account_type "${typeVal}". Must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`
      );
    }

    if (code) {
      if (seenCodes.has(code)) {
        errors.push(`Row ${lineNum}: duplicate account_code "${code}"`);
      }
      seenCodes.add(code);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Upload COA for a tenant.
 * Validates data, upserts to database, returns summary.
 */
export async function uploadCoaForTenant(
  pool: Pool,
  tenantId: string,
  fileBuffer: Buffer,
  uploadedBy?: string
): Promise<{ success: boolean; accountCount: number; errors?: string[] }> {
  const rows = parseCoaCsv(fileBuffer);

  if (rows.length === 0) {
    return {
      success: false,
      accountCount: 0,
      errors: ['No valid COA rows found. Expected columns: account_code, account_name, account_type'],
    };
  }

  const validation = validateCoaData(rows);
  if (!validation.valid) {
    return {
      success: false,
      accountCount: 0,
      errors: validation.errors,
    };
  }

  await coaRepository.upsertAccounts(pool, tenantId, rows, { createdBy: uploadedBy });

  return {
    success: true,
    accountCount: rows.length,
  };
}
