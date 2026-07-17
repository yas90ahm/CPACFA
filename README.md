# Sabit

Sabit is my attempt at a financial close system where the math stays boring.

The application can use AI to read, classify and explain. It cannot decide the numbers, create an unexplained adjustment or post an entry on its own. Balancing, approvals, period state and certification stay in deterministic code.

This repository is a prototype. It includes a large TypeScript backend, a Next.js web app, database migrations and a few Python services. Some parts are well tested. Other parts were built quickly and the repository accumulated far too many reports saying “complete” while disagreeing with one another.

So the current status is stated here, without the ceremony.

## Current status

The backend now passes TypeScript checking and builds on a clean dependency install. The root Jest suite passes 44 tests. The frontend also completes a production build after two missing shared files were restored from an existing review branch.

That does not make the prototype production-ready. The database-backed integration suite still needs a live PostgreSQL run, and CI no longer hides an integration failure behind `|| echo`. The frontend remains on an end-of-life Next.js 14 release with known security advisories and needs a planned framework upgrade before deployment.

An unfinished staged ERP sync had routes but no implementation modules or database schema. Those dead routes are removed for now. `/sync-trial-balance` returns `501` for staged mode; direct sync must be requested explicitly with `staged: false`.

The old review packs are under `docs/archive/audits/`. They are kept as history, not presented as current proof.

## What is here

- an Express and PostgreSQL backend for trial balance, close workflow, journal entries, evidence and audit records
- a Next.js interface for onboarding, close work, review and portfolio views
- deterministic balance and certification checks using Decimal.js
- a hash-chained audit ledger and evidence storage
- AI adapters for suggestions, classification and explanation
- ERP and MCP connector experiments
- a Python classification service

This is more than a backend. The earlier README said “backend-only” because it described an older point in the build.

## The boundary around AI

AI output is advisory data. It should be structured, logged and tied to its source.

The accounting path is supposed to keep these rules outside the model:

- debits equal credits
- assets equal liabilities plus equity
- adjustments carry an amount source
- journal entries follow the approval path
- certified output requires the server-side integrity gates

If a model output and the deterministic ledger disagree, the ledger wins. That is not a product slogan. It is the only arrangement I am comfortable with for financial statements.

## Core workflow

1. Upload a trial balance.
2. Save a balanced file or send an imbalance to staging.
3. A person reviews the proposed resolution and its amount source.
4. Journal entries move through draft, proposal, approval and posting.
5. Close sessions move through `OPEN`, `IN_PROGRESS`, `UNDER_REVIEW`, `CERTIFIED`, `SUBSEQUENT_EVENTS_REVIEW` and `LOCKED`.
6. Certified exports and binders run the audit-chain and final-integrity checks.

Period lock and close-session state are related controls, not the same status field. The old README mixed them together.

## Repository map

```text
src/                    TypeScript API, worker, database and services
frontend/               Next.js web application
slm/                    Python classification service
mcp_server/             Python MCP and webhook work
connectors/              ERP and MCP connectors
shared/                 shared configuration and types
migrations/             PostgreSQL migration history
tests/                  separate test package and integration suites
data/                   taxonomy and runtime data paths
docs/product/           intended workflows and interface documents
docs/operations/        setup and operating notes
docs/security/          current security inventory
docs/archive/audits/    historical reviews and completion reports
```

Runtime evidence does not belong in Git. Generated tenant-labelled evidence files were removed; named test fixtures remain under `tests/`.

## Local setup

Use Node 22 or newer. The package and both container builds now use that baseline.

Install the backend:

```bash
git clone https://github.com/yas90ahm/CPACFA.git
cd CPACFA
npm install
cp .env.example .env
```

At minimum, configure:

| Variable | Purpose |
| --- | --- |
| `MODE` | `development`, `demo` or `production` |
| `PORT` | API port; set it explicitly because old code paths disagree on the fallback |
| `DATABASE_URL` | PostgreSQL connection |
| `JWT_SECRET` | Session/token signing |

Production certification also needs signing keys. `npm run keygen` prints the values in the format expected by the current certificate code. Do not paste real keys into a document, issue or test result.

Optional model providers use environment variables such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `MISTRAL_API_KEY`. The deterministic path should continue to work without a live model provider where the feature allows it.

Run database setup:

```bash
npm run db:migrate
npm run db:verify
npm run seed:demo
```

Run the backend:

```bash
npm run dev
```

`src/server.ts` currently defaults to port 3000. Set `PORT=3000` explicitly until the startup-validation fallback is reconciled.

## Web app

The frontend has its own package:

```bash
cd frontend
npm install
npm run dev
```

The development server uses port 3002. A production `next start` uses port 3000 unless changed.

The current frontend pins Next.js 14.2.3. Next.js 14 is now end of life, so this needs a planned migration to a supported release rather than another small 14.x patch.

## Build and tests

Backend checks:

```bash
npx tsc --noEmit
npm run build
npm test
```

Typecheck and build now pass. The root Jest suite also passes, though it still reports warnings about `ts-jest` configuration and JSON import attributes.

The main test program also has its own package:

```bash
cd tests
npm install
npm test
```

Integration tests need PostgreSQL and the expected schema. A test that skips because `DATABASE_URL` is absent is not the same as a passing integration test.

Useful commands from the root:

```bash
npm run test:adapters
npm run test:integration
npm run db:verify
```

The Jest and `ts-jest` versions are currently out of alignment between the root and `tests/`. Consolidating that setup is part of the next phase.

## Docker demo

The repository contains Compose files for a local demo:

```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml up --build
```

Treat demo credentials as local fixtures. Do not reuse them anywhere else.

The production build excludes `data/evidence/` and `data/evidence-test/`. The container creates an empty writable evidence directory at runtime.

## Services outside the Node app

The Python services are not packaged consistently yet.

- `slm/server.py` is the classification service.
- `mcp_server/server.py` and `mcp_server/webhook_server.py` are MCP/webhook experiments.
- `connectors/mcp_erp_server.py` is an ERP connector experiment.

Read the service-specific requirements before running them. The older instruction `pip install -e .` from the repository root is wrong because the root is not a Python package.

## Documentation

Start here, then use:

- [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) for the checks run during this cleanup
- [`CLEANUP_REPORT.md`](./CLEANUP_REPORT.md) for moved and deleted files
- [`docs/product/`](./docs/product/) for intended workflows and interface decisions
- [`docs/operations/`](./docs/operations/) for setup notes
- [`docs/security/`](./docs/security/) for the current attack-surface inventory
- [`docs/archive/audits/`](./docs/archive/audits/) for point-in-time reviews

The archive contains useful findings and a lot of confident language. Neither makes it current.

## Security note

A provider credential was previously copied into a public review document. The current tree now contains only a shortened placeholder, but the original value remains in Git history. Treat that key as compromised, rotate it and review provider usage. History cleanup needs a separate, coordinated decision because it affects every clone.

## License

There is no license file in this public repository today. Until one is added, do not assume the code is licensed for reuse.
