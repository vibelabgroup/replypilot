import { logError } from '../core/logger.mjs';

const TENANT_TOKEN_SECRET = process.env.TENANT_JWT_SECRET || '';

const sign = async (payload) => {
  const { createHmac } = await import('crypto');
  const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', TENANT_TOKEN_SECRET)
    .update(raw)
    .digest('base64url');
  return `${raw}.${sig}`;
};

const verify = async (token) => {
  const { createHmac, timingSafeEqual } = await import('crypto');
  const [raw, sig] = String(token || '').split('.');
  if (!raw || !sig) throw new Error('Malformed token');

  const expectedSig = createHmac('sha256', TENANT_TOKEN_SECRET)
    .update(raw)
    .digest('base64url');

  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    throw new Error('Invalid signature');
  }

  const json = Buffer.from(raw, 'base64url').toString('utf8');
  const payload = JSON.parse(json);

  if (!payload || !payload.customerId) {
    throw new Error('Missing customerId');
  }

  if (payload.exp && Date.now() > payload.exp) {
    throw new Error('Token expired');
  }

  return payload;
};

export const signTenantToken = async (customerId, ttlMs = 2 * 60 * 60 * 1000) => {
  if (!TENANT_TOKEN_SECRET) {
    throw new Error('TENANT_JWT_SECRET not configured');
  }
  if (TENANT_TOKEN_SECRET.length < 32) {
    throw new Error('TENANT_JWT_SECRET must be at least 32 characters');
  }
  const now = Date.now();
  const payload = {
    customerId,
    iat: now,
    exp: now + ttlMs,
  };
  return sign(payload);
};

// Verify and return payload; exported for internal callers like the
// Shopify connect endpoint that need customerId before we have req.tenant.
export const verifyTenantToken = async (token) => {
  if (!TENANT_TOKEN_SECRET) {
    throw new Error('TENANT_JWT_SECRET not configured');
  }
  if (TENANT_TOKEN_SECRET.length < 32) {
    throw new Error('TENANT_JWT_SECRET must be at least 32 characters');
  }
  return verify(token);
};

export const tenantAuth = async (req, res, next) => {
  try {
    if (!TENANT_TOKEN_SECRET) {
      return res.status(500).json({ error: 'Tenant auth not configured' });
    }

    const header = req.headers.authorization || '';
    const [, token] = header.split(' ');

    if (!token) {
      // Fallback: Check if the main server's authMiddleware has already
      // authenticated the user via cookies (req.auth.customerId).
      if (req.auth && req.auth.customerId) {
        req.tenant = { customerId: req.auth.customerId };
        return next();
      }
      return res.status(401).json({ error: 'Missing Authorization Bearer token' });
    }

    const payload = await verify(token);
    req.tenant = { customerId: payload.customerId };
    return next();
  } catch (err) {
    logError('Invalid tenant token', { error: err?.message });
    return res.status(401).json({ error: 'Invalid tenant token' });
  }
};

