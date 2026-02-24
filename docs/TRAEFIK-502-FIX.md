# Fix 502 when Traefik has no networks (all sites down)

If Traefik is running but **not on any Docker network**, it cannot reach your backends → 502 for all sites. Connecting it to `traefik-proxy` can fail with **"address already in use"** if another container (e.g. nginx-proxy-manager) is bound to port 80/443.

## Steps on the VPS

### 1. See what is using port 80 and 443

```bash
ss -tlnp | grep -E ':80 |:443 '
# or
docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E '80|443'
```

### 2. Stop the container that holds 80/443

If **nginx-proxy-manager** (or similar) is using 80/443, stop it so Traefik can bind:

```bash
# Find container with port 80 published
docker ps -q --filter "publish=80"
# Stop it (replace with the container name if you prefer)
docker stop $(docker ps -q --filter "publish=80")
```

If you use Nginx Proxy Manager for other sites, you can start it again later on **different ports** (e.g. 8080/8443) and put Traefik in front, or run only Traefik on 80/443.

### 3. Connect Traefik to traefik-proxy

```bash
docker network create traefik-proxy 2>/dev/null || true
docker network connect traefik-proxy traefik
```

### 4. Restart Traefik

```bash
docker restart traefik
```

### 5. Confirm Traefik is on the network

```bash
docker network inspect traefik-proxy --format '{{range .Containers}}{{.Name}} {{end}}'
```

You should see `traefik` and your backends (e.g. `replypilot-api-1`, `replypilot-api-2`, …).

### 6. Test

```bash
curl -sI https://replypilot.dk
```

You should get `HTTP/2 200` (or 301/302) and no SSL hostname errors.

---

**Optional:** Run the script from the repo (after pulling):

```bash
cd /docker/replypilot   # or your repo path
git pull
bash scripts/traefik-attach-networks.sh
```

If the script fails with "address already in use", do steps 1–2 above first to free port 80/443, then run the script again (or steps 3–4).
