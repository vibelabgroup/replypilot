#!/usr/bin/env bash

set -euo pipefail

#
# Automated deployment of Replypilot to a Hostinger-style VPS
# behind Traefik, using this repository.
#
# Requirements on your local machine:
# - bash
# - ssh & scp
#
# Usage (from this repo root on your local machine):
#   ./deploy-hostinger-traefik.sh root@YOUR_VPS replypilot.dk
#

if [ "${1-}" = "" ] || [ "${2-}" = "" ]; then
  echo "Usage: $0 <ssh-target> <domain>"
  echo "Example: $0 root@92.112.180.117 replypilot.dk"
  exit 1
fi

SSH_TARGET="$1"
DOMAIN="$2"
APP_DIR="/root/replypilot"

echo ">>> Deploying Replypilot to ${SSH_TARGET} for domain ${DOMAIN}"

echo ">>> Creating app directory on VPS..."
ssh "$SSH_TARGET" "mkdir -p ${APP_DIR}"

echo ">>> Syncing repository to VPS (rsync over SSH)..."
rsync -az --delete ./ "$SSH_TARGET:${APP_DIR}/"

echo ">>> Ensuring .env exists on VPS..."
ssh "$SSH_TARGET" "cd ${APP_DIR} && if [ ! -f .env ]; then cp .env.example .env; fi"

cat <<EOF

==========================================================
  IMPORTANT: Edit environment variables on the VPS
==========================================================
SSH into your VPS and review ${APP_DIR}/.env :

  - FRONTEND_URL=https://${DOMAIN}
  - VITE_API_BASE_URL=https://${DOMAIN}
  - POSTGRES_PASSWORD=...
  - REDIS_PASSWORD=...
  - SESSION_SECRET=...
  - STRIPE_SECRET_KEY=...
  - STRIPE_WEBHOOK_SECRET=...
  - STRIPE_PRICE_ID=...
  - TWILIO_ACCOUNT_SID=...
  - TWILIO_AUTH_TOKEN=...
  - GEMINI_API_KEY=...
  - SENDGRID_API_KEY=...

Then run on the VPS:

  cd ${APP_DIR}
  docker compose up -d

Traefik must already be running with:
  - external Docker network: traefik-proxy
  - entrypoint: websecure
  - certresolver: letsencrypt

After containers are up, verify:

  docker logs traefik --since=5m 2>&1 | tail -n 80

and open: https://${DOMAIN}

==========================================================
EOF

echo ">>> Initial sync complete. Follow the instructions above to finish setup."

