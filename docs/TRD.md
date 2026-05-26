# Zyphron Technical Requirements (Current Implementation)

Document version: 2.0
Last updated: 2026-05-26
Status: Active baseline

## Purpose

This TRD captures the technical architecture that exists in the current codebase.

Root `README.md` remains the canonical source of truth.

## System Overview

Zyphron runs as a monorepo with four main runtime surfaces:

- Backend API (`backend/src/index.ts`)
- Worker (`backend/src/worker.ts`)
- Dashboard frontend (`frontend`)
- Landing app (`landing`)

## Runtime Topology

### Development

Defined in `docker-compose.dev.yml`:

- frontend, api, worker
- postgres, redis, zookeeper, kafka
- registry, traefik
- prometheus, grafana, loki
- minio

### Production

Defined in `docker-compose.prod.yml`:

- traefik
- api, worker, frontend, landing
- postgres, redis, registry
- prometheus, grafana, loki

Key production characteristics:

- TLS via Traefik + ACME
- Kafka disabled by default
- API/worker mount Docker socket for deployment pipeline

## Backend Design

### Core technologies

- Fastify
- Prisma + PostgreSQL
- Redis + BullMQ
- Optional Kafka eventing
- Docker runtime integration through mounted socket

### Route modules

Route exports in `backend/src/routes/index.ts` represent the implemented surface.

Important note: `cloud` routes are present but currently disabled/not implemented.

### Services

`backend/src/services` contains deployment engine modules including detector, builder, deployer, compose-scanner, stress, and related support services.

## Frontend Design

- Next.js 14 App Router application
- TanStack Query for server data state
- Structured auth and dashboard route groups in `frontend/src/app`

## CLI Design

- TypeScript CLI using Commander, entrypoint `cli/src/index.ts`
- Supports auth, deploy, status, logs, rollback, stress, and project create commands

## Configuration and Validation

Backend config schema is in `backend/src/config/index.ts`.

- Environment is loaded from project root `.env` and `backend/.env`.
- Values are schema-validated with Zod at boot.
- Boot fails fast on invalid required configuration.

## Data and State

- Primary relational data: PostgreSQL (Prisma)
- Queue/cache: Redis
- Metrics: Prometheus
- Logs: Loki
- Dashboards: Grafana

## Security Baseline

- JWT-based auth
- Configurable OAuth integration
- Encryption key for sensitive value handling
- API key management routes
- Audit log routes for action traceability

## Known Technical Constraints

- Multi-cloud orchestration is not active in current implementation.
- Large release binaries should not be committed to git history.
- Production stack assumes host-level Docker access for build/deploy operations.

## Change Control

For technical behavior changes:

1. Update root `README.md` first.
2. Update this TRD for architecture impact.
3. Update deployment/run docs as needed.

