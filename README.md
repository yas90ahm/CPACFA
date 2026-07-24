# Sabit

Sabit started with something I kept noticing in finance work. During a close,
files move around and people have to be chased. After all that, you still have
to know whether the number in front of you is the right one.

I wanted to see where AI could actually help. It can read a file, classify an
exception, and explain what looks wrong. I do not trust it with the number
itself. The balancing rules, approvals, close state, and certification therefore
sit in ordinary code.

If the model and the ledger disagree, the ledger wins.

This is a working prototype, not production accounting software. It combines a
TypeScript API and worker, a Next.js interface, PostgreSQL migrations, and a few
smaller Python services. Some parts are mature experiments; others still need
hardening.

## What works today

- ingesting trial-balance and general-ledger files
- checking that accounting data balances before it moves forward
- routing exceptions to a person for review
- moving work through draft, approval, posting, close, and certification
- keeping evidence and a hash-chained audit trail
- using AI for suggestions and explanations while accounting controls stay in
  code
- experimenting with ERP, MCP, and classification-service integrations

## Repository map

```text
src/          API, worker, business rules, database access, and services
frontend/     Next.js web application
migrations/   PostgreSQL migration history
tests/        Unit, adapter, and integration tests
connectors/   Experimental ERP and MCP connectors
mcp_server/   Python MCP and webhook services
slm/          Python classification service
shared/       Shared configuration and types
scripts/      Setup, verification, and maintenance scripts
data/         Reference inputs; generated runtime evidence is ignored
```

See [the architecture guide](docs/ARCHITECTURE.md) for the main boundaries and
data flow.

## Setup

You need Node.js 18 or newer and PostgreSQL. Docker is optional.

```bash
git clone https://github.com/yas90ahm/sabit.git
cd sabit
npm install
cp .env.example .env
```

At minimum, review these values in `.env`:

| Variable | Purpose |
| --- | --- |
| `MODE` | Runtime profile: `dev`, `demo`, `staging`, or `prod` |
| `PORT` | API port |
| `DATABASE_URL` | PostgreSQL connection |
| `JWT_SECRET` | Token signing; required outside local development |

Production certification also needs persistent Ed25519 signing keys.
`npm run keygen` prints them in the format the certificate code expects.

Prepare the database and start the API:

```bash
npm run db:migrate
npm run db:verify
npm run seed:demo
npm run dev
```

Start the web application in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The Docker stack starts PostgreSQL, the API, and the classification service:

```bash
docker compose up --build
```

## Checks

```bash
npm run build
npm test
```

The database integration flow also needs PostgreSQL with the migrated schema and
a running API:

```bash
npm run test:integration
```

## Security and limits

Read [SECURITY.md](SECURITY.md) before using the project with sensitive data.
In particular, replace demo credentials, keep secrets out of Git, and use the
strict production runtime settings.

Known limits include an older Next.js frontend, Python services with separate
packaging, dependencies that need an upgrade pass, and experimental external
connectors. There is currently no license file, so the repository does not grant
permission to reuse the code.
