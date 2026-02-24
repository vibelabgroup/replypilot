# Troubleshooting 502 on https://replypilot.dk

A **502 Bad Gateway** means the reverse proxy (Traefik) is receiving the request but cannot get a valid response from the backend (`api` service on port 3000). Run these checks on the server where Docker is running (e.g. `vibelab`).

## 1. Check that API containers are running and healthy

```bash
cd /docker/replypilot   # or your project path
docker compose ps
```

- `api` (or `api-1`, `api-2` if using replicas) should be **Up** and **healthy**.
- If status is `Restarting` or `Exit`, check logs:

```bash
docker compose logs api --tail 100
```

Look for:
- **Database/Redis connection errors** – postgres/redis must be up and reachable.
- **"Stripe server running on port 3000"** – confirms the app started and is listening.

## 2. Check Traefik can reach the API

Ensure the external network exists and the API is attached:

```bash
docker network inspect traefik-proxy --format '{{json .Containers}}' | python3 -m json.tool
```

You should see the `api` container(s) listed. If the network is missing:

```bash
docker network create traefik-proxy
```

Then restart the stack so the API reconnects to the network:

```bash
docker compose up -d
```

## 3. Test the API from inside the stack

```bash
# From a container on the same network (e.g. api)
docker compose exec api wget -qO- http://127.0.0.1:3000/health
```

Expected: `{"status":"ok"}`. If this fails, the API is not responding on 3000 (e.g. still starting, crashed, or wrong PORT).

## 4. Check Traefik logs

```bash
docker logs traefik --since=10m 2>&1 | grep -E "replypilot|502|error"
```

Traefik may log connection refused or timeouts to the backend; that confirms the proxy cannot reach the API.

## 5. Frontend build and volume

The `api` service serves the frontend from the `frontend_dist` volume, populated by `frontend-build`. If `frontend-build` failed or did not run, the API still starts and `/health` works, but the SPA might be missing. Ensure the build completed:

```bash
docker compose logs frontend-build
```

Then restart API so it picks up the volume:

```bash
docker compose up -d api
```

## 6. Optional: Redis “overcommit” warning

The Redis message about `vm.overcommit_memory` does **not** cause 502. To silence it and avoid possible background-save issues, on the **host** (not inside a container) run:

```bash
sudo sysctl vm.overcommit_memory=1
```

To make it persistent, add to `/etc/sysctl.conf`:

```
vm.overcommit_memory = 1
```

Then run `sudo sysctl -p` or reboot.

---

**Summary:** Most 502s are due to (1) API container not running or unhealthy, (2) API not on the `traefik-proxy` network, or (3) API still starting or crashing after DB/Redis connect. Use the checks above to see which applies, then fix the underlying cause (e.g. start dependencies, fix env vars, or restart the stack).
