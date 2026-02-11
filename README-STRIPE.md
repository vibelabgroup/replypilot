### Replypilot Stripe Subscription Setup (Production-ready)

This document explains how to configure and operate the Stripe-based subscription flow for Replypilot.

---

## 1. Environment variables

### Frontend (Vite, served at `https://replypilot.dk`)

Set these for production (e.g. in Hostinger env or `.env.production`):

- `VITE_API_BASE_URL=https://<your-backend-domain>`  
  Example: `https://payments.replypilot.dk`

### Backend (Node server on Hostinger)

Set these in the Hostinger control panel:

- `STRIPE_SECRET_KEY` – your Stripe **live** secret key.
- `STRIPE_PRICE_ID` – the live **Price ID** for the Replypilot monthly subscription.
- `FRONTEND_URL=https://replypilot.dk`
- `STRIPE_WEBHOOK_SECRET` – the live webhook signing secret for this backend’s webhook endpoint.
- `DATABASE_URL` – PostgreSQL connection string, e.g.  
  `postgres://user:password@host:5432/replypilot`

See `.env.example` for a full reference.

---

## 2. Backend endpoints

- `POST /create-checkout-session`  
  - Input: `{ name, email, phone }`  
  - Creates a Stripe Checkout Session in `subscription` mode and returns `{ url }` for redirect.

- `POST /webhook`  
  - Stripe webhooks target this URL.  
  - Verifies signatures with `STRIPE_WEBHOOK_SECRET`.  
  - Writes events to `stripe_events` (idempotency).  
  - Upserts `customers` and `subscriptions` based on:
    - `checkout.session.completed`
    - `customer.subscription.created/updated/deleted`
    - `invoice.payment_failed`

- `GET /api/subscription-status?email=...`  
  - Returns `{ email, hasActiveSubscription, subscription }`.  
  - Used by the frontend as a soft access-control signal after checkout.

- `GET /health`  
  - Returns `{ status: "ok" }` for monitoring.

---

## 3. Local development (test mode)

1. Set up `.env.local` with **Stripe test keys** and a local Postgres `DATABASE_URL`.
2. Run Postgres locally or via Docker.
3. Start backend:

```bash
npm run server
```

4. Start frontend:

```bash
npm run dev
```

5. Configure a Stripe **test mode** webhook pointing to your local tunnel (e.g. via `ngrok`) at `/webhook`, and use the resulting test `STRIPE_WEBHOOK_SECRET`.

6. Run a smoke test (with the server running):

```bash
npm test
```

---

## 4. Production rollout checklist

1. **Configure environment variables** on Hostinger (backend) and for Vite (frontend) as described above.
2. In Stripe Dashboard (live mode):
   - Confirm the `Replypilot` product and monthly price exist and are set to `DKK 1995` + moms.
   - Create a webhook endpoint pointing to `https://<your-backend-domain>/webhook`.
   - Subscribe it to:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
     - `invoice.paid`
   - Copy the **live** webhook secret into `STRIPE_WEBHOOK_SECRET` on Hostinger.
3. Deploy the backend (Node app) and confirm:
   - `GET /health` returns `{ status: "ok" }`.
   - Database tables `customers`, `subscriptions`, and `stripe_events` are created.
4. Deploy the frontend (Replypilot) pointing `VITE_API_BASE_URL` to the backend URL.
5. Run a **small live test**:
   - Create a temporary low-price live plan in Stripe (e.g. DKK 10/month).
   - Set `STRIPE_PRICE_ID` to that plan.
   - Go through the full flow on `https://replypilot.dk`:
     - Click **Start Nu**, fill in form, complete Checkout with a real card.
     - Verify:
       - The app redirects back and onboarding starts.
       - Stripe Dashboard shows an active subscription.
       - DB contains a `customers` row and a `subscriptions` row.
       - Webhook deliveries for the test session show status `200`.
6. Switch `STRIPE_PRICE_ID` to the real production price and repeat a quick sanity check.

---

## 5. Operations and monitoring

- **Logs**  
  - Backend uses structured logs via `server/logger.mjs`:
    - `logInfo`, `logWarn`, `logError`.
  - Use Hostinger’s log viewer or ship logs to an external service if needed.

- **Alerts**  
  - Enable Stripe Dashboard email alerts for failed payments and webhook issues.

You now have a Stripe Checkout + webhook–backed subscription system with persistence, idempotent webhooks, and a clear operational playbook for Replypilot.

