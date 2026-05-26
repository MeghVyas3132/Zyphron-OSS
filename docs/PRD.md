# Zyphron Product Requirements (Shipped Baseline)

Document version: 2.0
Last updated: 2026-05-26
Status: Active baseline

## Purpose

This PRD reflects what is currently shipped in this repository.

For feature/source truth, root `README.md` is authoritative.

## Product Summary

Zyphron is a deployment platform that lets teams deploy application repositories with environment management, deployment lifecycle control, and built-in operational visibility.

## Primary User Jobs

- Deploy application code from repository URLs.
- Manage project environments and secrets.
- Observe deployment and runtime status.
- Collaborate through team roles and audit traces.

## Shipped Product Areas

### 1) Identity and access

- Register/login flows
- OAuth integrations (GitHub/Google, when configured)
- Team management and role-based access
- API key management

### 2) Project and deployment lifecycle

- Create/manage projects
- Trigger and track deployments
- Service-level and deployment-level workflows
- Rollback and log/status access

### 3) Configuration and integrations

- Environment variable management
- Domain management
- GitHub integration and webhook support

### 4) Operations and governance

- Audit endpoints
- Metrics and observability routes
- Admin capabilities

### 5) Advanced feature set

- Preview environments
- Deployment strategies
- Stress and chaos routes
- Edge and self-deploy routes
- Database branching

These advanced areas exist in code and APIs; adoption level may vary by environment.

## Non-goals in current shipped state

- Full multi-cloud orchestration in production (`cloud` routes are disabled).
- A separate Python AI microservice runtime.
- Vault-based secret management as a mandatory runtime dependency.

## Success Criteria (Current)

- Reliable project/deployment lifecycle API behavior.
- Stable dashboard + API + worker operation in compose production setup.
- Consistent environment and authentication behavior across API and UI.

## Documentation Requirement

When any shipped behavior changes, update:

1. Root `README.md` first.
2. Relevant service docs (`backend/README.md`, `frontend/README.md`).
3. Supporting docs in `docs/`.

