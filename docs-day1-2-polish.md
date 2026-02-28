# Sovereign CPA Engine — Day 1-2 Polish Report

**Date:** 2026-02-27

---

## Task 1: Fix Keyword Classifier First-Match-Wins Bug

**Status:** DONE

**Problem:** The account classifier in `src/services/accountClassifier.ts` used a first-match-wins keyword scan on `DEFAULT_KEYWORDS`. This caused misclassifications like "Professional Liability Expense" → `LIABILITY` (matched "liability" before "expense").

**Fix:** Implemented a 3-tier classification strategy in `classifyAccountNameWithKeyword()`:

1. **Compound overrides** — domain-specific multi-word phrases, longest match first (e.g., "deferred revenue" → LIABILITY, "cost of goods sold" → EXPENSE, "accumulated depreciation" → ASSET)
2. **Suffix overrides** — last word of account name (e.g., trailing "expense" → EXPENSE, trailing "revenue" → REVENUE)
3. **Fallback keyword scan** — original first-match behavior, only reached when tiers 1–2 don't match

**Verification:** 20/20 classifier tests pass, including:

| Account Name | Expected | Result |
|---|---|---|
| Professional Liability Expense | EXPENSE | EXPENSE |
| Property Tax Expense | EXPENSE | EXPENSE |
| Equipment Rent Expense | EXPENSE | EXPENSE |
| Interest Expense | EXPENSE | EXPENSE |
| Interest Income | REVENUE | REVENUE |
| Deferred Revenue | LIABILITY | LIABILITY |
| Unearned Revenue | LIABILITY | LIABILITY |
| Accounts Receivable | ASSET | ASSET |
| Accounts Payable | LIABILITY | LIABILITY |
| Accumulated Depreciation | ASSET | ASSET |
| Retained Earnings | EQUITY | EQUITY |
| Cash and Cash Equivalents | ASSET | ASSET |
| Cost of Goods Sold | EXPENSE | EXPENSE |
| Subscription Revenue | REVENUE | REVENUE |
| Salaries & Wages | EXPENSE | EXPENSE |
| Common Stock | EQUITY | EQUITY |
| Long-Term Debt | LIABILITY | LIABILITY |
| Prepaid Insurance | ASSET | ASSET |
| Accrued Payroll | LIABILITY | LIABILITY |
| Depreciation Expense | EXPENSE | EXPENSE |

---

## Task 2: Audit Binder Export Buttons

**Status:** DONE

**File modified:** `frontend/app/close/[sessionId]/review/CertificationRecord.tsx`

**Changes:**
- Added **Export PDF** and **Export JSON** buttons in a new "Audit Binder Export" section
- Buttons visible only in CERTIFIED or LOCKED state (component is only rendered in those states)
- PDF export calls `GET /api/audit/binder/export/pdf?closeSessionId=...` using raw `fetch()` with Bearer token
- JSON export calls `GET /api/audit/binder?closeSessionId=...` and saves formatted JSON
- Content-type validation ensures server returns a valid `application/pdf` before triggering download
- Loading spinners (`Loader2` icon with `animate-spin`) during export
- Error banner displayed below buttons on failure
- Follows existing download patterns (blob → `createObjectURL` → temporary anchor element → cleanup)

**Build:** Clean (no TypeScript errors)
**Integration test:** 11/11 passed after change

---

## Task 3: Full Test Suite Results

| Suite | Passed | Failed | Skipped | Total | Command |
|---|---|---|---|---|---|
| **Integration** | 11 | 0 | 0 | 11 | `npm run test:integration` |
| **Classifier** | 20 | 0 | 0 | 20 | `node _verify_classifier.js` |
| **UAT** | 134 | 7 | 5 | 146 | `npx tsx tests/uat/run-uat.ts` |
| **Accounting Accuracy** | 47 | 0 | 8 | 55 | `npx tsx tests/accounting/run-accuracy.ts` |

### UAT Failures (pre-existing, not caused by this session's changes)

| Test | Error |
|---|---|
| [10.3] Approved reconciliation has audit timestamps | Expected reconciliation audit timestamps |
| [10.6] Settings endpoints accessible | Unexpected: 400 |
| [13.7] Portfolio entities endpoint accessible | Unexpected: 403 |

*Note: 7 total failures reported (some cascading). All 3 root failures are pre-existing issues related to audit timestamps, settings endpoint validation, and portfolio RBAC permissions.*

### Accounting Accuracy Skips (hardcoded in test files)

8 scenarios in Group 3 (Reconciliation) are skipped with `skipReason: 'Recon routes return 404 at runtime (UAT finding)'`. The underlying recon route issue was fixed in a prior session (added `prestart` hook to `package.json`), but the skip flag is hardcoded in the test file which cannot be modified per constraints.

---

## Task 4: Meridian SaaS Inc. Demo Dataset

**Status:** DONE

**Output directory:** `demo/`

| File | Contents |
|---|---|
| `meridian_coa.csv` | 69 accounts — full SaaS chart of accounts |
| `meridian_gl_jan_2026.csv` | 808 GL lines, 398 balanced journal entries |
| `meridian_gl_dec_2025.csv` | 808 GL lines, 398 balanced entries (prior period) |
| `generate_meridian.ts` | Reproducible TypeScript generator script |

### Company Profile

- **Entity:** Meridian SaaS Inc.
- **Industry:** B2B SaaS (PE-backed mid-market)
- **Monthly Revenue:** ~$7.1M ($85M ARR run rate)
- **Periods:** January 2026 (current) + December 2025 (prior, for variance analysis)
- **Imbalanced entries:** 0

### Revenue Breakdown (Jan 2026)

| Category | Target |
|---|---|
| Subscription Revenue | $5,500,000 |
| Usage-based Revenue | $480,000 |
| Professional Services | $820,000 |
| Support & Maintenance | $310,000 |
| **Total** | **~$7,110,000** |

### Journal Entry Categories

| Category | Entries | Lines |
|---|---|---|
| Subscription revenue recognition | 100 batches | 200 |
| Usage-based revenue accrual | 25 cohorts | 50 |
| Professional services revenue | 20 projects | 40 |
| Support revenue recognition | 10 tiers | 20 |
| Cash collections | 40 batches | 80 |
| New subscription bookings | 30 deals | 60 |
| Cloud hosting (AWS, GCP, etc.) | 8 vendors | 16 |
| Third-party APIs (Twilio, Stripe, etc.) | 6 vendors | 12 |
| Payroll (bi-weekly) | 2 runs | 12 |
| Stock-based compensation | 1 entry | 4 |
| R&D contractors | 12 engagements | 24 |
| R&D tools | 5 vendors | 10 |
| Marketing campaigns | 15 channels | 30 |
| Events & sponsorships | 6 events | 12 |
| Sales commissions | 1 accrual | 2 |
| Travel & entertainment | 15 reports | 30 |
| Legal & professional | 6 firms | 12 |
| Software subscriptions | 10 vendors | 20 |
| Prepaid amortization | 8 items | 16 |
| Accrual adjustments | 6 items | 12 |
| Customer refunds/credits | 8 memos | 16 |
| Other revenue | 5 items | 10 |
| Employee expense reimbursements | 20 reports | 40 |
| Vendor payments | 30 payments | 60 |
| Depreciation & amortization | 1 entry | 4 |
| Interest, taxes, FX, debt service | 5 entries | 12 |

### Prior Period (Dec 2025) Variance Drivers

December 2025 uses slightly lower revenue targets to create natural variance:

| Metric | Dec 2025 | Jan 2026 | Delta |
|---|---|---|---|
| Subscription Revenue | $5,280,000 | $5,500,000 | +4.2% |
| Usage Revenue | $440,000 | $480,000 | +9.1% |
| PS Revenue | $780,000 | $820,000 | +5.1% |
| Support Revenue | $290,000 | $310,000 | +6.9% |

---

## Files Changed

| File | Change |
|---|---|
| `src/services/accountClassifier.ts` | 3-tier classification (compound → suffix → keyword) |
| `frontend/app/close/[sessionId]/review/CertificationRecord.tsx` | Audit binder PDF + JSON export buttons |
| `demo/meridian_coa.csv` | New — 69-account chart of accounts |
| `demo/meridian_gl_jan_2026.csv` | New — 808-line January 2026 GL |
| `demo/meridian_gl_dec_2025.csv` | New — 808-line December 2025 GL |
| `demo/generate_meridian.ts` | New — reproducible dataset generator |
