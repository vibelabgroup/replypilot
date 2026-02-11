import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.mjs';
import { pool } from '../utils/db.mjs';
import { handleWebhook } from '../services/stripeService.mjs';

describe('Stripe Integration', () => {
  const testCustomer = {
    name: 'Test Customer',
    email: `stripe-test-${Date.now()}@example.com`,
    phone: '12345678',
    priceId: 'price_test_123',
  };

  beforeAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM customers WHERE email LIKE $1', ['stripe-test-%@example.com']);
    await pool.query('DELETE FROM stripe_events WHERE id LIKE $1', ['evt_test_%']);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('POST /api/stripe/checkout', () => {
    it('should create a checkout session', async () => {
      const response = await request(app)
        .post('/api/stripe/checkout')
        .send(testCustomer)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sessionId).toBeDefined();
      expect(response.body.url).toBeDefined();
    });

    it('should reject checkout without required fields', async () => {
      const response = await request(app)
        .post('/api/stripe/checkout')
        .send({ name: 'Test' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /webhook', () => {
    it('should handle checkout.session.completed webhook', async () => {
      const webhookPayload = {
        id: 'evt_test_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_123',
            customer_email: testCustomer.email,
            metadata: {
              customer_name: testCustomer.name,
            },
            subscription: 'sub_test_123',
          },
        },
      };

      const result = await handleWebhook(webhookPayload, 'valid-signature');
      expect(result.received).toBe(true);
      expect(result.processed).toBe(true);

      // Verify customer was created
      const customerResult = await pool.query(
        'SELECT * FROM customers WHERE email = $1',
        [testCustomer.email]
      );
      expect(customerResult.rowCount).toBe(1);
      expect(customerResult.rows[0].stripe_customer_id).toBe('cus_test_123');
    });

    it('should handle customer.subscription.updated webhook', async () => {
      const webhookPayload = {
        id: 'evt_test_456',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_123',
            status: 'active',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            cancel_at_period_end: false,
          },
        },
      };

      const result = await handleWebhook(webhookPayload, 'valid-signature');
      expect(result.received).toBe(true);

      // Verify subscription was updated
      const customerResult = await pool.query(
        'SELECT * FROM customers WHERE stripe_customer_id = $1',
        ['cus_test_123']
      );
      expect(customerResult.rows[0].subscription_status).toBe('active');
    });

    it('should handle duplicate webhook events idempotently', async () => {
      const webhookPayload = {
        id: 'evt_test_duplicate',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_duplicate',
            customer: 'cus_test_duplicate',
            customer_email: 'duplicate@example.com',
          },
        },
      };

      // First request
      await handleWebhook(webhookPayload, 'valid-signature');

      // Second request (duplicate)
      const result = await handleWebhook(webhookPayload, 'valid-signature');

      expect(result.reason).toBe('already_processed');
    });

    it('should reject webhooks with invalid signature', async () => {
      await expect(handleWebhook('not-json', 'invalid-signature')).rejects.toBeInstanceOf(Error);
    });
  });
});