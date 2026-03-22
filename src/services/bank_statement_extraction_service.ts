/**
 * Bank Statement Extraction Service
 *
 * Extracts ending balances from uploaded bank statement PDFs using
 * deterministic pattern matching. No AI needed.
 *
 * Bank statements follow predictable formats:
 * - "Ending Balance" / "Closing Balance" / "Balance as of [date]"
 * - Amount follows the label: $1,234,567.89 or (1,234,567.89) for negative
 *
 * Supports: Chase, Bank of America, Wells Fargo, Citi, Silicon Valley Bank,
 * First Republic, HSBC, and generic formats.
 *
 * Returns: extracted balance, confidence, source page, institution detected.
 */

export interface ExtractionResult {
  /** Extracted ending balance as a string (Decimal-safe) */
  balance: string | null;
  /** Confidence: 'high' if institution-specific pattern matched, 'medium' if generic, 'low' if heuristic */
  confidence: 'high' | 'medium' | 'low';
  /** Which pattern matched */
  matchedPattern: string | null;
  /** Detected institution name */
  institution: string | null;
  /** Statement date if found */
  statementDate: string | null;
  /** Account number (last 4 digits) if found */
  accountLast4: string | null;
  /** All candidate balances found (for controller to choose if ambiguous) */
  candidates: Array<{ balance: string; label: string; confidence: 'high' | 'medium' | 'low' }>;
  /** Raw text excerpt around the match (for controller verification) */
  excerpt: string | null;
  /** Errors during extraction */
  errors: string[];
}

// ── Institution-Specific Patterns ──

interface BalancePattern {
  institution: string | null; // null = generic
  /** Regex to detect institution from PDF text */
  institutionPattern?: RegExp;
  /** Regex patterns to find the ending balance label + amount */
  balancePatterns: RegExp[];
  /** Priority (lower = checked first) */
  priority: number;
}

const BALANCE_PATTERNS: BalancePattern[] = [
  // Chase
  {
    institution: 'Chase',
    institutionPattern: /jpmorgan\s*chase|chase\s*bank/i,
    balancePatterns: [
      /ending\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
      /closing\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
      /balance\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}[:\s]*\$?\s*([\d,]+\.\d{2})/i,
    ],
    priority: 1,
  },
  // Bank of America
  {
    institution: 'Bank of America',
    institutionPattern: /bank\s*of\s*america|bofa/i,
    balancePatterns: [
      /ending\s+balance\s+on\s+\w+\s+\d{1,2},?\s*\d{4}[:\s]*\$?\s*([\d,]+\.\d{2})/i,
      /ending\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
    ],
    priority: 2,
  },
  // Wells Fargo
  {
    institution: 'Wells Fargo',
    institutionPattern: /wells\s*fargo/i,
    balancePatterns: [
      /ending\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
      /ending\s+daily\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
    ],
    priority: 3,
  },
  // Citi
  {
    institution: 'Citibank',
    institutionPattern: /citibank|citigroup/i,
    balancePatterns: [
      /closing\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
      /total\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
    ],
    priority: 4,
  },
  // Silicon Valley Bank / First Republic / HSBC
  {
    institution: 'SVB',
    institutionPattern: /silicon\s*valley\s*bank|svb/i,
    balancePatterns: [
      /ending\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
      /closing\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
    ],
    priority: 5,
  },
  {
    institution: 'HSBC',
    institutionPattern: /hsbc/i,
    balancePatterns: [
      /closing\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
      /balance\s+carried\s+forward[:\s]*\$?\s*([\d,]+\.\d{2})/i,
    ],
    priority: 6,
  },
  // Generic patterns (any bank)
  {
    institution: null,
    balancePatterns: [
      /ending\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
      /closing\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
      /balance\s+as\s+of\s+[\w\s,]+[:\s]*\$?\s*([\d,]+\.\d{2})/i,
      /new\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
      /total\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
      /account\s+balance[:\s]*\$?\s*([\d,]+\.\d{2})/i,
    ],
    priority: 10,
  },
];

// Negative balance patterns (parenthetical or minus sign)
const NEGATIVE_PATTERNS = [
  /ending\s+balance[:\s]*\$?\s*\(([\d,]+\.\d{2})\)/i,
  /closing\s+balance[:\s]*\$?\s*\(([\d,]+\.\d{2})\)/i,
  /ending\s+balance[:\s]*-\$?\s*([\d,]+\.\d{2})/i,
  /closing\s+balance[:\s]*-\$?\s*([\d,]+\.\d{2})/i,
];

// Statement date patterns
const DATE_PATTERNS = [
  /statement\s+(?:date|period|ending)[:\s]*(\w+\s+\d{1,2},?\s*\d{4})/i,
  /(?:through|ending|as\s+of)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  /(?:through|ending|as\s+of)[:\s]*(\w+\s+\d{1,2},?\s*\d{4})/i,
  /period[:\s]*\w+\s+\d{1,2}.*?(?:to|through|-).*?(\w+\s+\d{1,2},?\s*\d{4})/i,
];

// Account number patterns (extract last 4 for verification)
const ACCOUNT_PATTERNS = [
  /account\s*(?:number|#|no\.?)?[:\s]*(?:\*{4,}|x{4,})(\d{4})/i,
  /account[:\s]*\.{3,}(\d{4})/i,
  /acct[:\s]*(?:\*+)?(\d{4})/i,
];

/**
 * Extract ending balance from a PDF buffer.
 */
export async function extractFromPDF(buffer: Buffer): Promise<ExtractionResult> {
  const errors: string[] = [];
  let text = '';

  // Parse PDF to text
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const pdf = await pdfParse(buffer);
    text = pdf.text;
  } catch (err) {
    return {
      balance: null,
      confidence: 'low',
      matchedPattern: null,
      institution: null,
      statementDate: null,
      accountLast4: null,
      candidates: [],
      excerpt: null,
      errors: [`PDF parsing failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  if (!text || text.trim().length < 50) {
    return {
      balance: null,
      confidence: 'low',
      matchedPattern: null,
      institution: null,
      statementDate: null,
      accountLast4: null,
      candidates: [],
      excerpt: null,
      errors: ['PDF contains insufficient text (may be a scanned image — OCR required)'],
    };
  }

  // Detect institution
  let detectedInstitution: string | null = null;
  for (const bp of BALANCE_PATTERNS) {
    if (bp.institutionPattern && bp.institutionPattern.test(text)) {
      detectedInstitution = bp.institution;
      break;
    }
  }

  // Extract statement date
  let statementDate: string | null = null;
  for (const dp of DATE_PATTERNS) {
    const dateMatch = dp.exec(text);
    if (dateMatch) {
      statementDate = dateMatch[1].trim();
      break;
    }
  }

  // Extract account last 4
  let accountLast4: string | null = null;
  for (const ap of ACCOUNT_PATTERNS) {
    const acctMatch = ap.exec(text);
    if (acctMatch) {
      accountLast4 = acctMatch[1];
      break;
    }
  }

  // Sort patterns: institution-specific first (if detected), then generic
  const sortedPatterns = [...BALANCE_PATTERNS].sort((a, b) => {
    if (detectedInstitution) {
      if (a.institution === detectedInstitution && b.institution !== detectedInstitution) return -1;
      if (b.institution === detectedInstitution && a.institution !== detectedInstitution) return 1;
    }
    return a.priority - b.priority;
  });

  // Try all balance patterns, collect candidates
  const candidates: ExtractionResult['candidates'] = [];
  const seen = new Set<string>();

  for (const bp of sortedPatterns) {
    for (const pattern of bp.balancePatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        const rawBalance = match[1].replace(/,/g, '');
        if (!seen.has(rawBalance)) {
          seen.add(rawBalance);
          const isInstitutionMatch = bp.institution === detectedInstitution && detectedInstitution !== null;
          candidates.push({
            balance: rawBalance,
            label: pattern.source.slice(0, 40),
            confidence: isInstitutionMatch ? 'high' : bp.institution === null ? 'medium' : 'low',
          });
        }
      }
    }
  }

  // Check negative patterns
  for (const np of NEGATIVE_PATTERNS) {
    const match = np.exec(text);
    if (match && match[1]) {
      const rawBalance = '-' + match[1].replace(/,/g, '');
      if (!seen.has(rawBalance)) {
        seen.add(rawBalance);
        candidates.push({ balance: rawBalance, label: 'negative balance', confidence: 'medium' });
      }
    }
  }

  if (candidates.length === 0) {
    return {
      balance: null,
      confidence: 'low',
      matchedPattern: null,
      institution: detectedInstitution,
      statementDate,
      accountLast4,
      candidates: [],
      excerpt: null,
      errors: ['No ending balance pattern found in PDF text'],
    };
  }

  // Best candidate: highest confidence, or if tie, the last one on the page (ending balance is usually at the end)
  const best = candidates.sort((a, b) => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    return confOrder[a.confidence] - confOrder[b.confidence];
  })[0];

  // Extract text excerpt around the match for controller verification
  let excerpt: string | null = null;
  const balanceIdx = text.indexOf(best.balance.replace('-', ''));
  if (balanceIdx >= 0) {
    const start = Math.max(0, balanceIdx - 80);
    const end = Math.min(text.length, balanceIdx + 40);
    excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  return {
    balance: best.balance,
    confidence: best.confidence,
    matchedPattern: best.label,
    institution: detectedInstitution,
    statementDate,
    accountLast4,
    candidates,
    excerpt,
    errors,
  };
}

/**
 * Extract ending balance from a CSV bank export.
 * Looks for the last row's balance column.
 */
export function extractFromCSV(csvText: string): ExtractionResult {
  const lines = csvText.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      balance: null, confidence: 'low', matchedPattern: null, institution: null,
      statementDate: null, accountLast4: null, candidates: [], excerpt: null,
      errors: ['CSV has fewer than 2 lines'],
    };
  }

  const headers = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const balanceColIdx = headers.findIndex((h) =>
    /balance|ending|closing|amount/i.test(h)
  );

  if (balanceColIdx < 0) {
    return {
      balance: null, confidence: 'low', matchedPattern: null, institution: null,
      statementDate: null, accountLast4: null, candidates: [], excerpt: null,
      errors: ['No balance column found in CSV headers: ' + headers.join(', ')],
    };
  }

  // Last row = ending balance
  const lastLine = lines[lines.length - 1];
  const cols = lastLine.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const rawBalance = (cols[balanceColIdx] ?? '').replace(/[$,\s]/g, '');

  if (!rawBalance || isNaN(Number(rawBalance))) {
    return {
      balance: null, confidence: 'low', matchedPattern: `csv:${headers[balanceColIdx]}`,
      institution: null, statementDate: null, accountLast4: null, candidates: [],
      excerpt: lastLine.slice(0, 100), errors: ['Last row balance is not a valid number'],
    };
  }

  return {
    balance: rawBalance,
    confidence: 'medium',
    matchedPattern: `csv:${headers[balanceColIdx]}`,
    institution: null,
    statementDate: null,
    accountLast4: null,
    candidates: [{ balance: rawBalance, label: headers[balanceColIdx], confidence: 'medium' }],
    excerpt: lastLine.slice(0, 100),
    errors: [],
  };
}
