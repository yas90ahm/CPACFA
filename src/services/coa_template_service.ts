/**
 * CoA template service — detect source system from CSV/XLSX headers and apply account type mapping.
 * Supports QuickBooks Online, Xero, NetSuite. Falls back to generic when not detected.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { AccountType } from '../types/financial.js';

export type CoaSource = 'quickbooks_online' | 'xero' | 'netsuite' | 'generic';

export interface CoaTemplate {
  source: string;
  accountMappings: Array<{
    account_type: string;
    detail_type: string | null;
    category: AccountType;
  }>;
  headerHints?: string[];
}

const TEMPLATES_DIR = join(process.cwd(), 'src', 'data', 'coa_templates');
const TEMPLATE_FILES: Record<Exclude<CoaSource, 'generic'>, string> = {
  quickbooks_online: 'quickbooks_online.json',
  xero: 'xero.json',
  netsuite: 'netsuite.json',
};

const templateCache = new Map<CoaSource, CoaTemplate | null>();

function loadTemplate(source: Exclude<CoaSource, 'generic'>): CoaTemplate | null {
  if (templateCache.has(source)) return templateCache.get(source) ?? null;
  const path = join(TEMPLATES_DIR, TEMPLATE_FILES[source]);
  if (!existsSync(path)) {
    templateCache.set(source, null);
    return null;
  }
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as CoaTemplate;
    templateCache.set(source, parsed);
    return parsed;
  } catch {
    templateCache.set(source, null);
    return null;
  }
}

function normalize(s: string): string {
  return String(s ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Detect source system from column headers.
 * Uses source-specific signals. Xero: "Account Code" (distinct); QBO: "Account"+"Name"+"Type"; NetSuite: "AcctType".
 */
export function detectSourceFromHeaders(headers: string[]): CoaSource {
  const normalized = headers.map(normalize);
  const hasExact = (needle: string) => normalized.some((n) => n === needle || n.includes(needle));
  const hasWord = (word: string) => normalized.some((n) => n.includes(word));

  if (hasExact('accountcode') && hasWord('account')) return 'xero';
  if (hasWord('account') && hasWord('name') && hasWord('type') && !hasExact('accountcode')) return 'quickbooks_online';
  if (hasExact('accttype')) return 'netsuite';

  return 'generic';
}

/**
 * Map source account type string to our AccountType.
 * Returns undefined when no mapping exists.
 */
export function mapAccountTypeToCategory(
  template: CoaTemplate,
  accountTypeRaw: string,
  detailTypeRaw?: string | null
): AccountType | undefined {
  const at = normalize(accountTypeRaw);
  const dt = detailTypeRaw ? normalize(detailTypeRaw) : null;
  for (const m of template.accountMappings) {
    if (normalize(m.account_type) !== at) continue;
    if (m.detail_type != null && m.detail_type !== '') {
      if (dt && normalize(m.detail_type) === dt) return m.category as AccountType;
    } else {
      return m.category as AccountType;
    }
  }
  for (const m of template.accountMappings) {
    if (normalize(m.account_type) === at && (m.detail_type == null || m.detail_type === '')) {
      return m.category as AccountType;
    }
  }
  return undefined;
}

export interface DetectedCoaResult {
  source: CoaSource;
  template: CoaTemplate | null;
}

/**
 * Detect source and return template if found.
 */
export function detectCoaSource(headers: string[]): DetectedCoaResult {
  const source = detectSourceFromHeaders(headers);
  const template = source !== 'generic' ? loadTemplate(source) : null;
  return { source, template };
}
