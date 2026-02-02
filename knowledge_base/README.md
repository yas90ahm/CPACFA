# Financial Memory System

Three-tier **Financial Memory** for global standards, firm-specific data, and session uploads, with **hybrid search** and **CPA invoice consistency** (how similar invoices were treated in previous years).

## Hierarchy

| Tier | Scope | Contents |
|------|--------|----------|
| **Tier 1 (Global)** | Read-only | FASB, IFRS, and Tax Codes. Sourced from RAG handbook + Tax chunks. |
| **Tier 2 (Firm)** | Company-specific | Chart of Accounts, historical accounting policies, and **invoice treatments** (how past invoices were coded and cited). |
| **Tier 3 (Session)** | Conversation | Files and content uploaded in the current conversation (session-scoped). |

## Retrieval — Hybrid Search

- **Hybrid search** combines **keyword** matching across all tiers (optional session filter for Tier 3).
- When the **CPA agent** analyzes an invoice, use **invoice-consistency** retrieval to find how **similar invoices** were treated in previous years to ensure **consistency of reporting**.

## Implementation

- **Types & API**: `src/knowledge_base/` — `types.ts`, `tiers/tier1_global.ts`, `tiers/tier2_firm.ts`, `tiers/tier3_session.ts`, `hybrid_search.ts`, `financial_memory.ts`, `index.ts`.
- **Routes**: `src/routes/financial_memory.ts` — mounted at `/api/knowledge-base`.

## API Summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/knowledge-base/tier1/entries` | List Global entries (FASB, IFRS, Tax). |
| GET | `/api/knowledge-base/tier2/chart-of-accounts` | Get Chart of Accounts. |
| POST | `/api/knowledge-base/tier2/chart-of-accounts` | Set Chart of Accounts (bulk). |
| GET | `/api/knowledge-base/tier2/policies` | List historical policies. |
| POST | `/api/knowledge-base/tier2/policies` | Add historical policy. |
| GET | `/api/knowledge-base/tier2/invoice-treatments` | List recorded invoice treatments. |
| POST | `/api/knowledge-base/tier2/invoice-treatments` | Record how an invoice was treated (for consistency). |
| POST | `/api/knowledge-base/tier3/upload` | Add session upload (filename, summaryText, sessionId). |
| GET | `/api/knowledge-base/tier3/uploads` | List uploads for a session. |
| DELETE | `/api/knowledge-base/tier3/session/:sessionId` | Clear session uploads. |
| POST | `/api/knowledge-base/search` | **Hybrid search** — body: `{ query, tiers?, topK?, sessionId? }`. |
| POST | `/api/knowledge-base/invoice-consistency` | **CPA:** Find similar invoice treatments — body: `{ invoiceDescription, vendor?, accountCode?, topK? }`. |

## CPA Invoice Consistency

When the CPA agent analyzes an invoice:

1. Call **POST /api/knowledge-base/invoice-consistency** with `invoiceDescription` (and optionally `vendor`, `accountCode`).
2. The system returns **similar past treatments** (vendor/description/account match) and an optional **consistency note** (e.g. suggested account and prior period).
3. Use this to ensure **consistency of reporting** with prior years.

Prior treatments must be recorded via **POST /api/knowledge-base/tier2/invoice-treatments** (e.g. when closing periods or during audit).

---

## RAG Vector Store (Intelligent Context)

For **RAG** (Retrieval-Augmented Generation) with **Intelligent Context** — ingestion of PDF accounting handbooks and company Internal Control documents, metadata tagging (Standard Type, Level of Authority), precedent retrieval for the CPA agent, and **citation with document title and page number** — see **`knowledge_base/vector_store/README.md`** and **`src/knowledge_base/vector_store/`**. API: `/api/vector-store` (ingest, ingest-pdf, query, precedent).
