import assert from 'assert';
import http from 'http';
import { test } from 'node:test';

// Simple smoke-test style checks for the admin API.
// These tests assume the admin-api is running locally on ADMIN_API_PORT (default 3100)
// and that there is at least one admin user in the database (for the optional login test).

const ADMIN_API_BASE = process.env.ADMIN_API_BASE || 'http://localhost:3100';

const requestJson = (path, { method = 'GET', headers = {}, body } = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, ADMIN_API_BASE);
    const payload = body ? JSON.stringify(body) : null;

    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += String(chunk);
        });
        res.on('end', () => {
          try {
            const json = data ? JSON.parse(data) : null;
            resolve({ status: res.statusCode, headers: res.headers, body: json });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, body: null });
          }
        });
      }
    );

    req.on('error', reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
};

const getCookieHeader = (res) => {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie || !Array.isArray(setCookie)) return '';
  const sessionCookie = setCookie.find((c) => c.startsWith('session='));
  return sessionCookie ? sessionCookie.split(';')[0] : '';
};

test('admin-api: /api/admin/health responds with ok/degraded', async () => {
  const res = await requestJson('/api/admin/health');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body, 'expected JSON body');
  assert.ok(
    res.body.status === 'ok' || res.body.status === 'degraded',
    `unexpected status: ${res.body.status}`
  );
});

test('admin-api: /api/admin/customers requires auth', async () => {
  const res = await requestJson('/api/admin/customers');
  assert.ok(
    res.status === 401 || res.status === 403,
    `expected 401/403, got ${res.status}`
  );
});

test('admin-api: admin login and customers listing (optional)', async (t) => {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!email || !password) {
    t.diagnostic('Skipping login test because TEST_ADMIN_EMAIL/PASSWORD not set');
    return;
  }

  const loginRes = await requestJson('/api/admin/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  assert.strictEqual(loginRes.status, 200);
  assert.ok(loginRes.body?.user);
  assert.strictEqual(loginRes.body.user.role, 'admin');

  const cookie = getCookieHeader(loginRes);
  assert.ok(cookie.includes('session='), 'expected session cookie');

  const listRes = await requestJson('/api/admin/customers', {
    headers: { Cookie: cookie },
  });

  assert.strictEqual(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body?.data));
});


