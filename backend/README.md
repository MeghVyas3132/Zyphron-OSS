# Zyphron Backend

Backend API and worker runtime for Zyphron.

## Scope

This service handles authentication, project/deployment lifecycle, build orchestration, environment and domain management, team and audit features, plus observability and advanced deployment endpoints.

## Tech Stack

- Fastify + TypeScript
- Prisma + PostgreSQL
- Redis + BullMQ
- Optional Kafka (enabled in dev compose, disabled in prod compose)
- Docker socket integration for image build/deploy workflows

## Code Map

```text
backend/
  src/
    app.ts
    index.ts                 API entry
    worker.ts                worker entry
    config/                  config schema and env loading
    routes/                  API route modules
    services/                detector/builder/deployer/etc
    lib/                     shared clients and utils
  prisma/
    schema.prisma
    migrations/
```

## Route Groups

Routes are exported from `src/routes/index.ts`:

- `health`
- `auth`, `github`, `ai`
- `projects`, `deployments`, `services`, `previews`
- `env`, `databases`, `db-branching`
- `domains`, `strategies`, `edge`, `chaos`, `observability`, `metrics`
- `teams`, `api-keys`, `audit`, `self-deploy`
- `cloud` (currently disabled/not implemented)

## Scripts

```bash
npm run dev            # API in watch mode
npm run worker:dev     # worker in watch mode
npm run build
npm run start
npm run worker:start
npm run test
npm run lint
npm run typecheck
```

Database and Prisma:

```bash
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:studio
```

## Environment Variables

Config is validated in `src/config/index.ts`.

Required for normal runtime:

- `DATABASE_URL`
- `JWT_SECRET` (min 32 chars)

Commonly required in real deployments:

- `REDIS_URL`
- `BASE_DOMAIN`
- `CONTAINER_REGISTRY`
- `PROJECTS_DIR`
- `ENCRYPTION_KEY`

Optional integrations:

- GitHub OAuth: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- Groq: `GROQ_API_KEYS`, `GROQ_MODEL`
- Resend: `RESEND_API_KEYS`, `RESEND_FROM`, `RESEND_REPLY_TO`
- Prometheus: `PROMETHEUS_URL`

## Local Run

From repo root:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Direct local API run:

```bash
cd backend
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

## Notes

- Production compose sets `KAFKA_ENABLED=false` by default.
- `cloud` routes are not active features today and should not be treated as shipped cloud orchestration.

