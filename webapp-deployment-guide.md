# Webapp Deployment Guide

Complete guide for deploying new web applications on Hostinger KVM2 Ubuntu VPS with Docker and Traefik, without affecting existing services.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Pre-Deployment Checklist](#pre-deployment-checklist)
4. [Step-by-Step Deployment](#step-by-step-deployment)
5. [Multi-Webapp Setup](#multi-webapp-setup)
6. [Email Deliverability & Anti-Spam Setup](#email-deliverability--anti-spam-setup)
7. [Troubleshooting](#troubleshooting)
8. [Maintenance Commands](#maintenance-commands)

---

## Prerequisites

### VPS Requirements

- **OS**: Ubuntu 22.04 LTS (or newer)
- **RAM**: Minimum 2GB (4GB+ recommended for multiple apps)
- **Storage**: 20GB+ SSD
- **Docker**: 24.0+ installed
- **Docker Compose**: 2.20+ installed
- **Traefik**: Already running with `traefik-proxy` network

### Verify Existing Setup

Before deploying a new webapp, verify your Traefik setup:

```bash
# Check Traefik is running
docker ps | grep traefik

# Verify traefik-proxy network exists
docker network ls | grep traefik-proxy

# Check network details
docker network inspect traefik-proxy
```

If Traefik is not running:

```bash
# Start Traefik
docker start traefik
docker update --restart=unless-stopped traefik

# Create network if missing
docker network create traefik-proxy
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Internet (HTTPS/443)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Traefik (Reverse Proxy + SSL)                  │
│              - Let's Encrypt certificates                   │
│              - Automatic HTTPS redirection                  │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │  Webapp 1   │    │  Webapp 2   │    │  Webapp 3   │
   │ (Node.js)   │    │   (PHP)     │    │  (Python)   │
   │  Port 3000  │    │  Port 8000  │    │  Port 5000  │
   └─────────────┘    └─────────────┘    └─────────────┘
```

**Key Principles:**

1. **No port conflicts**: Each webapp uses unique internal ports
2. **Isolated networks**: Each webapp has its own Docker network + shared `traefik-proxy`
3. **Shared Traefik**: All webapps route through the same Traefik instance
4. **Independent databases**: Each webapp has its own PostgreSQL/MySQL if needed
5. **No host ports exposed**: Only Traefik exposes 80/443 to the host

---

## Pre-Deployment Checklist

### 1. Choose Webapp Configuration

| Setting | Example | Notes |
|---------|---------|-------|
| Domain | `app.yourdomain.com` | Must be unique |
| Internal Port | `3000` | Check for conflicts |
| Project Folder | `/root/webapp-name` | Descriptive name |
| Database Name | `webapp_db` | Unique per app |

### 2. Check for Port Conflicts

```bash
# List all used ports on the host
sudo netstat -tulpn | grep LISTEN

# Check existing Docker containers and their ports
docker ps --format "table {{.Names}}\t{{.Ports}}"

# Common port assignments in your setup:
# - 3000: replypilot api
# - 3100: replypilot admin-api
# - 3306: MySQL (if used)
# - 5432: PostgreSQL (if exposed)
# - 6379: Redis (if exposed)
# - 80, 443: Traefik
```

Choose a port **not** in this list for your new webapp.

### 3. DNS Configuration (Hostinger)

Before deployment, create DNS records in Hostinger:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `app` | `<your-vps-ip>` | 3600 |
| A | `api` | `<your-vps-ip>` | 3600 |

Replace `app` and `api` with your actual subdomain names.

---

## Step-by-Step Deployment

### Step 1: Create Project Directory

```bash
# Create directory structure
mkdir -p /root/<webapp-name>
cd /root/<webapp-name>

# Example:
mkdir -p /root/my-new-app
cd /root/my-new-app
```

### Step 2: Create Docker Compose Configuration

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  # Database (PostgreSQL example - adjust as needed)
  postgres:
    image: postgres:15-alpine
    container_name: <webapp-name>-postgres
    environment:
      POSTGRES_USER: <webapp-name>
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-changeme}
      POSTGRES_DB: <webapp-name>
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U <webapp-name>"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - <webapp-name>-network
    restart: unless-stopped

  # Cache (Redis - optional)
  redis:
    image: redis:7-alpine
    container_name: <webapp-name>-redis
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-changeme}
    volumes:
      - redis_data:/data
    networks:
      - <webapp-name>-network
    restart: unless-stopped

  # Main Application
  app:
    image: node:22-alpine  # Adjust based on your stack
    container_name: <webapp-name>-app
    working_dir: /app
    environment:
      NODE_ENV: production
      PORT: 3000  # Internal port - adjust if needed
      DATABASE_URL: postgresql://<webapp-name>:${POSTGRES_PASSWORD:-changeme}@postgres:5432/<webapp-name>?sslmode=disable
      REDIS_URL: redis://:${REDIS_PASSWORD:-changeme}@redis:6379/0
      # Add your other env vars here
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - <webapp-name>-network
      - traefik-proxy
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.<webapp-name>.rule=Host(`<your-domain.com>`)"
      - "traefik.http.routers.<webapp-name>.entrypoints=websecure"
      - "traefik.http.routers.<webapp-name>.tls.certresolver=letsencrypt"
      - "traefik.http.services.<webapp-name>.loadbalancer.server.port=3000"
      # Security headers (optional but recommended)
      - "traefik.http.routers.<webapp-name>.middlewares=security-headers"
      - "traefik.http.middlewares.security-headers.headers.customFrameOptionsValue=SAMEORIGIN"
      - "traefik.http.middlewares.security-headers.headers.contentTypeNosniff=true"
      - "traefik.http.middlewares.security-headers.headers.browserXssFilter=true"

volumes:
  postgres_data:
  redis_data:

networks:
  <webapp-name>-network:
    driver: bridge
  traefik-proxy:
    external: true
```

**Replace placeholders:**
- `<webapp-name>`: Your app name (e.g., `myapp`)
- `<your-domain.com>`: Your domain (e.g., `app.example.com`)
- `3000`: Your chosen internal port
- Adjust image and environment variables for your stack (Node.js, Python, PHP, etc.)

### Step 3: Create Environment File

Create `.env`:

```bash
# Database
POSTGRES_PASSWORD=your_secure_password_here

# Redis (if used)
REDIS_PASSWORD=your_redis_password_here

# Application
NODE_ENV=production

# Add other app-specific variables
# API_KEY=...
# SECRET_KEY=...
```

Set secure passwords:

```bash
# Generate secure password
openssl rand -base64 32
```

### Step 4: Deploy

```bash
# Start the application
docker compose up -d

# Verify containers are running
docker compose ps

# Check logs
docker compose logs -f
```

### Step 5: Verify Network Attachment

```bash
# Verify container is attached to traefik-proxy
docker network inspect traefik-proxy --format '{{json .Containers}}' | python3 -m json.tool | grep <webapp-name>
```

You should see your `<webapp-name>-app` container listed.

### Step 6: Test Health Endpoint

```bash
# From inside the container
docker exec -it <webapp-name>-app wget -qO- http://127.0.0.1:3000/health

# Or check Traefik logs
docker logs traefik --since=5m 2>&1 | tail -n 50
```

### Step 7: Verify HTTPS

Open browser: `https://<your-domain.com>`

Check Traefik logs for certificate issues:

```bash
docker logs traefik --since=10m 2>&1 | grep -i "certificate\|acme\|letsencrypt"
```

---

## Multi-Webapp Setup

### Isolation Best Practices

Each webapp should be **completely isolated**:

1. **Separate project directories**:
   ```
   /root/
   ├── replypilot/
   ├── my-new-app/
   ├── another-app/
   └── ...
   ```

2. **Separate Docker networks**:
   - Each webapp has its own internal network
   - All share only `traefik-proxy` for routing

3. **Separate databases**:
   - Each webapp has its own PostgreSQL/MySQL container
   - Or use separate databases within a shared instance

4. **Unique container names**:
   - Use prefix: `<webapp-name>-postgres`, `<webapp-name>-app`

5. **Unique internal ports**:
   - Webapp 1: `3000`
   - Webapp 2: `3001`
   - Webapp 3: `3002`
   - etc.

### Example: Multiple Webapps

```yaml
# /root/webapp1/docker-compose.yml
services:
  app:
    labels:
      - "traefik.http.services.webapp1.loadbalancer.server.port=3000"
```

```yaml
# /root/webapp2/docker-compose.yml
services:
  app:
    labels:
      - "traefik.http.services.webapp2.loadbalancer.server.port=3001"
```

---

## Email Deliverability & Anti-Spam Setup

To ensure emails reach inboxes (not spam folders), configure these DNS records and follow best practices.

### 1. Choose Email Provider

**Option A: Hostinger SMTP (Recommended for Hostinger VPS)**
- Uses your domain directly (professional appearance)
- No third-party dependency
- Included with Hostinger hosting
- **Requires proper DNS setup** (SPF, DKIM, DMARC)

```bash
# .env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your_mailbox_password
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_FROM_NAME=Your App Name
```

**Setup Steps:**
1. Create email mailbox in Hostinger panel (e.g., `noreply@yourdomain.com`)
2. Note the SMTP password
3. Configure DNS records below (SPF, DKIM, DMARC)
4. Test sending

**Option B: SendGrid (Alternative)**
- Better deliverability out-of-the-box
- Built-in DKIM/SPF handling
- Free tier: 100 emails/day
- Good if DNS setup is problematic

```bash
# .env
SENDGRID_API_KEY=SG.your_api_key_here
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_FROM_NAME=Your App Name
```

### 2. Required DNS Records (Hostinger)

Add these in Hostinger DNS Zone Editor:

#### A. SPF Record (Sender Policy Framework)

Authorizes Hostinger servers to send email for your domain.

| Type | Name | Value |
|------|------|-------|
| TXT | @ | `v=spf1 include:_spf.hostinger.com ~all` |

**Note:** If you also use SendGrid, combine them:
```
v=spf1 include:_spf.hostinger.com include:sendgrid.net ~all
```

#### B. DKIM Record (DomainKeys Identified Mail)

**For Hostinger SMTP:**

DKIM is typically handled automatically by Hostinger, but you should verify:

1. Go to Hostinger Panel → Email → Domain Authentication
2. Check if DKIM is enabled
3. If not enabled, contact Hostinger support to enable DKIM for your domain
4. They will provide TXT records to add to your DNS if needed

**Common Hostinger DKIM record (if required):**

| Type | Name | Value |
|------|------|-------|
| TXT | default._domainkey | `v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...` |

**For SendGrid (if using as backup):**
1. Go to SendGrid Dashboard → Settings → Sender Authentication
2. Authenticate your domain
3. Copy the provided TXT records into Hostinger DNS

#### C. DMARC Record (Domain-based Message Authentication)

| Type | Name | Value |
|------|------|-------|
| TXT | _dmarc | `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; pct=100; adkim=r; aspf=r` |

**DMARC Policy Options:**
- `p=none` - Monitor only (use during setup)
- `p=quarantine` - Send to spam if authentication fails (recommended)
- `p=reject` - Reject emails that fail authentication (strict)

**Example DMARC with monitoring:**
```
v=DMARC1; p=quarantine; rua=mailto:admin@yourdomain.com; ruf=mailto:admin@yourdomain.com; fo=1
```

#### D. MX Record (if using Hostinger email)

| Type | Name | Value | Priority |
|------|------|-------|----------|
| MX | @ | mx1.hostinger.com | 10 |
| MX | @ | mx2.hostinger.com | 20 |

### 3. Email Best Practices

#### Content Guidelines

1. **Subject Lines**
   - Avoid: `FREE!!!`, `URGENT`, `Act Now`, excessive punctuation
   - Use: Clear, concise, relevant subjects
   - Max 60 characters

2. **Email Body**
   - Balance text-to-image ratio (more text is better)
   - Avoid all-caps words
   - Don't use excessive colors or fonts
   - Include unsubscribe link (required by law)
   - Add physical address (CAN-SPAM compliance)

3. **Sender Reputation**
   - Use consistent "From" name and email
   - Warm up new IP addresses gradually
   - Monitor bounce rates (keep <5%)
   - Monitor complaint rates (keep <0.1%)

### 4. Testing Email Deliverability

#### Online Tools

```bash
# 1. Mail-Tester.com
# Send email to: test-xxx@mail-tester.com
# Check score at: https://www.mail-tester.com/
# Aim for: 9/10 or higher

# 2. Check DNS records
# https://mxtoolbox.com/spf.aspx
# https://mxtoolbox.com/dkim.aspx
# https://mxtoolbox.com/dmarc.aspx

# 3. Check if domain is blacklisted
# https://mxtoolbox.com/blacklists.aspx
```

#### Verify Setup

```bash
# Check SPF
dig TXT yourdomain.com | grep spf

# Check DKIM (replace selector with yours, e.g., s1, default, etc.)
dig TXT selector._domainkey.yourdomain.com

# Check DMARC
dig TXT _dmarc.yourdomain.com
```

### 5. Email Configuration in Docker

Add to your docker-compose.yml (Hostinger SMTP):

```yaml
services:
  app:
    environment:
      # Hostinger SMTP Configuration
      SMTP_HOST: smtp.hostinger.com
      SMTP_PORT: 587
      SMTP_SECURE: "false"  # STARTTLS on port 587
      SMTP_USER: noreply@yourdomain.com
      SMTP_PASS: ${SMTP_PASS}  # From Hostinger email mailbox
      
      # From Address (must match authenticated domain)
      SMTP_FROM_EMAIL: noreply@yourdomain.com
      SMTP_FROM_NAME: Your App Name
```

**For SendGrid (alternative):**

```yaml
services:
  app:
    environment:
      SENDGRID_API_KEY: ${SENDGRID_API_KEY}
      SMTP_FROM_EMAIL: noreply@yourdomain.com
      SMTP_FROM_NAME: Your App Name
```

### 6. Common Spam Folder Causes

| Issue | Solution |
|-------|----------|
| Missing SPF | Add SPF TXT record to DNS |
| Missing DKIM | Set up DKIM with your provider |
| Missing DMARC | Add DMARC TXT record |
| Poor sender reputation | Use SendGrid/Mailgun instead of VPS IP |
| IP blacklisted | Check mxtoolbox.com, request delisting |
| No unsubscribe link | Add unsubscribe to all marketing emails |
| Spam trigger words | Rewrite content, avoid promotional language |
| Image-only emails | Add more text content |

### 7. Monitoring & Alerts

Set up monitoring for:

```javascript
// Track these metrics
- Bounce rate: < 5%
- Complaint rate: < 0.1%
- Delivery rate: > 95%
- Open rate: varies by industry (20-40% typical)
```

SendGrid Dashboard provides these metrics automatically.

---

## Troubleshooting

### 502 Bad Gateway

**Symptoms**: Browser shows "502 Bad Gateway" from Traefik

**Diagnosis**:

```bash
# 1. Check if container is running
docker ps | grep <webapp-name>

# 2. Check container logs
docker compose logs app --tail 100

# 3. Verify network attachment
docker network inspect traefik-proxy | grep <webapp-name>

# 4. Test health inside container
docker exec <webapp-name>-app wget -qO- http://127.0.0.1:3000/health
```

**Solutions**:

| Issue | Solution |
|-------|----------|
| Container not running | `docker compose up -d` |
| App crashed | Check logs, fix error, restart |
| Wrong port in labels | Update `loadbalancer.server.port` in docker-compose.yml |
| Not attached to traefik-proxy | `docker network connect traefik-proxy <container-name>` |
| App listening on 127.0.0.1 only | Change app to listen on `0.0.0.0` |

### Container Not Routing Through Traefik

```bash
# Check Traefik recognizes the router
docker logs traefik --since=5m 2>&1 | grep <webapp-name>

# Verify labels are correct
docker inspect <webapp-name>-app | grep -A 20 Labels
```

### Port Conflicts

```bash
# Find what's using a port
sudo netstat -tulpn | grep :3000

# Solution: Change internal port in docker-compose.yml
# services:
#   app:
#     labels:
#       - "traefik.http.services.<name>.loadbalancer.server.port=3001"
```

### SSL Certificate Issues

```bash
# Check ACME/Let's Encrypt logs
docker logs traefik --since=10m 2>&1 | grep -i "acme\|certificate\|challenge"

# Common issues:
# - DNS not pointing to VPS
# - Port 80 blocked
# - Rate limiting from Let's Encrypt (wait 1 hour)
```

### Database Connection Issues

```bash
# Test database connectivity from app container
docker exec <webapp-name>-app nc -zv postgres 5432

# Check database logs
docker compose logs postgres --tail 50
```

---

## Maintenance Commands

### Daily Operations

```bash
# View all running containers
docker ps

# View resource usage
docker stats --no-stream

# Check disk usage
docker system df

# View logs for all webapps
docker compose -f /root/webapp1/docker-compose.yml logs -f
docker compose -f /root/webapp2/docker-compose.yml logs -f
```

### Updates and Deployments

```bash
# Pull latest images
docker compose pull

# Restart with new images
docker compose up -d

# Restart specific service
docker compose up -d --force-recreate app

# View rollout status
docker compose ps
```

### Cleanup

```bash
# Remove unused images
docker image prune -f

# Remove unused volumes (be careful!)
docker volume prune -f

# Full cleanup
docker system prune -f
```

### Backup

```bash
# Backup PostgreSQL
docker exec <webapp-name>-postgres pg_dump -U <webapp-name> <webapp-name> > backup.sql

# Backup volumes
docker run --rm -v <webapp-name>_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz -C /data .
```

### Monitoring

```bash
# Check container health
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.State}}"

# Check recent restarts
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -i "restarting\|unhealthy"

# View resource limits
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
```

---

## Quick Reference Template

### Minimal docker-compose.yml for Node.js App

```yaml
version: '3.8'

services:
  app:
    image: node:22-alpine
    container_name: myapp-app
    working_dir: /app
    volumes:
      - .:/app
      - /app/node_modules
    command: npm start
    environment:
      PORT: 3000
      NODE_ENV: production
    networks:
      - traefik-proxy
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(`myapp.example.com`)"
      - "traefik.http.routers.myapp.entrypoints=websecure"
      - "traefik.http.routers.myapp.tls.certresolver=letsencrypt"
      - "traefik.http.services.myapp.loadbalancer.server.port=3000"

networks:
  traefik-proxy:
    external: true
```

### Minimal docker-compose.yml for PHP App

```yaml
version: '3.8'

services:
  app:
    image: php:8.2-apache
    container_name: myapp-app
    volumes:
      - ./src:/var/www/html
    networks:
      - traefik-proxy
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(`myapp.example.com`)"
      - "traefik.http.routers.myapp.entrypoints=websecure"
      - "traefik.http.routers.myapp.tls.certresolver=letsencrypt"
      - "traefik.http.services.myapp.loadbalancer.server.port=80"

networks:
  traefik-proxy:
    external: true
```

### Minimal docker-compose.yml for Python/Flask App

```yaml
version: '3.8'

services:
  app:
    image: python:3.11-slim
    container_name: myapp-app
    working_dir: /app
    volumes:
      - .:/app
    command: flask run --host=0.0.0.0 --port=5000
    environment:
      FLASK_APP: app.py
      FLASK_ENV: production
    networks:
      - traefik-proxy
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(`myapp.example.com`)"
      - "traefik.http.routers.myapp.entrypoints=websecure"
      - "traefik.http.routers.myapp.tls.certresolver=letsencrypt"
      - "traefik.http.services.myapp.loadbalancer.server.port=5000"

networks:
  traefik-proxy:
    external: true
```

---

## Important Safety Rules

1. **Never expose ports on the host** (no `ports:` section in production)
2. **Always use container names** (prevents Docker from creating random names)
3. **Always use `restart: unless-stopped`** (survives reboots)
4. **Always verify DNS before deployment** (prevents Let's Encrypt rate limits)
5. **Always use unique internal ports** (prevents conflicts between webapps)
6. **Always backup before major changes**
7. **Test in browser after each deployment**

---

## Support

For issues specific to your existing setup:
- Check existing webapp configs in `/root/replypilot/`
- Review Traefik logs: `docker logs traefik --since=10m`
- Verify network: `docker network inspect traefik-proxy`

---

*Last updated: April 2026*
*Compatible with: Hostinger KVM2 Ubuntu, Docker 24.0+, Traefik 2.10+*
