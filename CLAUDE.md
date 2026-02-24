# CLAUDE.md — Project Context for Claude Code

## What This Is

A financial close automation engine called Sovereign CPA Engine. It takes a company's general ledger data and produces four certified financial statements (Balance Sheet, Income Statement, Cash Flow Statement, Statement of Stockholders' Equity). Target customers are PE-backed mid-market companies ($100M-$1B revenue).

## How It Works

The system is a pipeline with enforced gates:

1. **Controller uploads GL** (CSV or ERP sync) → system derives a trial balance
2. **Map accounts** — every GL account gets mapped to a reporting line item (e.g., "Account 4100 Product Revenue" → "Revenue" on the Income Statement)
3. **Reconcile** — balance sheet accounts are reconciled against source documents (bank statements, subledger exports). Evidence upload required.
4. **Post adjusting entries** — recurring entries from templates + manual one-time entries. Every JE must balance (debits = credits) and have a memo.
5. **Generate statements** — four financial statements generated from the adjusted trial balance through deterministic arithmetic
6. **Explain variances** — material period-over-period changes must be documented
7. **Review and certify** — CFO reviews, system re-validates all gates, signs with Ed25519 digital signature
8. **Lock** — terminal state, immutable

You cannot skip steps. You cannot certify with unexplained variances. You cannot post a journal entry without a memo. Every gate blocks advancement if not satisfied.

## The Architecture

**Backend:** Node.js + Express + TypeScript + PostgreSQL
- Port: 3000
- All money uses Decimal.js (no floating point anywhere in financial paths)
- PostgreSQL uses NUMERIC(20,2) for money columns and GENERATED ALWAYS columns for computed fields
- Hash-chained append-only audit ledger (tamper-evident)
- Ed25519 cryptographic signing for certification
- 121 active services, 150+ API endpoints
- Build passes, integration test passes (10 steps: login → certification → verification)

**Frontend:** Next.js + React + TypeScript + Tailwind
- Port: 3002
- Uses React Query for data fetching
- `apiFetch` utility in `lib/` handles API calls to the backend
- Auth via Bearer token from `/api/auth/login`

**AI:** Advisory only. AI suggests account mappings and drafts variance explanations. AI NEVER computes dollar amounts or writes to financial tables. Every AI suggestion requires human confirmation.

## The Close Session State Machine

```
OPEN → IN_PROGRESS → UNDER_REVIEW → CERTIFIED → LOCKED
                                   ↗
                   IN_PROGRESS ← (reopen with reason)
```

LOCKED is terminal and permanent.

## Key API Routes

All routes prefixed with `/api`. Auth required (Bearer token) on all except `/api/auth/*` and `/health`.

**Close lifecycle:** POST/GET `/close/sessions`, `/close/sessions/:id/advance`, `/close/sessions/:id/readiness`, `/close/sessions/:id/certify`, `/close/sessions/:id/lock`

**GL upload:** POST `/gl/parse` (preview, no persist), POST `/gl/ingest` (commit)

**Trial balance:** GET `/close/sessions/:id/trial-balance?type=adjusted|unadjusted`

**Mapping:** GET `/coa-mapping/taxonomy`, GET/POST `/coa-mapping/rules`, GET `/coa-mapping/suggestions`

**Reconciliation:** GET/POST `/close/sessions/:id/reconciliations`, `.../reconciliations/:id/supporting-balance`, `.../items`, `.../evidence`, `.../complete`, `.../approve`

**Journal entries:** GET/POST `/close/journal-entries`, `.../:id/propose`, `.../:id/approve`, `.../:id/reject`, `.../:id/post`, `.../:id/evidence`

**AJE templates:** GET/POST `/close/templates`, `/close/templates/propose`, `/close/templates/apply`, `/close/templates/skip`

**Statements:** POST `/close/sessions/:id/statement-packages/generate`, GET `/close/statement-packages/:id/lines`

**Variance:** GET `/close/sessions/:id/variances`, POST `/close/variances/:id/explain`, GET `/close/variances/:id/ai-draft`

**Settings:** GET/PUT `/settings/general`, `/settings/team`, `/close/evidence-policy`, `/close/recon-requirements`

**Portfolio:** GET `/portfolio/entities`, `/portfolio/summary`

**Verification:** GET `/verification/certification/public-key`, `/verification/certification/artifacts/:id`, POST `/verification/certification/verify`

## Current State

The backend is complete and working. The frontend was built with mock data and is being wired to real APIs. The wiring is in progress — some components still import from `lib/mock/` files. The immediate goal is to get every component calling real backend endpoints with zero mock data remaining.

## Key Rules

- All money values in API responses are Decimal strings (e.g., `"1234567.89"`), never JavaScript numbers
- The backend uses `tenantId` from the auth token for multi-tenant isolation
- Session IDs are used as the primary scope for most close operations
- The readiness endpoint (`/close/sessions/:id/readiness?format=gates`) returns a gates array that the dashboard renders
- Posted journal entries are immutable (database triggers prevent UPDATE/DELETE)
- The audit ledger is append-only and hash-chained
