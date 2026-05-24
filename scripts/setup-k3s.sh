#!/usr/bin/env bash
# =============================================================
# Zyphron — One-command K3s + Helm setup
# Tested on: Ubuntu 22.04 / Amazon Linux 2023 / Oracle ARM Linux
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/.../setup-k3s.sh | bash
#   Or locally: bash scripts/setup-k3s.sh
#
# Options (env vars):
#   DOMAIN=yourdomain.com   (default: uses EC2 public IP)
#   EMAIL=you@email.com     (for Let's Encrypt TLS — leave empty for self-signed)
#   RESEND_API_KEY=re_...   (free at resend.com — 3000 emails/month)
#   GROQ_API_KEYS=gsk_...   (free at groq.com — 6000 tokens/min)
#   SKIP_K3S=1              (if K3s already installed)
#   REGISTRY=ecr|local      (default: local)
# =============================================================
set -euo pipefail

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${BLUE}[zyphron]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ─── Detect architecture ──────────────────────────────────────
ARCH=$(uname -m)
[[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]] && ARCH_LABEL="arm64" || ARCH_LABEL="amd64"
log "Architecture: $ARCH_LABEL"

# ─── Detect public IP / domain ────────────────────────────────
if [[ -z "${DOMAIN:-}" ]]; then
  PUBLIC_IP=$(curl -s --max-time 5 https://checkip.amazonaws.com || curl -s --max-time 5 http://169.254.169.254/latest/meta-data/public-ipv4 || echo "localhost")
  DOMAIN="${PUBLIC_IP}"
  warn "No DOMAIN set — using IP: $DOMAIN (TLS will be self-signed)"
fi

JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
RESEND_KEY="${RESEND_API_KEY:-}"
GROQ_KEYS="${GROQ_API_KEYS:-}"

log "Domain: $DOMAIN"
log "JWT secret: ${JWT_SECRET:0:8}…"

# ─── Step 1: Prerequisites ────────────────────────────────────
log "Installing prerequisites…"
if command -v apt-get &>/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl git docker.io jq openssl
elif command -v yum &>/dev/null; then
  sudo yum install -y curl git docker jq openssl
fi

# ─── Step 2: K3s ──────────────────────────────────────────────
if [[ -z "${SKIP_K3S:-}" ]]; then
  log "Installing K3s (lightweight Kubernetes)…"
  curl -sfL https://get.k3s.io | \
    INSTALL_K3S_EXEC="server \
      --disable=traefik \
      --docker \
      --write-kubeconfig-mode=644 \
      --node-taint CriticalAddonsOnly=true:NoExecute" \
    sh -
  ok "K3s installed"
else
  log "Skipping K3s (SKIP_K3S=1)"
fi

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
sleep 10  # wait for K3s to be ready

# ─── Step 3: Helm ─────────────────────────────────────────────
if ! command -v helm &>/dev/null; then
  log "Installing Helm…"
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  ok "Helm installed"
fi

# ─── Step 4: Add Helm repos ───────────────────────────────────
log "Adding Helm repositories…"
helm repo add bitnami         https://charts.bitnami.com/bitnami
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana         https://grafana.github.io/helm-charts
helm repo add traefik         https://traefik.github.io/charts
helm repo update
ok "Helm repos ready"

# ─── Step 5: Install Zyphron ──────────────────────────────────
NAMESPACE="zyphron-system"
RELEASE="zyphron"
CHART_DIR="$(cd "$(dirname "$0")/.." && pwd)/helm/zyphron"

log "Installing Zyphron via Helm…"
helm upgrade --install "$RELEASE" "$CHART_DIR" \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --values "$CHART_DIR/values.aws.yaml" \
  --set global.domain="$DOMAIN" \
  --set-string api.secrets.JWT_SECRET="$JWT_SECRET" \
  --set-string api.secrets.RESEND_API_KEY="$RESEND_KEY" \
  --set-string api.secrets.GROQ_API_KEYS="$GROQ_KEYS" \
  --set traefik.additionalArguments[0]="--certificatesresolvers.letsencrypt.acme.email=${EMAIL:-admin@$DOMAIN}" \
  --timeout 10m \
  --wait

ok "Zyphron installed"

# ─── Step 6: Print access info ────────────────────────────────
TRAEFIK_IP=$(kubectl get svc -n "$NAMESPACE" "$RELEASE-traefik" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "$DOMAIN")

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Zyphron is deployed! 🚀                      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}Dashboard:${NC}    http://${TRAEFIK_IP}  (or https://app.${DOMAIN})"
echo -e "  ${BLUE}API:${NC}          http://${TRAEFIK_IP}/api/v1"
echo -e "  ${BLUE}Grafana:${NC}      http://${TRAEFIK_IP}/grafana  (no login required)"
echo -e "  ${BLUE}K8s dashboard:${NC} kubectl proxy & open localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/"
echo ""
echo -e "  ${YELLOW}CLI install:${NC}"
echo -e "    npm install -g zyphron-cli"
echo -e "    zy login --api http://${TRAEFIK_IP}/api/v1"
echo ""
echo -e "  ${YELLOW}JWT Secret (save this!):${NC} ${JWT_SECRET}"
echo ""
