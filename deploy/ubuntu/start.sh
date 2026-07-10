#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR/deploy/ubuntu"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created deploy/ubuntu/.env — edit secrets before going live."
fi

mkdir -p secrets

if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
  else
    echo "Docker Compose is not available. Install Docker Engine with Compose first." >&2
    exit 1
  fi
else
  echo "Docker is not installed. Install Docker Engine first." >&2
  exit 1
fi

if command -v ufw >/dev/null 2>&1; then
  if ufw status 2>/dev/null | grep -q 'Status: active'; then
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    echo "Opened UFW ports 80/tcp and 443/tcp."
  else
    echo "UFW is not active; skipping firewall update."
  fi
fi

"${COMPOSE_CMD[@]}" up -d --build

echo
echo "BlackBox server is starting."
echo "1. Put your public domain in BLACKBOX_DOMAIN"
echo "2. Set BLACKBOX_API_TOKEN in .env"
echo "3. Open https://\$BLACKBOX_DOMAIN"
echo "4. Give users BlackBox-Setup.exe + the same token"
echo "5. If the site still does not respond, allow 80/443 on your VPS/cloud firewall too"
echo
"${COMPOSE_CMD[@]}" ps
