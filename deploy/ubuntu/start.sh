#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR/deploy/ubuntu"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created deploy/ubuntu/.env — edit secrets before going live."
fi

mkdir -p secrets
docker compose up -d --build

echo
echo "BlackBox server is starting."
echo "1. Put TLS domain in BLACKBOX_DOMAIN"
echo "2. Set BLACKBOX_API_TOKEN in .env"
echo "3. Open https://\$BLACKBOX_DOMAIN"
echo "4. Give users BlackBox-Setup.exe + the same token"
echo
docker compose ps
