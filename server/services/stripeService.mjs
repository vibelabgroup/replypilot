import Stripe from 'stripe';
import { query, withTransaction } from '../utils/db.mjs';
import { logInfo, logError, logDebug, logWarn } from '../utils/logger.mjs';

// Ensure we actually have a Stripe secret key configured,
// and log a clear error in development if not.
const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret) {
  logError('STRIPE_SECRET_KEY is not configured – Stripe checkout will fail');
}

const stripe =
  process.env.NODE_ENV === 'test'
    ? null
    : new Stripe(stripeSecret || 'sk_test_dummy', {
        apiVersion: '2023-10-16',
        maxNetworkRetries: 3,
        timeout: 30000,
      });

// Create checkout session
export const createCheckoutSession = async ({ name, email, phone, priceId }) => {
  try {
    logDebug('Creating checkout session', { email, priceId });

    // In tests, return a fake session without calling Stripe
    if (process.env.NODE_ENV === 'test') {
      return {
        sessionId: 'cs_test_local',
        url: 'https://checkout.stripe.com/pay/test',
      };
    }

    // In local/dev, if no Stripe key is configured, fall back to a
    // "demo" checkout that immediately redirects back to the frontend
    // as if payment succeeded. This lets us test the onboarding flow
    // without needing real Stripe credentials.
    if (!stripeSecret) {
      const frontend =
        process.env.FRONTEND_URL || 'http://localhost:3001';
      logWarn(
        'STRIPE_SECRET_KEY missing – using local demo checkout flow',
        { email }
      );
      return {
        sessionId: 'cs_demo_local',
        url: `${frontend}/?checkout=success&session_id=cs_demo_local`,
      };
    }

    // Create or retrieve customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      // Update customer with phone if missing
      if (!customer.phone && phone) {
        customer = await stripe.customers.update(customer.id, { phone });
      }
    } else {
      customer = await stripe.customers.create({
        email,
        name,
        phone,
        metadata: {
          source: 'replypilot_checkout',
        },
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/?checkout=cancelled`,
      subscription_data: {
        trial_period_days: 14, // 14-day free trial
      },
      metadata: {
        email,
        name,
      },
    });

    // Persist a pre-checkout customer + lead record in our own DB
    // so we keep the data even if they never complete payment.
    try {
      await withTransaction(async (client) => {
        // Upsert customer by email
        const customerResult = await client.query(
          `INSERT INTO customers (stripe_customer_id, name, email, phone, status, subscription_status)
           VALUES ($1, $2, $3, $4, 'trial', 'incomplete')
           ON CONFLICT (email) DO UPDATE
           SET name = EXCLUDED.name,
               phone = EXCLUDED.phone,
               stripe_customer_id = COALESCE(customers.stripe_customer_id, EXCLUDED.stripe_customer_id),
               updated_at = NOW()
           RETURNING id`,
          [customer.id, name, email, phone]
        );

        const customerUuid = customerResult.rows[0].id;

        // Create a lead tied to this customer
        await client.query(
          `INSERT INTO leads (customer_id, name, phone, email, source, qualification)
           VALUES ($1, $2, $3, $4, 'website', 'unqualified')`,
          [customerUuid, name, phone, email]
        );
      });
    } catch (dbError) {
      // Never block checkout on lead persistence; just log.
      logError('Failed to persist pre-checkout lead', {
        error: dbError.message,
        email,
      });
    }

    logInfo('Checkout session created', { sessionId: session.id, customerId: customer.id });
    
    return { sessionId: session.id, url: session.url };
  } catch (error) {
    logError('Failed to create checkout session', { error: error.message, email });
    throw error;
  }
};

// Handle Stripe webhook events
export const handleWebhook = async (payload, signature) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;
  try {
    if (process.env.NODE_ENV === 'test') {
      // In tests, accept either object, string or Buffer without signature verification
      if (typeof payload === 'object' && !Buffer.isBuffer(payload)) {
        event = payload;
      } else if (typeof payload === 'string') {
        event = JSON.parse(payload);
      } else {
        event = JSON.parse(payload.toString());
      }
    } else {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    }
  } catch (err) {
    logError('Webhook signature verification failed', { error: err.message });
    const error = new Error(`Webhook signature verification failed: ${err.message}`);
    error.statusCode = 400;
    throw error;
  }

  logInfo('Webhook received', { type: event.type, id: event.id });

  // Idempotency check - check if we've already processed this event
  const existingEvent = await query(
    'SELECT id FROM stripe_events WHERE id = $1',
    [event.id]
  );

  if (existingEvent.rowCount > 0) {
    logDebug('Webhook already processed', { eventId: event.id });
    return { received: true, processed: false, reason: 'already_processed' };
  }

  // Store event
  await query(
    `INSERT INTO stripe_events (id, type, data)
     VALUES ($1, $2, $3)`,
    [event.id, event.type, JSON.stringify(event.data.object)]
  );

  try {
    // Handle specific event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      
      default:
        logDebug('Unhandled webhook event type', { type: event.type });
    }

    // Mark as processed
    await query(
      'UPDATE stripe_events SET processed = true, processed_at = NOW() WHERE id = $1',
      [event.id]
    );

    return { received: true, processed: true };
  } catch (error) {
    logError('Webhook processing failed', { eventId: event.id, error: error.message });
    
    await query(
      'UPDATE stripe_events SET processed = false, error_message = $2 WHERE id = $1',
      [event.id, error.message]
    );
    
    throw error;
  }
};

// Handle checkout session completed
const handleCheckoutCompleted = async (session) => {
  const customerId = session.customer;
  const email = session.customer_email || session.metadata?.email;
  const name = session.metadata?.name || 'Unknown';

  await withTransaction(async (client) => {
    // Check if customer exists
    const existingCustomer = await client.query(
      'SELECT id FROM customers WHERE stripe_customer_id = $1',
      [customerId]
    );

    if (existingCustomer.rowCount === 0) {
      // Create new customer
      const newCustomer = await client.query(
        `INSERT INTO customers (stripe_customer_id, email, name, status, subscription_status)
         VALUES ($1, $2, $3, 'active', 'trialing')
         RETURNING id`,
        [customerId, email, name]
      );

      const customerUuid = newCustomer.rows[0].id;

      // Create default settings
      await client.query(
        `INSERT INTO company_settings (customer_id, company_name)
         VALUES ($1, $2)`,
        [customerUuid, name]
      );

      await client.query(
        `INSERT INTO ai_settings (customer_id)
         VALUES ($1)`,
        [customerUuid]
      );

      await client.query(
        `INSERT INTO notification_preferences (customer_id)
         VALUES ($1)`,
        [customerUuid]
      );

      logInfo('New customer created from checkout', { customerId: customerUuid, email });
    }
  });
};

// Handle subscription updates
const handleSubscriptionUpdated = async (subscription) => {
  const customerId = subscription.customer;
  const status = subscription.status;
  const currentPeriodStart = new Date(subscription.current_period_start * 1000);
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;

  await query(
    `UPDATE customers
     SET stripe_subscription_id = $1,
         subscription_status = $2::subscription_status,
         current_period_start = $3,
         current_period_end = $4,
         cancel_at_period_end = $5,
         updated_at = NOW()
     WHERE stripe_customer_id = $6`,
    [subscription.id, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, customerId]
  );

  logInfo('Subscription updated', { customerId, status, subscriptionId: subscription.id });
};

// Handle subscription deletion
const handleSubscriptionDeleted = async (subscription) => {
  const customerId = subscription.customer;

  await query(
    `UPDATE customers
     SET subscription_status = 'canceled',
         status = 'cancelled',
         stripe_subscription_id = NULL,
         updated_at = NOW()
     WHERE stripe_customer_id = $1`,
    [customerId]
  );

  logInfo('Subscription cancelled', { customerId, subscriptionId: subscription.id });
};

// Handle invoice paid
const handleInvoicePaid = async (invoice) => {
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  if (subscriptionId) {
    // Update trial end if this is the first paid invoice
    await query(
      `UPDATE customers
       SET trial_end = NULL,
           status = 'active',
           updated_at = NOW()
       WHERE stripe_customer_id = $1 AND trial_end IS NOT NULL`,
      [customerId]
    );

    logInfo('Invoice paid, trial ended', { customerId, subscriptionId });
  }
};

// Handle payment failure
const handlePaymentFailed = async (invoice) => {
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  await query(
    `UPDATE customers
     SET subscription_status = 'past_due',
         updated_at = NOW()
     WHERE stripe_customer_id = $1`,
    [customerId]
  );

  logWarn('Payment failed', { customerId, subscriptionId, invoiceId: invoice.id });
};

// Get customer subscription status
export const getSubscriptionStatus = async (stripeCustomerId) => {
  const result = await query(
    `SELECT status, subscription_status, current_period_end, cancel_at_period_end
     FROM customers
     WHERE stripe_customer_id = $1`,
    [stripeCustomerId]
  );

  return result.rows[0] || null;
};

// Create customer portal session
export const createPortalSession = async (stripeCustomerId) => {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${process.env.FRONTEND_URL}/dashboard/settings`,
  });

  return { url: session.url };
};