# Sabit

Sabit started with something I kept noticing in finance work. During a close, files move around and people have to be chased. After all that, you still have to know whether the number in front of you is the right one.

I wanted to see where AI could actually help. It can read a file and classify an exception. It can also explain what looks wrong. I do not trust it with the number itself. So the balancing rules and approvals sit in ordinary code, along with the close state and certification.

If the model and the ledger disagree, the ledger wins.

This is a working prototype. I have been building it for more than a year and it has become a fairly large system, with a TypeScript backend, a Next.js interface, PostgreSQL migrations and some smaller Python services. Parts of it are in good shape. Other parts are still experiments.

## What works today

- ingests trial balances and general-ledger files
- checks that accounting data balances before it moves forward
- sends exceptions to a person for review
- moves work through draft, approval, posting, close and certification
- keeps the evidence and the audit trail
- uses AI for suggestions and explanations, while accounting controls stay in code
- includes experimental ERP and MCP connectors

## What is here

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

I have kept this repository to the code and files needed to run and test it. The README is the only document. Generated evidence and old project documents are left out.

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

Production certification also needs persistent Ed25519 signing keys. `npm run keygen` prints them in the format the certificate code expects.

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

## Check it

```bash
npx tsc --noEmit
npm run build
npm test
```

The database integration flow also needs PostgreSQL with the migrated schema. GitHub Actions runs that path with a temporary database.

## What is unfinished

- the frontend is on Next.js 14 and needs an upgrade
- staged ERP synchronization is not available yet; direct synchronization has to be requested explicitly
- the Python services still need one consistent packaging setup
- some dependencies need an upgrade pass
- there is no licence file, so the code should not be treated as licensed for reuse

One provider credential appeared in the old Git history. It is gone from the current files, but it should still be rotated and checked for use.
