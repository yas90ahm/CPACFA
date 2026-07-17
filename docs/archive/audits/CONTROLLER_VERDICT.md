# Would I Do My Close on Sabit?

**Verdict: No. Not yet.**

Not because the architecture is wrong — it's actually solid. The pipeline design (GL → TB → Map → Reconcile → Adjust → Statements → Variance → Certify → Lock) is correct. The Ed25519 signing, hash-chained audit ledger, and immutability triggers on posted entries are real. The integrity gates that block certification if Assets ≠ L+E are real. The backend uses Decimal.js for computation and PostgreSQL NUMERIC(20,2) for storage.

But there are specific, enumerable problems that would cause me to fail an audit, lose data, or waste hours fighting the tool instead of closing the books. Here they are.

---

## The Dealbreakers

### 1. Floating-Point Money Throughout the Frontend

Every single money value that crosses from backend to frontend gets converted from a Decimal string to a JavaScript `Number` via `parseFloat()`. This happens in:

- `reconciliations.ts:24,31-36` — all GL balances, supporting balances, variances
- `journal_entry_repository.ts:69-70` — every JE line debit/credit
- `general_ledger_repository.ts` — every GL line
- `review/page.tsx:76` — financial highlights
- `StatementTable.tsx:43` — statement drill-down amounts
- `variance/page.tsx:31-32` — change amounts
- `trial-balance/page.tsx:35-37` — TB totals
- `JournalEntryForm.tsx:140-142` — entry balance check
- `mapping/page.tsx:579` — taxonomy balance accumulation

**Why this kills me:** I'm a controller at a $300M revenue company. My trial balance has 200+ accounts. Each `parseFloat` introduces up to ±0.000000000000001 per value. After summing 200 accounts, that drift can reach ±$0.01. Across 50 journal entries and 30 reconciliations, the frontend's running totals will disagree with the backend's GENERATED ALWAYS columns by anywhere from $0.01 to $1.00.

That means:
- The reconciliation list footer (which sums in JavaScript) won't match the trial balance
- The JE form says "Balanced ✓" but the backend might reject it
- The review page shows Revenue = $298,345,122.00 but the statement says $298,345,122.01

I cannot certify financials where the numbers on my screen don't match the numbers in the database.

**What it would take to fix:** Replace all `parseFloat()` money conversions with string passthrough. Display money as formatted strings. Only compute on the backend.

### 2. GL Drill-Down Is Non-Functional

`trial-balance/page.tsx:244-269` — When I expand an account in the trial balance to see its GL entries, the table is always empty. `data?.glEntriesByAccount` is initialized as `{}` and never populated from the API.

**Why this kills me:** The trial balance is the single most important document in a close. If I can't drill from TB → GL entries to verify that account 4100 Revenue really does contain the transactions I expect, I cannot sign off on the numbers. I'd have to export GL separately, open Excel, filter by account, and cross-check manually. That's the workflow I'm trying to eliminate.

### 3. Prior Period Comparison Is Broken

`StatementTable.tsx:139,150` — The "Show prior period" checkbox renders `—` for every line. Prior period amounts are never fetched. The variance page claims to show "Current vs Prior" but the prior period column in statements is empty.

**Why this kills me:** Period-over-period comparison is how I catch errors. If Revenue was $25M last month and $250M this month, something is wrong. Without prior period data rendered in the statement view, I have to open two browser tabs and manually compare — which defeats the purpose of the tool.

### 4. Reconciliation Notes Don't Save

`reconciliation/[reconId]/page.tsx:641` — The notes textarea has `onBlur={() => {}}`. Notes are never persisted. I type a paragraph about why the bank balance is $500 different from GL, navigate away, come back — gone.

**Why this kills me:** Reconciliation notes are my primary communication with the reviewer. "Bank fee of $500 posted 2/28 but cleared 3/1 — timing difference, will reverse next period." Without that note, the reviewer sees a $500 variance with no context and sends it back.

### 5. Reconciliation Activity Log Is Empty

`reconciliation/[reconId]/page.tsx:214` — `const activity = []`. The activity timeline that should show "Jane entered supporting balance $1,234,567.89 on Feb 28" is hardcoded empty.

**Why this kills me:** I need to see when the supporting balance was entered, when items were added, when evidence was uploaded. Without this, I can't answer the auditor's question: "When did you complete this reconciliation?"

### 6. "Download Error Report" Button Does Nothing

`GLUploadFlow.tsx:483` — The button has no `onClick` handler. When my GL upload fails with "47 entries imbalanced," I need to know which 47 entries. I click "Download Error Report" and nothing happens.

**Why this kills me:** I now have to go back to my source system, figure out which entries are bad, fix them, re-export, and re-upload — blind. The tool should tell me exactly which rows failed and why.

---

## The Serious Problems

### 7. Hardcoded Dates and Thresholds

| Location | Hardcoded Value | Should Be |
|----------|----------------|-----------|
| `close/page.tsx:51-52` | Period defaults to Feb 2026 | Current month |
| `JournalEntryForm.tsx:110,120` | Entry date defaults to Jan 31, 2026 | Session period end |
| `adjustments/page.tsx:131` | Default JE number 1045 | Backend-assigned |
| `variance/page.tsx:165` | "Material threshold: $50,000 or 10%" | From settings API |
| `statements/page.tsx:96` | Export URL fallback to localhost:3001 | No localhost in prod |

### 8. JE Number Assigned by Frontend

`adjustments/page.tsx:130-133` — `nextJeNumber = max(existingEntries) + 1`. If two controllers create entries simultaneously, they get the same number. Backend should assign.

### 9. Segregation of Duties Logic Is Fragile

`reconciliation/[reconId]/page.tsx:225-226`:
```typescript
const isPreparer = recon?.preparer != null && (user?.userId === recon.preparer || user?.email === recon.preparer);
const isReviewer = !isPreparer;
```

If `recon.preparer` is null, `isPreparer = false`, so `isReviewer = true`. A random third user who opens this reconciliation is treated as a reviewer and can approve it. SoD violated.

### 10. Evidence SHA-256 Is Fake

`JournalEntryForm.tsx:191-193` — The SHA-256 hash shown for uploaded evidence files is randomly generated, not computed from the file. If an auditor asks "prove this PDF is the same one uploaded during the close," I can't — the hash is meaningless.

### 11. Reconciliation "Complete" Doesn't Match Backend

The frontend recalculates `unexplainedVariance` in JavaScript (line 233: `variance - itemsTotal`) using floating-point math. The backend uses GENERATED ALWAYS columns with NUMERIC precision. These can disagree. I mark a reconciliation "complete" thinking variance is $499.99 (under $500 tolerance), but the backend has $500.01 and rejects it. Or worse — the backend accepts it but the gate check later uses a different value.

### 12. Synthetic JEs in Statement Drill-Down

`StatementTable.tsx:42-80` — When I click a statement line item to see its journal entries, the system constructs **fake JEs** with phantom "OFFSET" accounts that don't exist in the ledger. These are visual artifacts. An auditor sees entries in the financial statement that have no corresponding JE in the register.

### 13. No Gate for "All Material Variances Approved"

The CertificationChecklist shows readiness gates, but there's no gate checking that all material variances have approved explanations. I can certify with 5 unexplained $100K variances because the gate doesn't exist. The backend might catch this, but the frontend gives me the green light.

### 14. Tolerance Gate Has No Max Cap

`integrity_gate_service.ts:135-143` — The tolerance for "debits equal credits" comes from a config file with no upper bound validation. If someone sets `roundingTolerance: 10000`, the TB could be $10,000 out of balance and still pass the gate.

---

## What Actually Works Well

To be fair, these things are genuinely good:

1. **The pipeline architecture is correct.** GL → TB → Map → Reconcile → Adjust → Statements → Variance → Certify → Lock is the right sequence with the right gates.

2. **Backend Decimal.js usage is mostly correct.** `sumRound2()` in `decimal.ts` accumulates using Decimal.js and only converts to Number after final rounding. The computation layer is sound.

3. **Immutability triggers exist.** Migration 106 prevents UPDATE/DELETE on posted JE lines at the database level. You can't silently change a posted entry.

4. **Hash-chained audit ledger is real.** Events are chained with SHA-256 hashes. Tampering is detectable.

5. **Ed25519 certification signing works.** The certification artifact includes a cryptographic signature verifiable with the public key.

6. **Integrity gates block bad statements.** If Assets ≠ Liabilities + Equity, `assertIntegrityGateOrThrow()` prevents statement generation. This is the kill switch.

7. **AI is advisory only.** AI suggests mappings and drafts variance explanations but never writes to financial tables. Every suggestion requires human confirmation.

8. **The mapping page with AI suggestions is genuinely useful.** Confidence bands, accept/reject workflow, taxonomy tree — this saves real time.

9. **The close session state machine is properly enforced.** OPEN → IN_PROGRESS → UNDER_REVIEW → CERTIFIED → LOCKED with no shortcuts.

10. **The review/certify flow is well-designed.** Type CERTIFY, progress animation, certification record with signature — feels like a real signing ceremony.

---

## What It Would Take

To get this to where I'd use it for a real close:

### Phase 1: Data Integrity (1-2 weeks)
- [ ] Replace all frontend `parseFloat()` money conversions with string passthrough
- [ ] Fix `Number()` conversions in `journal_entry_repository.ts` and `general_ledger_repository.ts`
- [ ] Compute actual SHA-256 hashes for evidence files
- [ ] Move JE number assignment to backend
- [ ] Cap tolerance gate at $0.01
- [ ] Fix SoD logic in reconciliation detail (handle null preparer)

### Phase 2: Missing Features (1-2 weeks)
- [ ] Wire GL drill-down in trial balance (fetch entries by account)
- [ ] Populate prior period data in statements
- [ ] Persist reconciliation notes (wire the `onBlur` handler)
- [ ] Populate reconciliation activity log from audit trail
- [ ] Wire "Download Error Report" button in GL upload
- [ ] Add "all material variances approved" gate to certification checklist
- [ ] Remove synthetic JE generation — link to real entries

### Phase 3: UX Polish (1 week)
- [ ] Default dates to current period, not hardcoded
- [ ] Pull materiality thresholds from settings API
- [ ] Show which gates are blocking and link to the fix
- [ ] Persist filter state across navigation
- [ ] Add reset filters button to all list pages

### Phase 4: Backend Hardening (1 week)
- [ ] Extend immutability trigger to prevent ALL updates on posted JE headers
- [ ] Add audit trail entries for data reads during statement generation
- [ ] Verify all route handlers use `withTransaction()` for mutations
- [ ] Reject JE lines with both debit and credit = 0
- [ ] Validate period label format on GL ingest

---

## Bottom Line

The bones are right. The architecture is sound. The pipeline is correct. The backend computation layer is mostly trustworthy. The cryptographic signing is real.

But the frontend is a precision leak. Every money value loses fidelity crossing the API boundary. Features that a controller needs every single day — GL drill-down, prior period comparison, reconciliation notes — are either broken or missing. And there are workflow gaps (no variance gate, fake evidence hashes, fragile SoD) that would cause an audit finding.

**I'd use this for a demo. I'd use this to show a board what the close process could look like. I would not use this to file financials with the SEC or hand to my external auditors.**

Give me 4-6 weeks of the fixes above, and the answer changes to yes.
