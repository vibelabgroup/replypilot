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
│  replypilot.dk      │  api.replypilot.dk      │  Background  │
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

```bash
# 1. Prepare environment
cp .env.example .env
# Configure all production credentials

# 2. Build and deploy
docker compose -f docker-compose.yml up -d --build

# 3. Run migrations
docker compose exec api npm run db:migrate

# 4. Verify health
curl https://api.replypilot.dk/health
```

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
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `SESSION_SECRET` | Session encryption key |
| `STRIPE_SECRET_KEY` | Stripe secret key (live) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret |
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