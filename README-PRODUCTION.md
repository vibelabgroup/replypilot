# Replypilot Production System

Complete production-ready implementation of Replypilot - an AI-powered receptionist and lead management system for Danish businesses.

## System Overview

Replypilot consists of:
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + PostgreSQL + Redis
- **AI**: Google Gemini API for intelligent responses
- **Payments**: Stripe for subscription management
- **SMS**: Twilio for message routing
- **Email**: SendGrid for notifications

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Nginx (Reverse Proxy)                  │
├─────────────────────────────────────────────────────────────┤
│  Frontend (Static)  │  API (Node.js/Express)  │  Workers     │
│  replypilot.dk      │  replypilot.dk          │  Background  │
└─────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌────────────┐     ┌────────────┐      ┌────────────┐
    │ PostgreSQL │     │    Redis   │      │  Sentry    │
    │  (Data)    │     │  (Cache/   │      │ (Errors)   │
    │            │     │   Queue)   │      │            │
    └────────────┘     └────────────┘      └────────────┘
```

## Production Deployment Checklist

### Phase 1: Infrastructure (✅ Complete)
- [x] Docker and Docker Compose configuration
- [x] Nginx reverse proxy with SSL termination
- [x] PostgreSQL database with backups
- [x] Redis for caching and job queues
- [x] Health check endpoints

### Phase 2: Backend Core (✅ Complete)
- [x] Authentication system (signup/login/logout/password reset)
- [x] Session management with httpOnly cookies
- [x] Rate limiting (per-IP and per-user)
- [x] Request validation with Zod
- [x] Error handling and logging with Pino
- [x] Security headers (Helmet)
- [x] CORS configuration

### Phase 3: Payment Integration (✅ Complete)
- [x] Stripe Checkout Session creation
- [x] Webhook handlers (idempotent)
- [x] Subscription sync with database
- [x] Customer portal integration
- [x] Trial period support

### Phase 4: SMS & AI (✅ Complete)
- [x] Twilio phone number provisioning
- [x] Incoming SMS webhook handler
- [x] AI response generation with Gemini
- [x] Per-tenant prompt customization
- [x] Circuit breaker pattern for AI
- [x] Retry logic for outgoing SMS

### Phase 5: Lead Management (✅ Complete)
- [x] Conversation storage and retrieval
- [x] Lead creation and qualification
- [x] Message history with AI context
- [x] Conversion tracking

### Phase 6: Notifications (✅ Complete)
- [x] Email notifications via SendGrid
- [x] SMS notifications via Twilio
- [x] Notification preferences per user
- [x] Digest emails (daily/weekly)
- [x] Real-time job queue processing

### Phase 7: Frontend (✅ Complete)
- [x] Authentication UI (login/signup/reset)
- [x] Dashboard with real data
- [x] Conversation management
- [x] Lead management with qualification
- [x] Settings forms (company/AI/notifications)
- [x] Responsive design

### Phase 8: Admin (✅ Complete)
- [x] Admin authentication
- [x] Customer management
- [x] Subscription overview
- [x] Revenue analytics

### Phase 9: Testing (✅ Complete)
- [x] Unit tests for validators
- [x] Integration tests for auth API
- [x] Integration tests for Stripe webhooks
- [x] Integration tests for conversations
- [x] CI/CD pipeline with GitHub Actions

### Phase 10: Security & Monitoring (✅ Complete)
- [x] Input sanitization
- [x] XSS protection
- [x] SQL injection prevention (parameterized queries)
- [x] Rate limiting
- [x] Security headers
- [x] Sentry integration
- [x] Structured logging

## Quick Start

### Local Development

```bash
# 1. Clone and install dependencies
git clone <repository-url>
cd replypilot
npm install
cd server && npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# 3. Start infrastructure
docker compose up -d postgres redis

# 4. Run migrations
cd server && npm run db:migrate

# 5. Start development servers
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Frontend
npm run dev

# Terminal 3: Workers
cd server && npm run worker:all
```

### Production Deployment

There are **two ways** to run Replypilot in production:

- **A. Single-domain Node.js app (e.g. Hostinger)** – everything (frontend + API) served from `https://replypilot.dk`.  
- **B. Docker + nginx (multi-domain)** – optional, for when you later move to your own VPS.

#### A. Single-domain Node.js app (Hostinger-style)

Use this when you deploy a Node.js app directly to a platform like Hostinger.

**1. Environment**

Set (for example in the hosting panel):

- `FRONTEND_URL=https://replypilot.dk`
- `VITE_API_BASE_URL=https://replypilot.dk` (frontend will call the same origin)
- All other production vars from `.env.example` (DB, Redis, Stripe, Twilio, etc.)

**2. Start command**

Configure the app to run the Node server from the repo root, for example:

```bash
node server/index.mjs
```

The Express app exposes (among others):

- `POST /create-checkout-session` – Stripe Checkout session
- `POST /webhook` – Stripe webhooks
- `GET /health` – health check

And CORS is locked to `FRONTEND_URL`, so `https://replypilot.dk` is the only allowed origin.

**3. Stripe webhooks**

In the Stripe dashboard, set your webhook URL to:

```text
https://replypilot.dk/webhook
```

#### B. Docker Deployment (optional, advanced)

If you later move to your own VPS and run the full Docker + nginx stack, you can use the `docker-compose.yml` and `nginx/nginx.conf` files in this repo. In that setup you may choose to run a separate API subdomain (e.g. `api.replypilot.dk`) and update `VITE_API_BASE_URL` accordingly.

#### C. Hostinger VPS with Traefik (replypilot)

Use this when running Replypilot as a **Docker service behind Traefik** on your Hostinger VPS (the same setup where `n8n`, `vibelab`, and `vl-affiliate` are running).

**1. Plan the service**

- **Domain**: e.g. `app.replypilot.dk`
- **Internal port**: `3000` (what the Node app listens on inside the container)
- **Project folder**: e.g. `/root/replypilot`

The app **must** listen on `0.0.0.0:3000` inside the container.

**2. Create project directory on the VPS**

```bash
mkdir -p /root/replypilot
cd /root/replypilot

# Option A: copy an existing build from local
# scp -r ./dist ./server ./nginx root@<your-vps-ip>:/root/replypilot/

# Option B: clone the repo on the VPS
# git clone <repository-url> .
```

**3. `docker-compose.yml` for replypilot behind Traefik**

In `/root/replypilot/docker-compose.yml`:

```yaml
services:
  replypilot:
    image: node:22-alpine
    container_name: replypilot
    working_dir: /app
    restart: unless-stopped
    volumes:
      - .:/app
      - /app/node_modules
    command: >
      sh -c "npm install &&
             cd server && npm install &&
             npm run build &&
             node dist/index.mjs"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.replypilot.rule=Host(`app.replypilot.dk`)"
      - "traefik.http.routers.replypilot.entrypoints=websecure"
      - "traefik.http.routers.replypilot.tls.certresolver=letsencrypt"
      - "traefik.http.services.replypilot.loadbalancer.server.port=3000"
    networks:
      - traefik-proxy

networks:
  traefik-proxy:
    external: true
```

**Important:**

- **No `ports:` section** – Traefik is the only thing exposing 80/443.
- `Host(\`app.replypilot.dk\`)` must match your DNS hostname.
- `server.port=3000` must match the internal port that the Node server binds to.

**4. Start the service and attach to `traefik-proxy`**

```bash
cd /root/replypilot
docker compose up -d
docker ps

docker network inspect traefik-proxy --format '{{json .Containers}}' \
  | python3 -m json.tool | grep replypilot -n
```

You should see the `replypilot` container attached to `traefik-proxy`.

**5. DNS (Hostinger)**

Create an **A record** for your app domain, for example:

- **Type**: `A`
- **Name**: `app` (for `app.replypilot.dk`)
- **Value**: `<your-vps-ip>`

Wait a few minutes for DNS to propagate.

**6. Verify HTTPS and routing via Traefik**

```bash
docker logs traefik --since=5m 2>&1 | tail -n 80
```

Open in a browser:

- `https://app.replypilot.dk`

If you see a Traefik 404, double-check:

- The DNS hostname matches `Host(\`app.replypilot.dk\`)`
- The `replypilot` container is running and attached to `traefik-proxy`
- The app is listening on `0.0.0.0:3000` inside the container

If you see SSL errors, wait a minute and re-check Traefik logs for Let’s Encrypt / ACME messages.

**7. Quick health checks**

```bash
docker exec -it replypilot apk add --no-cache curl >/dev/null 2>&1 || true
docker exec -it replypilot curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/health

docker logs traefik --since=5m 2>&1 | tail -n 80
```

Follow this pattern for any future services on the same VPS: **one project folder, one `docker-compose.yml`, attached to `traefik-proxy`, with Traefik labels and no host ports**, plus a matching DNS record.

### Admin Deployment (admin.replypilot.dk / admin-api.replypilot.dk)

For the admin dashboard and admin API, the recommended production setup is:

- **Admin frontend**: `https://admin.replypilot.dk`
- **Admin API**: `https://admin-api.replypilot.dk`

When using the provided `docker-compose.yml` on your VPS:

- The `admin-api` service is exposed on the `admin-api.replypilot.dk` subdomain via Traefik.
- The `admin-frontend` service serves the admin SPA on `admin.replypilot.dk` and builds it with the correct admin API base URL.

Make sure the following environment variables are set on the VPS (for example in `/root/replypilot/.env` alongside `docker-compose.yml`):

```bash
ADMIN_FRONTEND_URL=https://admin.replypilot.dk
VITE_ADMIN_API_BASE_URL=https://admin-api.replypilot.dk
```

These map to the Docker services as follows:

- `ADMIN_FRONTEND_URL` → used by `admin-api` for CORS (`origin: https://admin.replypilot.dk`).
- `VITE_ADMIN_API_BASE_URL` → used by `admin-frontend` at build time so that all admin API calls go to `https://admin-api.replypilot.dk/api/admin/...`.

After changing these variables, rebuild the admin services on the VPS:

```bash
cd /root/replypilot
docker compose up -d --build admin-api admin-frontend
```

Then verify in your browser:

- `https://admin-api.replypilot.dk/api/admin/health` returns JSON with `status: ok` or `degraded`.
- On `https://admin.replypilot.dk/login`, the Network tab shows login requests going to `https://admin-api.replypilot.dk/api/admin/auth/login` (not `https://admin.replypilot.dk/api/admin/...`) and responses are JSON from the Express app.

## API Documentation

### Authentication

```
POST /api/auth/signup          - Create new account
POST /api/auth/login           - Login
POST /api/auth/logout          - Logout
POST /api/auth/reset-password-request  - Request password reset
POST /api/auth/reset-password  - Reset password with token
GET  /api/auth/me              - Get current user
```

### Conversations

```
GET    /api/conversations              - List conversations
POST   /api/conversations             - Create conversation
GET    /api/conversations/:id          - Get conversation details
PUT    /api/conversations/:id/close   - Close conversation
POST   /api/conversations/:id/messages - Send message
```

### Leads

```
GET    /api/leads              - List leads
PUT    /api/leads/:id          - Update lead
POST   /api/leads/:id/convert  - Convert lead to customer
```

### Settings

```
GET    /api/settings                     - Get all settings
PUT    /api/settings/company             - Update company settings
PUT    /api/settings/ai                  - Update AI settings
PUT    /api/settings/notifications       - Update notification preferences
```

### Stripe

```
POST /api/stripe/checkout       - Create checkout session
GET  /api/stripe/portal         - Get customer portal URL
POST /webhook                   - Stripe webhook endpoint
```

### Admin

```
GET /api/admin/customers        - List all customers
GET /api/admin/customers/:id     - Get customer details
GET /api/admin/stats             - Get dashboard stats
```

## Database Schema

See `server/migrations/001_initial.sql` for complete schema.

Key tables:
- `customers` - Business accounts
- `users` - Login credentials
- `conversations` - SMS conversations
- `messages` - Individual messages
- `leads` - Qualified leads
- `ai_settings` - Per-customer AI configuration
- `twilio_numbers` - Phone number assignments

## Environment Variables

Required for production:

| Variable | Description |
|----------|-------------|
| `FRONTEND_URL` | Canonical frontend URL, e.g. `https://replypilot.dk` (Stripe redirects, CORS) |
| `VITE_API_BASE_URL` | API URL used by the frontend at build time – for single-domain hosting this should also be `https://replypilot.dk` |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `SESSION_SECRET` | Session encryption key |
| `STRIPE_SECRET_KEY` | Stripe secret key (live) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret |
| `STRIPE_PRICE_ID` | Stripe price ID for subscription |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `GEMINI_API_KEY` | Google Gemini API key |
| `SENDGRID_API_KEY` | SendGrid API key |

## Security Features

- ✅ Password hashing with bcrypt (12 rounds)
- ✅ HttpOnly session cookies
- ✅ CSRF protection via SameSite cookies
- ✅ Rate limiting on all endpoints
- ✅ Input validation and sanitization
- ✅ SQL injection prevention
- ✅ XSS protection headers
- ✅ Security headers via Helmet
- ✅ Account lockout after failed attempts
- ✅ Webhook signature verification

## Monitoring & Logging

- Structured logging with Pino
- Error tracking with Sentry
- Health check endpoints
- Database connection pool metrics
- Redis connection status
- API response time tracking

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- auth.test.mjs
```

## Troubleshooting

### Common Issues

1. **Stripe webhook not working**
   - Verify `STRIPE_WEBHOOK_SECRET` is set
   - Check webhook URL is accessible from internet
   - Verify webhook endpoint returns 200

2. **SMS not sending**
   - Check Twilio credentials
   - Verify phone number is active
   - Check rate limits

3. **AI responses not working**
   - Verify Gemini API key
   - Check AI rate limits
   - Review circuit breaker state

4. **Database connection errors**
   - Verify DATABASE_URL format
   - Check PostgreSQL is running
   - Verify firewall rules

## Support

For issues or questions:
1. Check logs: `docker compose logs -f api`
2. Review error tracking in Sentry
3. Check health endpoint: `/health`
4. Contact: support@replypilot.dk

## License

Copyright 2026 Replypilot. All rights reserved.