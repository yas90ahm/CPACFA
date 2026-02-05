# Sovereign CPA Engine

Backend-only deterministic close and certification engine. Trial balance in → human-in-the-loop for imbalances and overrides → period lock → close session certification → draft or certified export and audit binder. All math is enforced (Truth Gate); certified outputs require session status `certified`, audit-ledger chain verification, and final integrity check (balance + plug detection). A hash-chained audit trail records overrides and material events. AI pillars exist in code as: **Classifier** (suggestions for imbalanced TB, stored in staging payload); **Advisor** (proposals to `tenant_ai_proposals`); **Shadow Auditor** (blocks JE post and resolve-ingest when severity is `block`; findings in `tenant_shadow_audit_findings`); **Justifier** (memo/IRAC for posted JEs in `tenant_justifications`). All AI uses strict JSON outputs, is logged, and does not compute or post amounts—provenance required for adjustments.

---

## Key capabilities

- Ingest trial balance (CSV/XLSX); balanced TB saved to period ledger; imbalanced TB staged for HITL.
- Forge/staging: imbalanced uploads create staging items; human resolves via adjustment with amount provenance.
- Protocol Bridge: single mutation path—SaveTrialBalance, ApplyHitlAdjustmentToTrialBalance, CreateDraftJE, ProposeJE, ApproveJE, PostJE, LockPeriod (period lock asserted before mutations).
- Deterministic math: debits = credits and Assets = Liabilities + Equity enforced; imbalance throws 422.
- Close workflow: session status draft → … → locked → certified; certify requires no hard blockers and approver role.
- Certified export and audit binder: require `closeSessionId` + session `certified`, export gate (chain + materiality from DB), final integrity check.
- Draft export: optional; can allow imbalanced with watermark via env.
- Audit chain: verifyChain before certified export; overrides and material events appended hash-chained.

---

## Core workflow

1. **Ingest** — Upload TB; if imbalanced, staging item created (Classifier/Advisor run, fail-open).
2. **Forge/HITL** — Review staging; for trial-balance ingest, POST adjustment to resolve-ingest (balance check, Shadow Auditor, then bridge apply).
3. **Adjust** — Close adjustments and JEs via bridge; JE lifecycle: draft → propose → approve → post (Shadow blocks on severity=block); Justifier runs after post.
4. **Shadow Audit** — Runs before JE post and before resolve-ingest apply; blocks only when severity=block.
5. **Lock** — POST period-lock (approver); further TB/JE mutations for that period blocked.
6. **Certify** — POST close session certify (from locked, no hard blockers, approver).
7. **Export** — Certified PDF/CSV: gates + final integrity; draft: optional imbalance with watermark.
8. **Binder** — GET binder (certified-only): requireCertifiedSession + same gates, then build binder.

---

## Architecture at a glance

- **Deterministic TypeScript core** — Balance and integrity in `integrity_gate_service`, `financialStatements`; no AI in the math path.
- **Protocol Bridge** (`src/bridge/protocol_bridge.ts`) — All TB/JE/lock mutations go through bridge; period lock asserted; Zod schemas.
- **Audit chain + verification** — `audit_ledger_service` / `audit_ledger_repository`; `verifyChain` used by export gate.
- **Draft vs certified export gating** — Certified: session certified + checkExportGate + finalIntegrityCheck; production ignores bypass flag.
- **AI layer** — Strict JSON schemas; calls logged; no AI math; adjustment amounts require amountProvenance (ledger_exact | engine_calculation | human_entered).

---

## Quickstart (local)

**Environment variables** (infer from code):

- `DATABASE_URL` — Postgres connection (required for DB, migrations, and integration tests).
- `PORT` — API port (default 3001).
- `JWT_SECRET` — Required in production.
- `NODE_ENV` — `production` disables in-memory fallbacks and auth bypass.
- Optional: `AI_MODEL`, `AI_TIMEOUT_MS`, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `MISTRAL_API_KEY` for AI pillars; `AI_MOCK_CLASSIFIER`, `AI_MOCK_ADVISOR`, `AI_MOCK` for mocks.
- Optional: `CORS_ORIGIN` / `CORS_ORIGINS`, `REQUIRE_AUTH`, `ALLOW_IMBALANCED_DRAFT_EXPORT`, `CPA_ENABLED`.

**Setup:**

```bash
npm install
cp .env.example .env   # edit with DATABASE_URL, etc.
npm run db:migrate     # run migrations (uses DATABASE_URL)
npm run db:verify      # verify schema (exits 1 if missing tables/columns)
npm run build         # compile TypeScript
npm run dev            # or: npm run start (node dist/server.js)
```

Reset DB (destructive, use with care):

```bash
ALLOW_DB_RESET=true npm run db:reset   # or NODE_ENV=test npm run db:reset
```
Without `ALLOW_DB_RESET=true` or `NODE_ENV=test`, `db:reset` refuses to run.

**Tests:** See “Running tests” below. Certification pipeline and other integration tests require `DATABASE_URL`; when missing they skip (CI guard).

---

## Running tests

Tests are in the `tests/` directory with their own `package.json`. From repo root:

```bash
cd tests && npm install && npm test
```

- **When `DATABASE_URL` is not set:** Integration tests that depend on DB (e.g. certification pipeline) skip; no failure. Suited for CI without a database.
- **When `DATABASE_URL` is set:** Full integration runs; certification pipeline test: imbalanced TB → staging → resolve-ingest → lock → certify → export gates → binder; DB artifacts and audit chain verified.

Integration-only:

```bash
cd tests && npm run test:integration
```

Smoke (no DB required by default):

```bash
cd tests && npm run test:smoke
```

Schema verification (DB required):

```bash
npm run db:verify
```

---

## Safety & invariants

- **Truth Gate** — Rounding tolerance from `shared/config/financial_rules.json` (default 0.01). Debits = credits and Assets = Liabilities + Equity enforced; failure → 422 MathematicalIntegrityError.
- **Certified-only “official” outputs** — Certified export and binder require session status `certified` and server-side gates; draft export is explicitly draft and can be watermarked when imbalanced.
- **Hash-chained audit trail** — Overrides and material events appended; chain verified before certified export.
- **AI cannot compute or post** — All posting and balance math are deterministic; adjustment lines require amountProvenance; AI suggests only (Classifier/Advisor) or blocks (Shadow) or documents (Justifier).

---

## API overview (core workflow)

Only key mounted routes; not an exhaustive list.

| Base path | Purpose |
|-----------|--------|
| `GET /health`, `GET /health/ready` | Health and readiness (ready checks DB). |
| `POST /api/auth/login`, `POST /api/auth/register` | Auth. |
| `POST /api/trial-balance/ingest` | Upload TB CSV/XLSX; balanced → save; imbalanced → staging. |
| `GET /api/hitl/staging`, `POST /api/hitl/resolve`, `POST /api/hitl/resolve-ingest` | Staging list; approve/reject; apply adjustment for imbalanced ingest. |
| `POST /api/close/journal-entries`, `POST /api/close/journal-entries/:id/propose`, `:id/approve`, `:id/post` | JE lifecycle (via bridge). |
| `POST /api/close/period-lock` | Lock period (bridge). |
| `POST /api/close/sessions/:id/certify` | Certify close session. |
| `POST /api/export/pdf`, `POST /api/export/csv` | Export (draft vs certified by body/query; certified requires session + gates). |
| `GET /api/audit/binder`, `GET /api/audit/binder/export/pdf`, `.../csv` | Audit binder (certified-only; requireCertifiedSession + gates). |

Other mounted prefixes: `/api/justification`, `/api/audit` (reconciliation, todos, GAAP consistency, etc.), `/api/close/*` (sessions, issues, adjustments, checklist, etc.), `/api/coa-mapping`, `/api/onboarding`, `/api/tenants`, `/api/knowledge-base`, `/api/vector-store`, `/api/ingestion`, `/api/memory`, `/api/integrations`, `/api/pipelines`, `/api/data-quality`, `/api/approvals`, `/api/accounting-integration`. Dev-only: `/api-dev` when `NODE_ENV !== 'production'`.

---

## Repo structure

- `src/` — Backend: `routes/` (API), `services/` (business logic), `db/` (migrate, repositories, schema_verify, verify_schema, reset_and_bootstrap), `bridge/` (protocol_bridge), `ai/` (orchestrator, adapters, prompts, schemas), `auth/`, `lib/`, `middleware/`, `types/`.
- `migrations/` — SQL migrations.
- `tests/` — Unit and integration tests; `tests/integration/` includes certification pipeline; `tests/smoke/` for smoke tests.
- `shared/config/` — e.g. financial_rules.json (rounding tolerance, materiality).

---

## What this is NOT

- Not an ERP (no GL/AP/AR/inventory).
- Not forecasting or FP&A.
- Not payments or banking core.
