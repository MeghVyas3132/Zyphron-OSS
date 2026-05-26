# Zyphron Deployment Guide

This file explains deployment paths that are currently valid for the shipped codebase.

Root `README.md` is the canonical source of truth. This guide expands operational steps only.

## Deployment Modes

- Mode A: Docker Compose production (`docker-compose.prod.yml`) on a single Linux host.
- Mode B: Kubernetes deployment using `helm/zyphron`.

## Mode A: Docker Compose Production

### 1) Host prerequisites

- Linux host with Docker and Docker Compose plugin
- Open ports: 80, 443
- DNS records:
  - `<domain>` -> host IP
  - `app.<domain>` -> host IP
  - `api.<domain>` -> host IP

### 2) Required environment

Provide at minimum:

- `DOMAIN`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `PG_PASSWORD`
- `ACME_EMAIL`

Optional integration keys:

- GitHub OAuth: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- Resend: `RESEND_API_KEYS`, `RESEND_FROM`
- Groq: `GROQ_API_KEYS`

### 3) Start stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 4) Verify

- Landing: `https://<domain>`
- Dashboard: `https://app.<domain>`
- API health: `https://api.<domain>/health`
- Grafana: `https://app.<domain>/grafana`

## Mode B: Helm on Kubernetes

Use chart in `helm/zyphron` when running on a cluster.

High-level flow:

1. Create namespace and secret values.
2. Review values file (`values.yaml` or `values.aws.yaml`).
3. Install chart:

```bash
helm upgrade --install zyphron helm/zyphron -n zyphron-system --create-namespace -f helm/zyphron/values.yaml
```

4. Configure ingress and TLS according to your cluster setup.

## Capacity Notes

Production compose memory limits are defined in `docker-compose.prod.yml` and represent the current supported single-host profile:

- API: 512MB
- Worker: 1GB
- Frontend: 256MB
- Landing: 64MB
- Postgres: 512MB
- Redis: 256MB
- Prometheus: 512MB
- Grafana: 256MB
- Loki: 256MB

## Operational Notes

- Kafka is disabled in production compose by default.
- Worker and API mount the Docker socket to run build/deploy workflows.
- Keep release binaries and local env files out of git history.

