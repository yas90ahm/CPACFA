/**
 * ERP Mapping Engine — transforms raw ERP data into canonical entries using stored mapping profiles.
 *
 * Every money field passes through Decimal.js (never JavaScript number arithmetic).
 * Profiles and rules live in the database so they can be updated without redeployment.
 */

import type { Pool } from 'pg';
import type {
  CanonicalTrialBalanceEntry,
  CanonicalJournalEntryLine,
  CanonicalChartOfAccountsEntry,
  CanonicalAccountType,
  NormalBalance,
} from '../types/canonical_ingestion.js';
import type {
  ErpMappingProfile,
  ErpMappingRule,
  MappingDataType,
  TransformConfig,
} from '../types/erp_mapping.js';
import { from } from '../utils/decimal.js';

/* ── Nested-value accessor ────────────────────────────────────────── */

/**
 * Navigate a dot-separated path with bracket notation.
 * Supports patterns like `ColData[0].value` and `Cells[0].Attributes[0].Value`.
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  if (obj == null || !path) return undefined;

  // Split on `.` but preserve bracket indices — e.g. "ColData[0].value" => ["ColData[0]", "value"]
  const segments = path.split('.');
  let current: unknown = obj;

  for (const segment of segments) {
    if (current == null) return undefined;

    // Match array bracket notation: `fieldName[index]`
    const bracketMatch = segment.match(/^([^[]+)\[(\d+)\]$/);
    if (bracketMatch) {
      const [, field, idxStr] = bracketMatch;
      const container = (current as Record<string, unknown>)[field!];
      if (!Array.isArray(container)) return undefined;
      current = container[Number(idxStr)];
    } else {
      current = (current as Record<string, unknown>)[segment];
    }
  }

  return current;
}

/* ── Transform implementations ────────────────────────────────────── */

/**
 * Apply a single transform rule to a raw ERP object and return the canonical string value.
 */
export function applyTransform(raw: unknown, rule: ErpMappingRule): string | null {
  const config: TransformConfig = rule.transformConfig ?? {};

  switch (rule.transformType) {
    /* ---- direct: 1:1 field copy ---- */
    case 'direct': {
      const v = getNestedValue(raw, rule.sourceField);
      return v != null ? String(v) : rule.defaultValue ?? null;
    }

    /* ---- decimal_coerce: strip formatting, parse to Decimal ---- */
    case 'decimal_coerce': {
      const v = getNestedValue(raw, rule.sourceField);
      if (v == null || String(v).trim() === '') return rule.defaultValue ?? '0.00';
      try {
        const cleaned = String(v).replace(/[$,\s]/g, '');
        return from(cleaned).toDecimalPlaces(2).toFixed(2);
      } catch {
        return rule.defaultValue ?? '0.00';
      }
    }

    /* ---- date_parse: normalize to ISO YYYY-MM-DD ---- */
    case 'date_parse': {
      const v = getNestedValue(raw, rule.sourceField);
      if (v == null || String(v).trim() === '') return rule.defaultValue ?? null;
      const raw_str = String(v).trim();

      const fmt = config.sourceDateFormat;
      if (fmt) {
        const parsed = parseDateWithFormat(raw_str, fmt);
        if (parsed) return parsed;
      }
      // Fallback: let the JS Date constructor try
      const d = new Date(raw_str);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      return rule.defaultValue ?? null;
    }

    /* ---- nested_path: explicit deep access ---- */
    case 'nested_path': {
      const path = config.nestedPath ?? rule.sourceField;
      const v = getNestedValue(raw, path);
      return v != null ? String(v) : rule.defaultValue ?? null;
    }

    /* ---- default_value: fill blanks ---- */
    case 'default_value': {
      const v = getNestedValue(raw, rule.sourceField);
      if (v == null || String(v).trim() === '') return rule.defaultValue ?? null;
      return String(v);
    }

    /* ---- strip_format: remove listed characters ---- */
    case 'strip_format': {
      const v = getNestedValue(raw, rule.sourceField);
      if (v == null) return rule.defaultValue ?? null;
      const chars = config.stripChars ?? '$, ';
      let result = String(v);
      for (const ch of chars) {
        // Split/join is safe for single-char removal without regex escaping
        result = result.split(ch).join('');
      }
      return result;
    }

    /* ---- concatenate: join multiple source fields ---- */
    case 'concatenate': {
      const fields = config.fields ?? [];
      const sep = config.separator ?? ' ';
      const parts = fields
        .map((f) => {
          const val = getNestedValue(raw, f);
          return val != null ? String(val) : '';
        })
        .filter((p) => p !== '');
      return parts.length > 0 ? parts.join(sep) : rule.defaultValue ?? null;
    }

    /* ---- conditional: not yet implemented ---- */
    case 'conditional': {
      console.warn(
        `[erp_mapping_engine] conditional transform not implemented; returning source value for rule ${rule.id} (field: ${rule.canonicalField})`,
      );
      const v = getNestedValue(raw, rule.sourceField);
      return v != null ? String(v) : rule.defaultValue ?? null;
    }

    default: {
      // Unknown transform — return direct value as fallback
      const v = getNestedValue(raw, rule.sourceField);
      return v != null ? String(v) : rule.defaultValue ?? null;
    }
  }
}

/* ── Date-format parsing ──────────────────────────────────────────── */

/**
 * Parse a date string according to a named format pattern.
 * Returns ISO YYYY-MM-DD on success, null on failure.
 */
function parseDateWithFormat(value: string, format: string): string | null {
  const upper = format.toUpperCase();

  // Extract numeric parts from the value
  const parts = value.replace(/[^\d]/g, ' ').trim().split(/\s+/);

  if (upper === 'MM/DD/YYYY' || upper === 'MM-DD-YYYY') {
    if (parts.length < 3) return null;
    const [mm, dd, yyyy] = parts;
    return `${yyyy!.padStart(4, '0')}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`;
  }

  if (upper === 'DD/MM/YYYY' || upper === 'DD-MM-YYYY') {
    if (parts.length < 3) return null;
    const [dd, mm, yyyy] = parts;
    return `${yyyy!.padStart(4, '0')}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`;
  }

  if (upper === 'YYYY-MM-DD' || upper === 'YYYY/MM/DD') {
    if (parts.length < 3) return null;
    const [yyyy, mm, dd] = parts;
    return `${yyyy!.padStart(4, '0')}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`;
  }

  // DD-MMM-YYYY e.g. "15-Jan-2025"
  if (upper === 'DD-MMM-YYYY' || upper === 'DD/MMM/YYYY') {
    const monthMap: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    };
    const tokens = value.split(/[-/\s]+/);
    if (tokens.length < 3) return null;
    const dd = tokens[0]!.padStart(2, '0');
    const mm = monthMap[tokens[1]!.toUpperCase().slice(0, 3)] ?? null;
    const yyyy = tokens[2]!.padStart(4, '0');
    if (!mm) return null;
    return `${yyyy}-${mm}-${dd}`;
  }

  // Unrecognized format — return null so caller falls back to Date constructor
  return null;
}

/* ── Account-type helpers ─────────────────────────────────────────── */

const ACCOUNT_TYPE_MAP: Record<string, CanonicalAccountType> = {
  asset: 'Asset',
  assets: 'Asset',
  liability: 'Liability',
  liabilities: 'Liability',
  equity: 'Equity',
  'stockholders equity': 'Equity',
  'shareholders equity': 'Equity',
  'owner equity': 'Equity',
  revenue: 'Revenue',
  revenues: 'Revenue',
  income: 'Revenue',
  sales: 'Revenue',
  expense: 'Expense',
  expenses: 'Expense',
  'cost of goods sold': 'Expense',
  cogs: 'Expense',
};

/**
 * Parse a free-text account type string into a CanonicalAccountType.
 * Returns null if the value cannot be mapped.
 */
function parseAccountType(value: string | null | undefined): CanonicalAccountType | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return ACCOUNT_TYPE_MAP[normalized] ?? null;
}

/**
 * Infer normal balance from account type.
 * Asset and Expense accounts have debit normal balances; Liability, Equity, and Revenue have credit.
 */
function inferNormalBalance(accountType: string | null | undefined): NormalBalance | null {
  const parsed = parseAccountType(accountType);
  if (!parsed) return null;
  return parsed === 'Asset' || parsed === 'Expense' ? 'debit' : 'credit';
}

/* ── DB helpers: load profile and rules ───────────────────────────── */

interface ProfileRow {
  id: string;
  tenant_id: string;
  connection_id: string;
  provider: string;
  profile_name: string;
  data_type: MappingDataType;
  is_template: boolean;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

interface RuleRow {
  id: string;
  profile_id: string;
  source_field: string;
  canonical_field: string;
  transform_type: string;
  transform_config: TransformConfig | null;
  default_value: string | null;
  is_required: boolean;
  sort_order: number;
  created_at: string;
}

function rowToProfile(row: ProfileRow): ErpMappingProfile {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    connectionId: row.connection_id,
    provider: row.provider,
    profileName: row.profile_name,
    dataType: row.data_type,
    isTemplate: row.is_template,
    isActive: row.is_active,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? undefined,
  };
}

function rowToRule(row: RuleRow): ErpMappingRule {
  return {
    id: row.id,
    profileId: row.profile_id,
    sourceField: row.source_field,
    canonicalField: row.canonical_field,
    transformType: row.transform_type as ErpMappingRule['transformType'],
    transformConfig: row.transform_config,
    defaultValue: row.default_value,
    isRequired: row.is_required,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

async function loadActiveProfile(
  pool: Pool,
  tenantId: string,
  connectionId: string,
  dataType: MappingDataType,
): Promise<ErpMappingProfile | null> {
  const { rows } = await pool.query<ProfileRow>(
    `SELECT * FROM erp_mapping_profiles
     WHERE tenant_id = $1 AND connection_id = $2 AND data_type = $3 AND is_active = TRUE
     ORDER BY version DESC LIMIT 1`,
    [tenantId, connectionId, dataType],
  );
  return rows.length > 0 ? rowToProfile(rows[0]!) : null;
}

async function loadTemplateProfile(
  pool: Pool,
  provider: string,
  dataType: MappingDataType,
): Promise<ErpMappingProfile | null> {
  const { rows } = await pool.query<ProfileRow>(
    `SELECT * FROM erp_mapping_profiles
     WHERE tenant_id = '__system__' AND provider = $1 AND data_type = $2 AND is_template = TRUE
     ORDER BY version DESC LIMIT 1`,
    [provider, dataType],
  );
  return rows.length > 0 ? rowToProfile(rows[0]!) : null;
}

async function loadRules(pool: Pool, profileId: string): Promise<ErpMappingRule[]> {
  const { rows } = await pool.query<RuleRow>(
    `SELECT * FROM erp_mapping_rules WHERE profile_id = $1 ORDER BY sort_order`,
    [profileId],
  );
  return rows.map(rowToRule);
}

/* ── Canonical entry builders ─────────────────────────────────────── */

function buildTrialBalanceEntry(fields: Record<string, string | null>): CanonicalTrialBalanceEntry {
  return {
    accountCode: fields['accountCode'] ?? '',
    accountName: fields['accountName'] ?? '',
    debit: fields['debit'] ?? '0.00',
    credit: fields['credit'] ?? '0.00',
    currency: fields['currency'] ?? 'USD',
    entityId: fields['entityId'] ?? null,
    accountType: parseAccountType(fields['accountType']),
    department: fields['department'] ?? null,
    class: fields['class'] ?? null,
    location: fields['location'] ?? null,
    normalBalance: inferNormalBalance(fields['accountType']),
  };
}

function buildJournalEntryLine(fields: Record<string, string | null>): CanonicalJournalEntryLine {
  return {
    entryId: fields['entryId'] ?? '',
    lineNumber: Number(fields['lineNumber'] ?? '1'),
    date: fields['date'] ?? '',
    accountCode: fields['accountCode'] ?? '',
    accountName: fields['accountName'] ?? '',
    debit: fields['debit'] ?? '0.00',
    credit: fields['credit'] ?? '0.00',
    memo: fields['memo'] ?? null,
    reference: fields['reference'] ?? null,
    currency: fields['currency'] ?? 'USD',
    entityId: fields['entityId'] ?? null,
    department: fields['department'] ?? null,
    class: fields['class'] ?? null,
    location: fields['location'] ?? null,
  };
}

function buildChartOfAccountsEntry(
  fields: Record<string, string | null>,
): CanonicalChartOfAccountsEntry {
  const accountType = parseAccountType(fields['accountType']) ?? 'Expense';
  return {
    accountCode: fields['accountCode'] ?? '',
    accountName: fields['accountName'] ?? '',
    accountType,
    parentCode: fields['parentCode'] ?? null,
    isActive: fields['isActive'] !== 'false',
    normalBalance: accountType === 'Asset' || accountType === 'Expense' ? 'debit' : 'credit',
    currency: fields['currency'] ?? null,
    description: fields['description'] ?? null,
  };
}

/* ── Core mapping function ────────────────────────────────────────── */

/**
 * Transform raw ERP data into canonical entries using a stored mapping profile.
 *
 * Resolution order:
 *   1. Active tenant-specific profile for this connection + dataType
 *   2. Built-in system template for this provider + dataType
 *   3. Error if neither exists
 */
export async function applyMappingProfile(
  pool: Pool,
  tenantId: string,
  connectionId: string,
  provider: string,
  dataType: MappingDataType,
  rawData: unknown[],
): Promise<CanonicalTrialBalanceEntry[] | CanonicalJournalEntryLine[] | CanonicalChartOfAccountsEntry[]> {
  // 1. Resolve profile
  let profile = await loadActiveProfile(pool, tenantId, connectionId, dataType);
  if (!profile) {
    profile = await loadTemplateProfile(pool, provider, dataType);
  }
  if (!profile) {
    throw new Error(
      `No mapping profile or template found for provider '${provider}', dataType '${dataType}', connection '${connectionId}'`,
    );
  }

  // 2. Load rules
  const rules = await loadRules(pool, profile.id);
  if (rules.length === 0) {
    throw new Error(
      `Mapping profile '${profile.profileName}' (${profile.id}) has no rules defined`,
    );
  }

  // 3. Transform each raw item
  if (dataType === 'trial_balance') {
    return rawData.map((item) => {
      const fields = applyRulesToItem(item, rules);
      return buildTrialBalanceEntry(fields);
    });
  }

  if (dataType === 'journal_entry') {
    return rawData.map((item) => {
      const fields = applyRulesToItem(item, rules);
      return buildJournalEntryLine(fields);
    });
  }

  // chart_of_accounts
  return rawData.map((item) => {
    const fields = applyRulesToItem(item, rules);
    return buildChartOfAccountsEntry(fields);
  });
}

/**
 * Apply all mapping rules to a single raw item, producing a canonical field map.
 */
function applyRulesToItem(
  rawItem: unknown,
  rules: ErpMappingRule[],
): Record<string, string | null> {
  const fields: Record<string, string | null> = {};
  for (const rule of rules) {
    fields[rule.canonicalField] = applyTransform(rawItem, rule);
  }
  return fields;
}

/* ── Template cloning ─────────────────────────────────────────────── */

/**
 * Clone a system template profile into a tenant-specific profile for a given connection.
 * Copies the profile row with the new tenant_id/connection_id and all associated rules.
 */
export async function cloneTemplateForConnection(
  pool: Pool,
  tenantId: string,
  connectionId: string,
  provider: string,
  dataType: MappingDataType,
): Promise<ErpMappingProfile> {
  const template = await loadTemplateProfile(pool, provider, dataType);
  if (!template) {
    throw new Error(
      `No system template found for provider '${provider}', dataType '${dataType}'`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clone the profile row
    const { rows: profileRows } = await client.query<ProfileRow>(
      `INSERT INTO erp_mapping_profiles
         (tenant_id, connection_id, provider, profile_name, data_type, is_template, is_active, version, created_by)
       VALUES ($1, $2, $3, $4, $5, FALSE, TRUE, 1, $6)
       RETURNING *`,
      [
        tenantId,
        connectionId,
        provider,
        `${template.profileName} (cloned)`,
        dataType,
        tenantId,
      ],
    );
    const newProfile = rowToProfile(profileRows[0]!);

    // Clone all rules from the template
    const templateRules = await loadRules(pool, template.id);
    for (const rule of templateRules) {
      await client.query(
        `INSERT INTO erp_mapping_rules
           (profile_id, source_field, canonical_field, transform_type, transform_config, default_value, is_required, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          newProfile.id,
          rule.sourceField,
          rule.canonicalField,
          rule.transformType,
          rule.transformConfig ? JSON.stringify(rule.transformConfig) : null,
          rule.defaultValue,
          rule.isRequired,
          rule.sortOrder,
        ],
      );
    }

    await client.query('COMMIT');
    return newProfile;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
