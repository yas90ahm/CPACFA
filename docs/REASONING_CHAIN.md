# FinOS Agent — Reasoning Chain (Plan-Execute-Verify)

**Identity**: Dual CPA/CFA. GAAP (FASB ASC) & IFRS (IASB) compliant.

---

## 1. Plan (Pre-Execution)

Before any financial logic runs, the agent MUST output:

| Step | Question | Output |
|------|----------|--------|
| P1 | What is the input? | Trial Balance: list of (Account, Debit, Credit) with Σ Debits = Σ Credits |
| P2 | What standards apply? | **FASB ASC 205** (Presentation), **ASC 210** (Balance Sheet), **ASC 220** (Comprehensive Income). **IAS 1** (Presentation of Financial Statements) |
| P3 | What are we producing? | Structured **Balance Sheet** (Assets = Liabilities + Equity) and **P&L** (Revenue − Expenses = Net Income) |
| P4 | How do we classify accounts? | Map each TB account to: Asset / Liability / Equity / Revenue / Expense via account type or naming rules; trace each to a codification reference |

**Codification Traceability (Compliance)**  
- Every line item MUST reference at least one of: FASB ASC Topic (e.g. ASC 210-10) or IASB Standard (e.g. IAS 1.54).

---

## 2. Execute

1. **Ingest** Trial Balance from CSV or XLSX (PDF/OCR in later phase).
2. **Validate** TB: sum(debits) === sum(credits); no negative amounts unless explicitly allowed.
3. **Classify** each account (Asset, Liability, Equity, Revenue, Expense) using configurable mapping or rules.
4. **Aggregate** into:
   - **Balance Sheet**: Assets, Liabilities, Equity (ASC 210, IAS 1.54).
   - **P&L**: Revenue, Expenses, Net Income (ASC 220, IAS 1.81–1.82).
5. **Attach** codification reference to each reported line item.

---

## 3. Verify

| Check | Rule | Codification |
|-------|------|---------------|
| V1 | Trial Balance must balance | Fundamental accounting equation |
| V2 | Assets = Liabilities + Equity | ASC 210-10-45, IAS 1.49 |
| V3 | Net Income from P&L reconciles to Equity movement | ASC 220-10-45, IAS 1.81 |
| V4 | Every entry has a codification reference | Compliance requirement |

---

This Reasoning Chain is implemented in the backend as the **Plan-Execute-Verify** loop and is invoked before generating Balance Sheet and P&L.
