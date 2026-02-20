import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.mjs';
import { pool, initDb } from '../db.mjs';
import { initAuthDb } from '../auth.mjs';

describe('Auth password reset flow', () => {
  const email = `test.reset.${Date.now()}@example.com`;
  const initialPassword = 'TestPassword123!';
  const updatedPassword = 'UpdatedPassword456!';

  beforeAll(async () => {
    await initDb();
    await initAuthDb();
    await pool.query('DELETE FROM users WHERE email = $1', [email]);
    await pool.query('DELETE FROM customers WHERE email = $1', [email]);

    await request(app).post('/api/auth/signup').send({
      email,
      password: initialPassword,
      name: 'Reset Test User',
      phone: '12345678',
    });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email = $1', [email]);
    await pool.query('DELETE FROM customers WHERE email = $1', [email]);
    await pool.end();
  });

  it('returns generic success for existing and non-existing emails', async () => {
    const existing = await request(app)
      .post('/api/auth/reset-password-request')
      .send({ email })
      .expect(200);

    expect(existing.body.success).toBe(true);

    const nonExisting = await request(app)
      .post('/api/auth/reset-password-request')
      .send({ email: `does-not-exist-${Date.now()}@example.com` })
      .expect(200);

    expect(nonExisting.body.success).toBe(true);
  });

  it('rejects reset with invalid token', async () => {
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'invalid-token', password: updatedPassword })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it('resets password with valid token and allows login with new password', async () => {
    const requestResult = await request(app)
      .post('/api/auth/reset-password-request')
      .send({ email })
      .expect(200);

    expect(requestResult.body.success).toBe(true);

    const tokenResult = await pool.query(
      `SELECT password_reset_token
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    const resetToken = tokenResult.rows[0]?.password_reset_token;
    expect(resetToken).toBeTruthy();

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: updatedPassword })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email, password: initialPassword })
      .expect(401);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email, password: updatedPassword })
      .expect(200);

    expect(loginResponse.body.user.email).toBe(email);
  });
});