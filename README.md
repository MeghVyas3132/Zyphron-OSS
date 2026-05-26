# Zyphron

Single platform to deploy apps from Git repositories with real-time logs, environment management, multi-service Compose support, and built-in observability.

## Source of Truth

This README is the main and single source of truth for the current shipped Zyphron platform in this repository.

If any other doc conflicts with this file, this file wins.

## What Is Shipped

### Backend API and Worker

- Fastify API in `backend/src` with Prisma/Postgres, Redis, optional Kafka, Docker-based build/deploy pipeline.
- Worker process in `backend/src/worker.ts` for asynchronous deployment workloads.
- Route groups exported in `backend/src/routes/index.ts`:
  - `auth`, `github`, `ai`, `previews`, `projects`, `deployments`, `services`
  - `env`, `databases`, `webhooks`, `metrics`, `teams`, `api-keys`, `audit`
  - `cloud` (currently disabled with 501 responses), `domains`, `strategies`, `edge`
  - `observability`, `chaos`, `db-branching`, `self-deploy`, `health`

### Frontend Dashboard

- Next.js App Router app in `frontend/src/app`.
- Auth flows: login, register, forgot-password, OAuth callback.
- Dashboard pages include:
  - Overview and project flows (`/dashboard`, `/projects`, `/projects/new`, project detail/deployments)
  - Deploy stack pages (`/projects/deploy-stack`, `/projects/stacks`)
  - Admin, teams, audit, observability, strategies, chaos, edge, self-deploy, cloud

### CLI

- TypeScript CLI in `cli/src`, command entry in `cli/src/index.ts`.
- Installed commands include auth, deploy, status, logs, rollback, stress, and project creation.
- Package binaries: `zyphron` and `zy`.

### Landing App

- Marketing site in `landing/` (Vite + React), now tracked as regular files in this monorepo.

### Runtime and Infra

- Development stack: `docker-compose.dev.yml`
  - frontend, api, worker, postgres, redis, zookeeper, kafka, registry, traefik, prometheus, grafana, loki, minio.
- Production stack: `docker-compose.prod.yml`
  - traefik, api, worker, frontend, landing, postgres, redis, registry, prometheus, grafana, loki.
  - Kafka is intentionally disabled in production compose (`KAFKA_ENABLED=false`).
- Helm chart available in `helm/zyphron` for Kubernetes-oriented deployments.

## Repository Layout

```text
zyphron/
  backend/               API + worker + Prisma schema
  frontend/              Dashboard app (Next.js)
  cli/                   CLI tool (TypeScript)
  landing/               Marketing site (Vite)
  docker/                Dockerfiles + observability config
  docs/                  Supporting documents
  helm/                  Helm chart
  scripts/               Setup and test scripts
  docker-compose.dev.yml
  docker-compose.prod.yml
```

## Local Development

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ for backend/frontend local runs
- Node.js 18+ for CLI local runs

### Start with Compose

```bash
docker compose -f docker-compose.dev.yml up --build
```

Main local endpoints:

- Dashboard: `http://localhost:3004`
- API: `http://localhost:3003`
- Kafka UI: `http://localhost:8080`
- Grafana: `http://localhost:3001`
- Prometheus: `http://localhost:9090`

### Backend local scripts

```bash
cd backend
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

### Frontend local scripts

```bash
cd frontend
npm install
npm run dev
```

### CLI local scripts

```bash
cd cli
npm install
npm run build
node dist/index.js --help
```

## Production Compose Deployment

Use `docker-compose.prod.yml` on a Linux host with Docker installed.

Required env values at minimum:

- `DOMAIN`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `PG_PASSWORD`
- `ACME_EMAIL`

Optional integrations:

- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `RESEND_API_KEYS`, `RESEND_FROM`
- `GROQ_API_KEYS`

Run:

```bash
docker compose -f docker-compose.prod.yml up -d
```

## Configuration Reference

Backend config is defined in `backend/src/config/index.ts` and validated with Zod.

Important variables:

- Core: `NODE_ENV`, `PORT`, `LOG_LEVEL`
- Data: `DATABASE_URL`, `REDIS_URL`
- Auth: `JWT_SECRET`, `JWT_EXPIRES_IN`, `ALLOW_DEV_TOKEN_BYPASS`, `BOOTSTRAP_ADMIN_EMAILS`
- Git OAuth: `GITHUB_*`, `GOOGLE_*`
- AI and email: `GROQ_API_KEYS`, `GROQ_MODEL`, `RESEND_API_KEYS`, `RESEND_FROM`
- Deployment: `CONTAINER_REGISTRY`, `PROJECTS_DIR`, `BASE_DOMAIN`, `BUILD_TIMEOUT`, `MAX_CONCURRENT_BUILDS`, `USE_HTTPS`
- Storage: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`
- Metrics: `PROMETHEUS_URL`

## Current Feature Status

### Production-ready in codebase

- Auth and token-based sessions
- Project and deployment management
- Multi-service detection and deployment workflows
- Environment variable management
- Team and API key management
- Audit and metrics endpoints
- Domain management and observability routes

### Implemented but should be treated as advanced/experimental

- Preview environments
- Deployment strategies (rolling, blue-green, canary)
- Chaos and stress endpoints
- Edge function routes
- Database branching
- Self-deploy flows

### Present but intentionally disabled

- Multi-cloud route group (`cloud`) currently returns not implemented.

## API and Docs

- OpenAPI spec: `docs/openapi.yaml`
- Deployment guide: `docs/DEPLOY.md`
- Product baseline (aligned to shipped scope): `docs/PRD.md`
- Technical baseline (aligned to shipped scope): `docs/TRD.md`
- Backend-focused usage: `backend/README.md`
- Frontend-focused usage: `frontend/README.md`

## Documentation Policy

- Keep this README current when features are added, removed, or behavior changes.
- Update supporting docs in the same pull request.
- Do not document unimplemented architecture as shipped functionality.

