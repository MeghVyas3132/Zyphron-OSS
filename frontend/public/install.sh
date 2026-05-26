#!/usr/bin/env sh
# ============================================================
# Zyphron CLI — Universal installer
# Usage: curl -fsSL https://zyphron.space/install.sh | sh
# ============================================================
set -e

BASE_URL="https://zyphron.space/releases"
INSTALL_DIR="/usr/local/bin"
BIN_NAME="zyphron"

BOLD='\033[1m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
DIM='\033[2m'
RESET='\033[0m'

echo ""
echo "${PURPLE}${BOLD}  ╔════════════════════════════════════╗${RESET}"
echo "${PURPLE}${BOLD}  ║        Zyphron CLI Installer        ║${RESET}"
echo "${PURPLE}${BOLD}  ╚════════════════════════════════════╝${RESET}"
echo ""

# ── Detect OS ───────────────────────────────────────────────
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) ARCH="unknown" ;;
esac

case "$OS" in
  linux)  PLATFORM="linux-${ARCH}" ;;
  darwin) PLATFORM="macos-${ARCH}" ;;
  *)      PLATFORM="unknown" ;;
esac

echo "${CYAN}  Detected:${RESET} ${OS} / ${ARCH}"

# ── Check if we can download ─────────────────────────────────
if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
  echo "${RED}  curl or wget is required${RESET}"
  exit 1
fi

_download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  else
    wget -q "$1" -O "$2"
  fi
}

# ── Try native binary ────────────────────────────────────────
if [ "$PLATFORM" != "unknown" ]; then
  BINARY_URL="${BASE_URL}/zyphron-${PLATFORM}"
  TMP_BIN="/tmp/zyphron-download"

  echo "${CYAN}  Downloading${RESET} zyphron-${PLATFORM} ..."

  if _download "$BINARY_URL" "$TMP_BIN" 2>/dev/null && [ -s "$TMP_BIN" ]; then
    chmod +x "$TMP_BIN"

    # macOS requires codesign (ad-hoc signature)
    if [ "$OS" = "darwin" ] && command -v codesign >/dev/null 2>&1; then
      codesign --sign - "$TMP_BIN" 2>/dev/null || true
    fi

    # Install (try system dir, fall back to ~/.local/bin)
    if [ -w "$INSTALL_DIR" ]; then
      mv "$TMP_BIN" "${INSTALL_DIR}/${BIN_NAME}"
    elif [ "$(id -u)" = "0" ]; then
      mv "$TMP_BIN" "${INSTALL_DIR}/${BIN_NAME}"
    else
      mkdir -p "$HOME/.local/bin"
      mv "$TMP_BIN" "$HOME/.local/bin/${BIN_NAME}"
      INSTALL_DIR="$HOME/.local/bin"
      # Hint about PATH
      case ":$PATH:" in
        *":$HOME/.local/bin:"*) ;;
        *) echo "${YELLOW}  Add ~/.local/bin to PATH: export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}" ;;
      esac
    fi

    echo ""
    echo "${GREEN}  Zyphron CLI installed at ${INSTALL_DIR}/${BIN_NAME}${RESET}"
    echo ""
    _print_help
    exit 0
  else
    echo "${YELLOW}  Binary not available for ${PLATFORM} — falling back to npm${RESET}"
    rm -f "$TMP_BIN"
  fi
fi

# ── npm fallback ─────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "${RED}  Node.js is required for this platform.${RESET}"
  echo "${DIM}  Install it from https://nodejs.org (v18+)${RESET}"
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_VER" -lt 18 ] 2>/dev/null; then
  echo "${RED}  Node.js v18+ required (found v${NODE_VER}).${RESET}"
  exit 1
fi

echo "${CYAN}  Installing via npm...${RESET}"
npm install -g https://zyphron.space/zyphron-cli.tgz --loglevel=error

_print_help() {
  echo "${DIM}  Quick start:${RESET}"
  echo "${PURPLE}    zyphron login${RESET}                     ${DIM}# Authenticate${RESET}"
  echo "${PURPLE}    zyphron deploy <github-url>${RESET}       ${DIM}# Deploy any repo${RESET}"
  echo "${PURPLE}    zyphron deploy . --env .env${RESET}       ${DIM}# Deploy with .env file${RESET}"
  echo "${PURPLE}    zyphron status${RESET}                    ${DIM}# View deployments${RESET}"
  echo "${PURPLE}    zyphron logs [id]${RESET}                 ${DIM}# Tail logs${RESET}"
  echo ""
  echo "${DIM}  Docs: ${CYAN}https://zyphron.space${RESET}"
  echo ""
}

echo ""
echo "${GREEN}  Zyphron CLI installed successfully${RESET}"
echo ""
_print_help
