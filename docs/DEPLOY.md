# Zyphron — College Demo Deployment Guide
## Run 25 projects free on AWS (or Oracle ARM)

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│              Single EC2 / Oracle ARM Node                       │
│                                                                 │
│  K3s (lightweight Kubernetes)                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ zyphron-system namespace                                 │   │
│  │  API  Worker×2  Frontend  Postgres  Redis  Kafka         │   │
│  │  Prometheus  Grafana(no-auth)  Loki  Traefik             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  zyphron-user-<slug> namespaces (one per deployed project)      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│  │  n8n app   │  │  ai-inter  │  │  myapp     │  …×25         │
│  │  + celery  │  │  + worker  │  │  + ws      │               │
│  └────────────┘  └────────────┘  └────────────┘               │
│                                                                 │
│  Traefik → routes:  <slug>.yourdomain.com → user container     │
│                     api.yourdomain.com    → Zyphron API        │
│                     app.yourdomain.com    → Zyphron UI         │
│                     app.yourdomain.com/grafana → Grafana       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Free Tier Options (choose one)

### Option A — Oracle Cloud ARM (BEST — genuinely free forever)
- **A1.Flex**: 4 ARM OCPUs + 24 GB RAM + 200 GB storage = **$0/month forever**
- Fits: platform (4 GB) + 25 projects × 800 MB = 24 GB ✅
- Get it: [cloud.oracle.com](https://cloud.oracle.com) → Always Free Tier

### Option B — AWS with Student/Activate Credits (demo only)
| Instance | vCPU | RAM | Cost | Duration with $100 credit |
|---|---|---|---|---|
| t3.xlarge | 4 | 16 GB | $0.17/hr | ~24 days |
| t3.xlarge **Spot** | 4 | 16 GB | ~$0.05/hr | ~83 days |
| t3.2xlarge Spot | 8 | 32 GB | ~$0.10/hr | ~41 days |

**Get free AWS credits:**
- GitHub Student Pack → $100 AWS credits
- AWS Educate → $100 credits
- AWS Activate (startup) → $1,000-5,000 credits

### Free Services Used
| Service | Free Tier | Used For |
|---|---|---|
| AWS EC2 t2.micro | 750 hr/month | Not enough alone — use Spot or Oracle |
| AWS S3 | 5 GB / 20K GET | Static assets, build artifacts |
| AWS ECR | 500 MB/month | Container image storage |
| **Resend** | **3,000 emails/month** | All platform emails (signup, deploys) |
| **Groq API** | **6,000 tokens/min** | AI build error analysis |
| Let's Encrypt | Unlimited | TLS certificates via Traefik |
| K3s | Free | Lightweight Kubernetes |
| Helm | Free | Package manager |

---

## Step-by-Step Setup

### 1. Provision Instance

**Oracle (recommended):**
```bash
# In Oracle Cloud console:
# Compute → Instances → Create
# Shape: VM.Standard.A1.Flex (4 OCPU, 24 GB ARM)
# Image: Ubuntu 22.04 ARM
# Network: Allow ingress 22, 80, 443
```

**AWS:**
```bash
# Launch t3.xlarge (or Spot) Ubuntu 22.04
# Security group: allow 22 (SSH), 80 (HTTP), 443 (HTTPS)
# EBS: 30 GB gp3 (free tier) — add 50 GB extra if needed
```

### 2. Point DNS (optional but recommended)
```
A  yourdomain.com        → <your EC2 IP>
A  *.yourdomain.com      → <your EC2 IP>  ← wildcard for user projects
```
Or use `nip.io` for zero-config: `app.1.2.3.4.nip.io` → just use the IP.

### 3. One-command install
```bash
# SSH into your instance
ssh ubuntu@<your-ip>

# Clone Zyphron
git clone https://github.com/yourorg/zyphron
cd zyphron

# Set your values (or edit values.aws.yaml)
export DOMAIN="yourdomain.com"           # or your EC2 IP
export EMAIL="you@email.com"             # for Let's Encrypt
export RESEND_API_KEY="re_..."           # from resend.com (free)
export GROQ_API_KEYS="gsk_..."           # from groq.com (free)

# Install everything
bash scripts/setup-k3s.sh
```

**That's it.** The script installs K3s, Helm, adds all chart repos, and deploys the full platform.

### 4. Install the CLI
```bash
npm install -g zyphron-cli
# Or from source:
cd cli && npm install && npm run build && npm link

zy login --api https://api.yourdomain.com
zy deploy https://github.com/n8n-io/n8n --name n8n
zy deploy https://github.com/your/ai-interview-app --name ai-interviewer
zy status
zy logs ai-interviewer
```

---

## Project Capacity Planning

### How 25 projects fit on 16–24 GB

```
Platform overhead:
  API          256 MB
  Worker ×2    1024 MB
  Frontend     128 MB
  PostgreSQL   512 MB
  Redis        256 MB
  Kafka        1024 MB  (or disable = save 1 GB)
  Prometheus   512 MB
  Grafana      256 MB
  Loki         256 MB
  Traefik      128 MB
  ─────────────────────
  Total        ~4.3 GB

Per-project (default limits):
  Memory limit: 512 Mi per deployment
  CPU limit:    500m (half a core)

25 projects × 512 MB = 12.5 GB

Grand total: ~16.8 GB  →  fits t3.xlarge (16 GB) tightly
                        →  fits Oracle ARM (24 GB) comfortably
```

**Heavy projects** (n8n, AI interviewer) need more:
```bash
# Increase limits when deploying heavy projects
zy deploy https://github.com/n8n-io/n8n \
  --memory 1Gi \
  --cpu 1000m
```

### Shared Infrastructure for User Projects

When you deploy a project, Zyphron **automatically injects** shared infrastructure:

| If project needs | Env var injected | Points to |
|---|---|---|
| Kafka (auto-detected) | `KAFKA_BROKERS` | `kafka.zyphron-system:9092` |
| Redis/Celery | `REDIS_URL`, `CELERY_BROKER_URL` | `redis.zyphron-system:6379/N` (per-project DB) |
| PostgreSQL | `DATABASE_URL` | Dedicated database on shared Postgres |
| WebSockets | Traefik middleware | Automatically enabled |

Projects like n8n just work — they find their Postgres/Redis via standard env vars.

---

## Supported Project Types

Any of these deploy with zero configuration:

| Language | Frameworks | Auto-detected from |
|---|---|---|
| TypeScript/JS | **Next.js, Nuxt, Remix, SvelteKit** | `package.json` |
| TypeScript/JS | **React, Vue, Angular, Svelte, Astro** | `package.json` |
| Node.js | **Express, Fastify, NestJS, Hono, Koa** | `package.json` |
| Python | **FastAPI, Django, Flask** | `requirements.txt` |
| Go | Any `main.go` | `go.mod` |
| Static | HTML/CSS/JS | any `index.html` |
| **Custom** | **Anything with a Dockerfile** | `Dockerfile` |

**n8n specifically**: Has a Dockerfile → Zyphron uses it directly. Injects `DATABASE_URL` (Postgres) and `N8N_ENCRYPTION_KEY`.

---

## URLs After Deployment

```
https://app.yourdomain.com           → Zyphron Dashboard
https://api.yourdomain.com/api/v1    → REST API
https://app.yourdomain.com/grafana   → Grafana (no login!)
wss://api.yourdomain.com/ws/...      → WebSocket logs

# User projects (auto-routed by Traefik):
https://n8n.yourdomain.com           → n8n
https://ai-interviewer.yourdomain.com → your AI app
https://myapp.yourdomain.com         → any deployed project
```

---

## Cost Summary

### Oracle ARM (recommended for demo)
| Resource | Cost |
|---|---|
| VM.Standard.A1.Flex (4 OCPU, 24 GB) | **$0.00/month** |
| 200 GB block storage | **$0.00/month** |
| Resend (3K emails/mo) | **$0.00/month** |
| Groq AI (6K tokens/min) | **$0.00/month** |
| Let's Encrypt TLS | **$0.00/month** |
| **Total** | **$0.00/month** |

### AWS with Credits (demo week)
| Resource | Cost |
|---|---|
| t3.xlarge Spot | ~$0.05/hr × 168 hr = **$8.40/week** |
| 30 GB EBS | ~$2.40/month → **$0.55/week** |
| Route 53 (optional) | $0.50/mo → **$0.12/week** |
| Resend, Groq, TLS | **$0.00** |
| **Total 1-week demo** | **~$9/week** |

---

## Stress Testing

Built into the CLI and dashboard. Runs k6 in a Docker container:

```bash
zy stress n8n --vus 50 --duration 60
# Runs 50 virtual users for 60s against https://n8n.yourdomain.com
# Returns: p50/p95/p99 latency, error rate, req/s
```

Results auto-appear in Grafana → "Stress Tests" dashboard.

---

## Monitoring (no login required)

Open `https://app.yourdomain.com/grafana` — you get 4 pre-built dashboards:
1. **SRE Overview** — request rate, latency, error rate, CPU/RAM/disk
2. **Deployments** — build frequency, success rate, build time
3. **Stress Tests** — k6 results history
4. **Node Metrics** — per-node resource usage

---

## Audit Logs

Every action is logged: user.login, project.create, deployment.trigger, env.update, etc.

Available at `https://app.yourdomain.com/audit` — searchable, filterable, CSV export.

---

## Removing Multi-Cloud

Multi-cloud routes are disabled. The `/api/v1/cloud/*` endpoints return `501 Not Implemented`.
This saves ~100 MB RAM and removes the credential management complexity.
