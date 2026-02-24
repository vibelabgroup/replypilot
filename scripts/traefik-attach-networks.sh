#!/usr/bin/env bash
# Run this on the VPS when Traefik shows 502 for all sites.
# Traefik must be on the same Docker networks as your backends (e.g. traefik-proxy).
# If port 80/443 are in use by another container (e.g. nginx-proxy-manager), free them first.

set -e

TRAEFIK_CONTAINER="${TRAEFIK_CONTAINER:-traefik}"
NETWORK="${1:-traefik-proxy}"

echo "=== Checking what is using port 80 and 443 ==="
if command -v ss &>/dev/null; then
  ss -tlnp | grep -E ':80\s|:443\s' || true
elif command -v netstat &>/dev/null; then
  netstat -tlnp | grep -E ':80\s|:443\s' || true
fi
echo ""

echo "=== If another container (e.g. nginx-proxy-manager) is on 80/443, stop it so Traefik can bind ==="
echo "  Example: docker stop \$(docker ps -q --filter 'publish=80')"
echo ""

echo "=== Ensuring network $NETWORK exists ==="
docker network create "$NETWORK" 2>/dev/null || true

echo "=== Connecting $TRAEFIK_CONTAINER to $NETWORK ==="
if docker network inspect "$NETWORK" --format '{{range .Containers}}{{.Name}} {{end}}' | grep -q "$TRAEFIK_CONTAINER"; then
  echo "  (already connected)"
else
  docker network connect "$NETWORK" "$TRAEFIK_CONTAINER" || {
    echo "  FAILED. If error is 'address already in use', stop the container using port 80/443 first, then run:"
    echo "  docker network connect $NETWORK $TRAEFIK_CONTAINER"
    exit 1
  }
fi

echo "=== Restarting Traefik so it picks up the network ==="
docker restart "$TRAEFIK_CONTAINER"

echo ""
echo "Done. Try: curl -sI https://replypilot.dk"
echo "To attach Traefik to more networks (e.g. n8n, other projects):"
echo "  docker network connect <network-name> $TRAEFIK_CONTAINER"
echo "  docker restart $TRAEFIK_CONTAINER"
