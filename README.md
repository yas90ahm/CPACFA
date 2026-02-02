# FinOS Agent

Enterprise-grade **agentic financial platform**: dual CPA/CFA identity, Plan-Execute-Verify loop, and FASB/IASB codification traceability.

## Core Identity

- **CPA Mode**: GAAP/IFRS adherence; zero tolerance for balancing errors; every entry traceable to FASB ASC or IASB.
- **CFA Mode**: (Planned) Equity research, derivative pricing (Black-Scholes), portfolio theory (CAPM).

## Backend API (Current Scope)

The backend ingests a **Trial Balance** (CSV or XLSX) and returns:

1. **Reasoning Chain** — Plan (P1–P4), Execute, Verify (V1–V4).
2. **Validated Trial Balance** — entries with classification and codification refs.
3. **Structured Balance Sheet** — Assets, Liabilities, Equity (ASC 210, IAS 1.54).
4. **Structured P&L** — Revenue, Expenses, Net Income (ASC 220, IAS 1.81).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/trial-balance/ingest` | Upload CSV or XLSX file (multipart, field: `file`). Returns full output. |
| `POST` | `/api/trial-balance/statements` | JSON body `{ "entries": [ { "accountName", "debit", "credit" }, ... ] }`. Returns same output. |
| `GET` | `/api/trial-balance/supported` | Supported file types and column expectations. |
| `GET` | `/health` | Health check. |

### File Format (Trial Balance)

- **CSV / XLSX**: Columns for account identifier, debit, credit.  
  - Required: account name (e.g. `accountName`, `account name`, `account`), `debit`, `credit`.  
  - Optional: `accountCode`, `code`.  
- **PDF**: Planned (OCR pipeline).

### Compliance

Every Balance Sheet and P&L line item includes a `codificationRef` (e.g. FASB ASC 210-10-45, IAS 1.54). See `docs/REASONING_CHAIN.md` for the full Plan-Execute-Verify logic.

## Quick Start

```bash
npm install
npm run dev
```

Then:

- **Upload**: `POST http://localhost:3001/api/trial-balance/ingest` with `file` (CSV or XLSX).
- **JSON**: `POST http://localhost:3001/api/trial-balance/statements` with body:
  ```json
  {
    "entries": [
      { "accountName": "Cash", "debit": 10000, "credit": 0 },
      { "accountName": "Revenue", "debit": 0, "credit": 10000 }
    ]
  }
  ```

## Project Structure

```
CPACFA/
├── docs/
│   └── REASONING_CHAIN.md    # Plan-Execute-Verify + codification
├── src/
│   ├── constants/
│   │   └── codification.ts   # FASB ASC / IASB refs
│   ├── routes/
│   │   └── trialBalance.ts   # Ingest + statements API
│   ├── services/
│   │   ├── accountClassifier.ts   # TB → Asset/Liability/Equity/Revenue/Expense
│   │   ├── fileIngestion.ts       # CSV, XLSX parsing
│   │   ├── financialStatements.ts # BS + P&L builder
│   │   ├── planExecuteVerify.ts   # Reasoning Chain + verification
│   │   └── trialBalanceParser.ts  # Parse + validate balance
│   ├── types/
│   │   └── financial.ts      # TB, BS, P&L types
│   └── server.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Next Steps (Implementation Priority)

1. **UI**: Next.js 14+ frontend with secure file upload zone and “Justification Chat” sidebar.
2. **PDF/OCR**: Add PDF ingestion to the pipeline.
3. **CFA**: Equity research, Black-Scholes, CAPM modules.
