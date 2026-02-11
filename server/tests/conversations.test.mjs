import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.mjs';
import { pool } from '../utils/db.mjs';

describe('Conversations API', () => {
  let authCookie = '';
  let customerId = '';
  let testConversationId = '';
  const testUser = {
    email: `conv-test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    name: 'Test User',
  };

  beforeAll(async () => {
    // Create test user
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send(testUser);
    
    authCookie = signupRes.headers['set-cookie'][0];
    
    // Get customer ID
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', authCookie);
    
    customerId = meRes.body.user.customerId;
  });

  afterAll(async () => {
    // Clean up
    await pool.query('DELETE FROM conversations WHERE customer_id = $1', [customerId]);
    await pool.query('DELETE FROM users WHERE email = $1', [testUser.email]);
    await pool.query('DELETE FROM customers WHERE email = $1', [testUser.email]);
    await pool.end();
  });

  describe('POST /api/conversations', () => {
    it('should create a new conversation', async () => {
      const response = await request(app)
        .post('/api/conversations')
        .set('Cookie', authCookie)
        .send({
          leadName: 'Test Lead',
          leadPhone: '+4512345678',
          leadEmail: 'lead@example.com',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.conversation.id).toBeDefined();
      expect(response.body.conversation.lead_phone).toBe('+4512345678');
      
      testConversationId = response.body.conversation.id;
    });

    it('should reject conversation without phone number', async () => {
      const response = await request(app)
        .post('/api/conversations')
        .set('Cookie', authCookie)
        .send({ leadName: 'Test' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/conversations', () => {
    it('should list conversations', async () => {
      const response = await request(app)
        .get('/api/conversations')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.conversations)).toBe(true);
      expect(response.body.conversations.length).toBeGreaterThan(0);
    });

    it('should filter conversations by status', async () => {
      const response = await request(app)
        .get('/api/conversations?status=active')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.conversations.every(c => c.status === 'active')).toBe(true);
    });
  });

  describe('GET /api/conversations/:id', () => {
    it('should get conversation details', async () => {
      const response = await request(app)
        .get(`/api/conversations/${testConversationId}`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.conversation.id).toBe(testConversationId);
    });

    it('should return 404 for non-existent conversation', async () => {
      const response = await request(app)
        .get('/api/conversations/00000000-0000-0000-0000-000000000000')
        .set('Cookie', authCookie)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/conversations/:id/messages', () => {
    it('should send a message', async () => {
      const response = await request(app)
        .post(`/api/conversations/${testConversationId}/messages`)
        .set('Cookie', authCookie)
        .send({
          content: 'Test message from user',
          conversationId: testConversationId,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message.content).toBe('Test message from user');
    });

    it('should reject empty messages', async () => {
      const response = await request(app)
        .post(`/api/conversations/${testConversationId}/messages`)
        .set('Cookie', authCookie)
        .send({ content: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/conversations/:id/close', () => {
    it('should close a conversation', async () => {
      const response = await request(app)
        .put(`/api/conversations/${testConversationId}/close`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.conversation.status).toBe('closed');
    });
  });
});