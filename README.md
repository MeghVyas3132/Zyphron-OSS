# Zyphron

**The Next-Generation Universal Deployment Platform**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Kubernetes](https://img.shields.io/badge/kubernetes-K3s-326CE5.svg)](https://k3s.io/)

---

## Architecture Monorepo Structure

```
zyphron/
├── backend/                # Backend API (Fastify + TypeScript)
│   ├── src/               # Source code
│   ├── prisma/            # Database schema
│   └── package.json       # Backend dependencies
├── frontend/               # Frontend Web App (Next.js 14)
│   ├── src/               # Source code
│   └── package.json       # Frontend dependencies
├── docker/                 # Docker configurations
├── docs/                   # Documentation (PRD, TRD)
├── docker-compose.dev.yml  # Development environment
└── README.md
```

**Future Services (Planned):**
- `ai-service/` - AI/ML service for code analysis and suggestions
- `infrastructure/` - Terraform/Pulumi IaC configurations
- `sdk/` - Client SDKs for various languages

---

## Table of Contents

- [Introduction](#introduction)
- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Supported Technologies](#supported-technologies)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Infrastructure](#infrastructure)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Introduction

Zyphron is an enterprise-grade universal deployment platform that unifies the capabilities of Vercel, Netlify, Railway, Render, and Supabase into a single, cohesive ecosystem. The platform enables developers to deploy any application stack with a single click, complete with automatic infrastructure provisioning, intelligent environment detection, and comprehensive observability.

### Vision

To democratize cloud deployment by providing a unified platform that eliminates the complexity of modern infrastructure management, enabling developers to focus on building products rather than managing servers.

### Why Zyphron?

| Challenge | Zyphron Solution |
|-----------|------------------|
| Fragmented tooling across platforms | Single unified deployment interface |
| Complex configuration requirements | AI-powered automatic detection |
| Limited visibility into deployments | Real-time logs, metrics, and tracing |
| Vendor lock-in concerns | Multi-cloud support with standard technologies |
| High DevOps barrier | Zero-configuration deployments |

### Self-Deployment Capability

Zyphron can deploy and manage instances of itself, demonstrating the robustness and reliability of its deployment engine. This "inception" feature serves as both a technical showcase and a practical solution for organizations requiring private deployment infrastructure.

---

## Key Features

### Core Platform Features

**Universal Deployment Engine**
- Automatic project type detection from repository contents
- Support for 22+ programming languages and frameworks
- Intelligent Dockerfile generation for any stack
- Monorepo support with multi-application deployments

**Git Integration**
- Native integration with GitHub, GitLab, and Bitbucket
- Automatic deployments on push to configured branches
- Preview deployments for pull requests
- Deployment from specific commits or tags

**Build Pipeline**
- Isolated container-based builds
- Real-time streaming build logs via WebSocket
- Dependency caching for faster builds
- Configurable build commands and timeouts

**Domain and SSL Management**
- Automatic subdomain provisioning (*.zyphron.space)
- Let's Encrypt SSL certificates with auto-renewal
- Custom domain support with DNS configuration
- Wildcard domains for preview environments

**Environment Management**
- Encrypted storage for environment variables
- Environment-specific configurations (dev, staging, prod)
- AI-powered detection of required variables
- Integration with external secret managers

### Advanced Features

**Database as a Service**
- One-click PostgreSQL, MongoDB, Redis, MySQL provisioning
- Automatic connection string injection
- Database branching for preview environments
- Automated backup and restore capabilities

**Deployment Strategies**
- Rolling deployments with health checks
- Blue-green deployments for zero-downtime
- Canary deployments with traffic splitting
- Automatic and manual rollback support

**AI-Powered Intelligence**
- Repository analysis for service detection
- Optimal resource allocation suggestions
- Deployment failure prediction
- Natural language deployment commands
- Automatic documentation generation

**Team Collaboration**
- Team creation and member management
- Role-based access control (Owner, Admin, Developer, Viewer)
- Deployment approval workflows
- Audit logging for all actions
- Slack and Discord notifications

### Enterprise Features

**Multi-Cloud Orchestration**
- Deploy across AWS, GCP, Azure, and Oracle Cloud
- Geographic distribution for latency optimization
- Intelligent traffic routing
- Unified management interface

**Observability Stack**
- Prometheus metrics collection
- Grafana dashboards
- Loki log aggregation
- Jaeger distributed tracing
- Custom alerting rules

**Chaos Engineering**
- Controlled pod termination
- Network latency simulation
- CPU and memory stress testing
- Resilience reporting

**Service Mesh**
- Automatic mTLS between services
- Traffic management policies
- Circuit breaking and retry logic
- Service-to-service observability

**Edge Functions**
- Serverless function deployment
- Edge location execution
- Multiple runtime support
- Invocation metrics and logging

---

## Architecture Overview

### High-Level Architecture

```
                                    [Load Balancer]
                                          |
                                    [API Gateway]
                                    (Traefik/Kong)
                                          |
                    +---------------------+---------------------+
                    |                     |                     |
              [Web Dashboard]      [Core API]            [WebSocket Server]
              (Next.js SSR)       (Node.js/Go)           (Real-time Logs)
                                          |
                    +---------------------+---------------------+
                    |                     |                     |
            [Auth Service]        [Deployment Engine]    [Database Service]
            (Supabase Auth)        (Build/Deploy)        (Provisioning)
                                          |
                    +---------------------+---------------------+
                    |                     |                     |
            [Build Workers]        [Container Runtime]    [AI Engine]
             (BullMQ/Kafka)          (Docker/K8s)        (Python/FastAPI)
                                          |
                    +---------------------+---------------------+
                    |                     |                     |
            [Object Storage]       [Message Queue]       [Observability]
            (S3/MinIO)             (Kafka/Redis)         (Prometheus/Loki)
```

### Component Responsibilities

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Web Dashboard | Next.js 14 | User interface, project management |
| Core API | Node.js/Fastify | Request handling, business logic |
| WebSocket Server | Socket.IO | Real-time log streaming |
| Build Workers | BullMQ | Build execution, image creation |
| Deployment Service | Go | Kubernetes resource management |
| Database Service | Go | Database provisioning |
| AI Engine | Python/FastAPI | Intelligent automation |

### Service Communication

- **Synchronous**: REST/gRPC for request-response operations
- **Asynchronous**: Kafka for event streaming, Redis for job queues
- **Real-time**: WebSocket for live updates

---

## Technology Stack

### Application Layer

| Category | Technology | Version |
|----------|------------|---------|
| Frontend | Next.js (App Router) | 14.x |
| UI Components | shadcn/ui + Tailwind CSS | 3.x |
| State Management | Zustand + React Query | 5.x |
| Core API | Node.js + Fastify | 20.x LTS |
| Worker Services | Node.js + Go | 1.21+ |
| AI Engine | Python + FastAPI | 3.11+ |
| CLI Tool | Go + Cobra | 1.21+ |

### Infrastructure Layer

| Category | Technology | Purpose |
|----------|------------|---------|
| Container Orchestration | K3s | Lightweight Kubernetes |
| Ingress Controller | Traefik | Routing, SSL termination |
| Service Mesh | Linkerd | mTLS, traffic management |
| Message Queue | Kafka + Redis Streams | Event streaming |
| Task Queue | BullMQ | Job processing |
| Secret Management | HashiCorp Vault | Dynamic secrets |

### Data Layer

| Category | Technology | Purpose |
|----------|------------|---------|
| Primary Database | PostgreSQL (Supabase) | Application data |
| Document Store | MongoDB | Logs, events |
| Cache | Redis Cluster | Session, caching |
| Object Storage | MinIO (S3-compatible) | Artifacts, backups |

### Observability Layer

| Category | Technology | Purpose |
|----------|------------|---------|
| Metrics | Prometheus | Metric collection |
| Visualization | Grafana | Dashboards |
| Logging | Loki | Log aggregation |
| Tracing | Jaeger | Distributed tracing |
| Alerting | Alertmanager | Alert routing |

### DevOps Layer

| Category | Technology | Purpose |
|----------|------------|---------|
| Infrastructure as Code | Terraform | Cloud provisioning |
| Configuration Management | Ansible | Server configuration |
| GitOps | ArgoCD | Continuous deployment |
| CI/CD | GitHub Actions | Build automation |
| Container Registry | Harbor | Image storage |

---

## Supported Technologies

### Programming Languages

| Language | Detection Method | Build System |
|----------|------------------|--------------|
| Node.js | `package.json` | npm, yarn, pnpm |
| Python | `requirements.txt`, `pyproject.toml` | pip, poetry |
| Go | `go.mod` | go build |
| Rust | `Cargo.toml` | cargo |
| Java | `pom.xml`, `build.gradle` | Maven, Gradle |
| Ruby | `Gemfile` | Bundler |
| PHP | `composer.json` | Composer |
| .NET | `*.csproj`, `*.fsproj` | dotnet |
| Elixir | `mix.exs` | Mix |
| Scala | `build.sbt` | sbt |

### Frontend Frameworks

| Framework | Detection | Build Output |
|-----------|-----------|--------------|
| React | react dependency | Static files |
| Vue.js | vue dependency | Static files |
| Angular | `angular.json` | Static files |
| Svelte | svelte dependency | Static files |
| Next.js | `next.config.js` | Server/Static |
| Nuxt.js | `nuxt.config.js` | Server/Static |
| Gatsby | `gatsby-config.js` | Static files |
| Astro | `astro.config.mjs` | Static/SSR |
| SvelteKit | `svelte.config.js` | Server/Static |
| Remix | `remix.config.js` | Server |

### Backend Frameworks

| Framework | Language | Detection |
|-----------|----------|-----------|
| Express | Node.js | express dependency |
| Fastify | Node.js | fastify dependency |
| NestJS | Node.js | @nestjs/core dependency |
| Django | Python | `manage.py` |
| Flask | Python | flask dependency |
| FastAPI | Python | fastapi dependency |
| Spring Boot | Java | spring-boot dependency |
| Gin | Go | gin-gonic import |
| Rails | Ruby | `config/routes.rb` |
| Laravel | PHP | `artisan` file |
| Phoenix | Elixir | phoenix dependency |
| Actix | Rust | actix-web dependency |

### Databases

| Database | Type | Versions Supported |
|----------|------|-------------------|
| PostgreSQL | Relational | 14, 15, 16 |
| MySQL | Relational | 8.0 |
| MongoDB | Document | 6.0, 7.0 |
| Redis | Key-Value | 7.0, 7.2 |
| SQLite | Embedded | 3.x |

### Static Site Generators

| Generator | Language | Detection |
|-----------|----------|-----------|
| Hugo | Go | `config.toml` (hugo) |
| Jekyll | Ruby | `_config.yml` |
| Eleventy | Node.js | `.eleventy.js` |
| Hexo | Node.js | `_config.yml` (hexo) |
| Docusaurus | Node.js | @docusaurus dependency |
| VuePress | Node.js | vuepress dependency |
| MkDocs | Python | `mkdocs.yml` |

---

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- Docker 24.x or higher
- Git 2.x or higher
- PostgreSQL 14+ (or Supabase account)
- Redis 7.x (optional, for caching)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/MeghVyas3132/Zyphron-Backend.git
cd Zyphron-Backend

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Configure environment variables (see Configuration section)
nano .env

# Start development server
npm run dev

# Or start production server
npm start
```

### Docker Quick Start

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Verify Installation

```bash
# Check health endpoint
curl http://localhost:3000/health

# Expected response
{"status":"healthy","timestamp":"2024-01-01T00:00:00.000Z"}
```

---

## Configuration

### Environment Variables

#### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `3000` |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | `eyJhbGc...` |
| `JWT_SECRET` | JWT signing secret | `your-secret-key` |

#### Deployment Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PROJECTS_DIR` | Project storage directory | `/var/www/projects` |
| `BASE_DOMAIN` | Base domain for subdomains | `zyphron.space` |
| `MAX_CONCURRENT_PIPELINES` | Maximum concurrent builds | `5` |
| `BUILD_TIMEOUT` | Build timeout in seconds | `1800` |
| `CONTAINER_REGISTRY` | Docker registry URL | `registry.zyphron.space` |

#### Database Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `MONGODB_URL` | MongoDB connection string | - |

#### External Services

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | Yes |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret | Yes |
| `KAFKA_BROKERS` | Kafka broker addresses | Optional |
| `VAULT_ADDR` | HashiCorp Vault address | Optional |
| `OPENAI_API_KEY` | OpenAI API key for AI features | Optional |

#### Observability

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging level | `info` |
| `PROMETHEUS_PORT` | Metrics port | `9090` |
| `JAEGER_ENDPOINT` | Jaeger collector URL | - |

### Configuration Files

```
config/
├── default.json      # Default configuration
├── production.json   # Production overrides
├── development.json  # Development overrides
└── custom-environment-variables.json  # Env var mapping
```

### Example .env File

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Authentication
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Deployment
PROJECTS_DIR=/var/www/projects
BASE_DOMAIN=zyphron.space
MAX_CONCURRENT_PIPELINES=5
BUILD_TIMEOUT=1800

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/zyphron
REDIS_URL=redis://localhost:6379

# Optional: AI Features
OPENAI_API_KEY=sk-your-openai-api-key

# Optional: Observability
PROMETHEUS_PORT=9090
JAEGER_ENDPOINT=http://jaeger:14268/api/traces
```

---

## API Reference

### Base URL

```
Production: https://api.zyphron.space/v1
Development: http://localhost:3000/api/v1
```

### Authentication

All authenticated endpoints require a Bearer token:

```
Authorization: Bearer <jwt_token>
```

### Endpoints

#### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/github` | Initiate GitHub OAuth |
| `POST` | `/auth/github/callback` | Handle OAuth callback |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/logout` | Invalidate session |
| `GET` | `/auth/me` | Get current user |

#### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/projects` | List user projects |
| `POST` | `/projects` | Create new project |
| `GET` | `/projects/:id` | Get project details |
| `PUT` | `/projects/:id` | Update project |
| `DELETE` | `/projects/:id` | Delete project |

#### Deployments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/projects/:id/deploy` | Trigger deployment |
| `GET` | `/deployments/:id` | Get deployment status |
| `GET` | `/deployments/:id/logs` | Get build logs |
| `POST` | `/deployments/:id/rollback` | Rollback deployment |
| `POST` | `/deployments/:id/cancel` | Cancel deployment |

#### Environment Variables

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/projects/:id/env` | List environment variables |
| `POST` | `/projects/:id/env` | Create variable |
| `PUT` | `/projects/:id/env/:varId` | Update variable |
| `DELETE` | `/projects/:id/env/:varId` | Delete variable |

#### Databases

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/projects/:id/databases` | Provision database |
| `GET` | `/databases/:id` | Get database details |
| `DELETE` | `/databases/:id` | Delete database |
| `POST` | `/databases/:id/backup` | Create backup |

#### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/health/ready` | Readiness check |
| `GET` | `/health/live` | Liveness check |

### Request/Response Examples

#### Create Project

```bash
curl -X POST https://api.zyphron.space/v1/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-project",
    "repositoryUrl": "https://github.com/user/repo",
    "branch": "main"
  }'
```

Response:

```json
{
  "id": "proj_abc123",
  "name": "my-project",
  "repositoryUrl": "https://github.com/user/repo",
  "branch": "main",
  "subdomain": "my-project",
  "url": "https://my-project.zyphron.space",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

#### Trigger Deployment

```bash
curl -X POST https://api.zyphron.space/v1/projects/proj_abc123/deploy \
  -H "Authorization: Bearer $TOKEN"
```

Response:

```json
{
  "id": "dep_xyz789",
  "projectId": "proj_abc123",
  "status": "queued",
  "trigger": "manual",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Error Responses

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "repositoryUrl",
        "message": "Must be a valid GitHub URL"
      }
    ],
    "requestId": "req_abc123"
  }
}
```

### Rate Limiting

| Endpoint Pattern | Limit | Window |
|------------------|-------|--------|
| `/auth/*` | 10 | 1 minute |
| `/projects/*/deploy` | 20 | 1 hour |
| `/*` (authenticated) | 1000 | 1 hour |
| `/*` (unauthenticated) | 100 | 1 hour |

Rate limit headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1704067200
```

---

## Infrastructure

### Server Topology

```
+------------------------------------------------------------------+
|                    ORACLE CLOUD (Primary)                         |
|                    VM: 4 OCPU, 24GB RAM                          |
|  +------------------------------------------------------------+  |
|  | K3s Control Plane | Kafka | Redis | PostgreSQL | Vault     |  |
|  +------------------------------------------------------------+  |
|  | Prometheus | Grafana | Loki | Jaeger                        |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+

+---------------------------+  +---------------------------+
|       AWS EC2             |  |       GCP VM              |
|    t3.medium (4GB)        |  |    e2-medium (4GB)        |
|  +---------------------+  |  |  +---------------------+  |
|  | K3s Worker Node     |  |  |  | K3s Worker Node     |  |
|  | User Deployments    |  |  |  | User Deployments    |  |
|  +---------------------+  |  |  +---------------------+  |
+---------------------------+  +---------------------------+

+---------------------------+
|       AZURE VM            |
|    B2s (4GB)              |
|  +---------------------+  |
|  | K3s Worker Node     |  |
|  | User Deployments    |  |
|  +---------------------+  |
+---------------------------+
```

### Kubernetes Namespaces

| Namespace | Purpose |
|-----------|---------|
| `zyphron-system` | Platform control plane |
| `zyphron-data` | Stateful services |
| `zyphron-observability` | Monitoring stack |
| `user-deployments` | User applications |

### Resource Requirements

#### Minimum (Development)

| Resource | Requirement |
|----------|-------------|
| CPU | 2 cores |
| Memory | 4 GB |
| Storage | 50 GB |

#### Recommended (Production)

| Resource | Requirement |
|----------|-------------|
| CPU | 8+ cores |
| Memory | 16+ GB |
| Storage | 200+ GB SSD |

---

## Development

### Project Structure

```
zyphron/
├── apps/
│   ├── web/                 # Next.js dashboard
│   ├── api/                 # Core API service
│   ├── workers/             # Build workers
│   ├── ai-engine/           # AI service (Python)
│   └── cli/                 # CLI tool (Go)
├── packages/
│   ├── shared/              # Shared utilities
│   ├── ui/                  # UI components
│   ├── database/            # Database schemas
│   └── sdk/                 # Client SDK
├── services/
│   └── deployment/          # Deployment service (Go)
├── infrastructure/
│   ├── terraform/           # IaC definitions
│   ├── kubernetes/          # K8s manifests
│   ├── helm/                # Helm charts
│   └── ansible/             # Server configuration
├── docs/                    # Documentation
├── scripts/                 # Utility scripts
└── docker-compose.yml       # Local development
```

### Development Setup

```bash
# Install dependencies
npm install

# Start development services
docker-compose -f docker-compose.dev.yml up -d

# Run database migrations
npm run db:migrate

# Start development server with hot reload
npm run dev

# Run linting
npm run lint

# Run type checking
npm run typecheck
```

### Code Standards

**TypeScript/JavaScript**
- ESLint with Airbnb configuration
- Prettier for formatting
- Strict TypeScript mode enabled

**Go**
- gofmt for formatting
- golangci-lint for linting
- Effective Go guidelines

**Python**
- Black for formatting
- Ruff for linting
- Type hints required

### Git Workflow

```
main (production)
  └── develop (staging)
       ├── feature/TICKET-123-description
       ├── fix/TICKET-456-description
       └── hotfix/TICKET-789-description
```

### Commit Message Format

```
type(scope): subject

body

footer

Types: feat, fix, docs, style, refactor, test, chore
Example: feat(api): add deployment rollback endpoint
```

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Test Coverage Requirements

| Test Type | Coverage Target |
|-----------|-----------------|
| Unit | 80% |
| Integration | 60% |
| E2E | Critical paths |

### Load Testing

```bash
# Run load tests with k6
k6 run tests/load/deployment.js

# Run stress tests
k6 run tests/load/stress.js
```

---

## Deployment

### Production Deployment

#### Using Kubernetes

```bash
# Apply Kubernetes manifests
kubectl apply -k kubernetes/overlays/production

# Or using Helm
helm install zyphron ./helm/zyphron \
  --namespace zyphron-system \
  --values values.production.yaml
```

#### Using Docker Compose

```bash
# Production deployment
docker-compose -f docker-compose.prod.yml up -d
```

### CI/CD Pipeline

The project uses GitHub Actions for CI/CD:

1. **Test**: Run linting, type checking, and tests
2. **Build**: Build Docker images
3. **Push**: Push images to container registry
4. **Deploy**: ArgoCD syncs with cluster

### Rollback

```bash
# Kubernetes rollback
kubectl rollout undo deployment/api -n zyphron-system

# Or rollback to specific revision
kubectl rollout undo deployment/api --to-revision=2
```

---

## Documentation

Comprehensive documentation is available in the `docs/` directory:

| Document | Description |
|----------|-------------|
| [PRD.md](docs/PRD.md) | Product Requirements Document |
| [TRD.md](docs/TRD.md) | Technical Requirements Document |
| [API.md](docs/API.md) | API Documentation |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture Details |
| [SECURITY.md](docs/SECURITY.md) | Security Policies |
| [RUNBOOK.md](docs/RUNBOOK.md) | Operational Runbooks |

---

## Contributing

We welcome contributions to Zyphron. Please read our contributing guidelines before submitting a pull request.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Pull Request Requirements

- [ ] Code follows style guidelines
- [ ] Tests cover new functionality
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
- [ ] All CI checks passing

### Code Review Process

1. At least one approval required
2. All automated checks must pass
3. No merge conflicts
4. Documentation updated if needed

---

## Security

### Reporting Vulnerabilities

If you discover a security vulnerability, please report it by emailing security@zyphron.space. Do not open a public issue.

### Security Features

- OAuth 2.0 authentication
- JWT tokens with RS256 signing
- Row-level security in database
- Encrypted secrets storage
- Automatic mTLS in service mesh
- Regular security audits

### Compliance

- SOC 2 Type II (planned)
- GDPR compliant data handling
- Audit logging for all operations

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2025 Zyphron

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Acknowledgments

- [Vercel](https://vercel.com) - Inspiration for developer experience
- [Railway](https://railway.app) - Inspiration for simplicity
- [Supabase](https://supabase.com) - Database and authentication
- [Kubernetes](https://kubernetes.io) - Container orchestration
- [CNCF](https://cncf.io) - Cloud native technologies

---

**Built with determination by the Zyphron Team**

*Zyphron - Deploy Anything, Anywhere, with One Click*