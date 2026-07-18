# Sabit

Sabit is financial close software I have been working on.

The idea is simple. AI can help read, classify and explain. It should not decide the numbers, invent an adjustment or approve its own work. Balancing, approvals, period state and certification stay in deterministic code.

This is a working prototype, not a production-ready accounting system. There is a large TypeScript backend, a Next.js interface, PostgreSQL migrations and a few smaller Python services. Some areas are tested properly. Some still need work.

## What it does

- ingests trial balances and general-ledger files
- checks that accounting data balances before it moves forward
- sends exceptions through a human review path
- supports draft, approval, posting, close and certification states
- stores evidence and maintains an audit trail
- uses AI for suggestions and explanations, behind deterministic accounting controls
- includes experimental ERP and MCP connectors

If a model output and the ledger disagree, the ledger wins.

## What is in this repository

```text
src/          Backend, worker, database access and services
frontend/     Next.js web application
migrations/   PostgreSQL migration history
tests/        Unit, adapter and integration tests
connectors/   ERP and MCP connector experiments
mcp_server/   Python MCP and webhook services
slm/          Python classification service
shared/       Shared configuration and types
scripts/      Setup, verification and maintenance scripts
data/         GAAP taxonomy input; runtime evidence is ignored
```

The repository contains code, the files needed to build and test it, and this README. Generated evidence, review packs, architecture essays and completion reports do not belong here.

## Setup

Use Node 22 or newer.

```bash
git clone https://github.com/yas90ahm/sabit.git
cd sabit
npm install
cp .env.example .env
```

At minimum, set:

| Variable | Purpose |
| --- | --- |
| `MODE` | `dev`, `demo` or `prod` |
| `PORT` | API port |
| `DATABASE_URL` | PostgreSQL connection |
| `JWT_SECRET` | Token signing |

Production certification also needs persistent Ed25519 signing keys. `npm run keygen` prints values in the format the current certificate code expects.

Run the database setup:

```bash
npm run db:migrate
npm run db:verify
npm run seed:demo
```

Start the backend:

```bash
npm run dev
```

Start the web application in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

## Checks

```bash
npx tsc --noEmit
npm run build
npm test
```

The database integration flow also needs PostgreSQL and the migrated schema. GitHub Actions runs that path with a disposable database.

## Current limits

- the frontend is still on Next.js 14 and needs a planned upgrade
- staged ERP synchronization is not available; direct synchronization must be requested explicitly
- the Python services are not packaged consistently yet
- dependency audit findings still need a separate upgrade pass
- there is no license file, so do not assume the code is licensed for reuse

One provider credential appeared in the repository's old history. It is not in the current tree, but it should still be treated as compromised, rotated and checked for use.
