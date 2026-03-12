import express from 'express';
import cors from 'cors';
import { tenantAuth, verifyTenantToken } from './auth.mjs';
import { query } from '../core/db.mjs';
import { enqueueJob } from '../core/redis.mjs';
import { logError } from '../core/logger.mjs';

const app = express();
const port = process.env.TENANT_API_PORT || 3200;

const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  })
);
app.use(express.json());

// ---------- Email OAuth (Gmail & Outlook) ----------

const getEmailOAuthConfig = (provider) => {
  if (provider === 'gmail') {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes:
        process.env.GOOGLE_OAUTH_SCOPES ||
        'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send openid email profile',
    };
  }

  if (provider === 'outlook') {
    return {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      redirectUri: process.env.MICROSOFT_OAUTH_REDIRECT_URI,
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes:
        process.env.MICROSOFT_OAUTH_SCOPES ||
        'offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read',
    };
  }

  return null;
};

const buildEmailOAuthState = async ({ customerId, provider, redirectPath }) => {
  const stateSecret = process.env.EMAIL_OAUTH_STATE_SECRET;
  if (!stateSecret) {
    throw new Error('EMAIL_OAUTH_STATE_SECRET is not configured');
  }
  const now = Date.now();
  const rawPayload = {
    customerId,
    provider,
    redirectPath: redirectPath || '/settings',
    iat: now,
    exp: now + 10 * 60 * 1000,
    nonce: Math.random().toString(36).slice(2),
  };
  const { createHmac } = await import('crypto');
  const stateRaw = Buffer.from(JSON.stringify(rawPayload)).toString('base64url');
  const sig = createHmac('sha256', stateSecret).update(stateRaw).digest('base64url');
  return `${stateRaw}.${sig}`;
};

const parseAndVerifyEmailOAuthState = async (state) => {
  const stateSecret = process.env.EMAIL_OAUTH_STATE_SECRET;
  if (!stateSecret) {
    throw new Error('EMAIL_OAUTH_STATE_SECRET is not configured');
  }
  const { createHmac, timingSafeEqual } = await import('crypto');
  const [stateRaw, sig] = String(state).split('.');
  if (!stateRaw || !sig) {
    throw new Error('Invalid state');
  }
  const expectedSig = createHmac('sha256', stateSecret).update(stateRaw).digest('base64url');
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    throw new Error('Invalid state');
  }
  const decoded = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8'));
  const { customerId, provider, redirectPath, exp } = decoded || {};
  if (!customerId || !provider || (exp && Date.now() > exp)) {
    throw new Error('Invalid or expired state payload');
  }
  return { customerId, provider, redirectPath: redirectPath || '/settings' };
};

app.get('/api/tenant/email/:provider/connect', async (req, res) => {
  try {
    const { provider } = req.params;
    const config = getEmailOAuthConfig(provider);
    if (!config) {
      return res.status(400).json({ error: 'Unsupported email provider' });
    }

    const authHeader = req.headers.authorization || '';
    const [, token] = authHeader.split(' ');
    if (!token) {
      return res.status(401).json({ error: 'Missing tenant token' });
    }
    const payload = await verifyTenantToken(token);
    const { customerId } = payload;

    const redirectPath =
      typeof req.query.redirect === 'string' && req.query.redirect.trim()
        ? req.query.redirect.trim()
        : '/settings';

    const state = await buildEmailOAuthState({ customerId, provider, redirectPath });

    const url = new URL(config.authUrl);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.scopes);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);

    return res.redirect(url.toString());
  } catch (err) {
    logError('Failed to start email OAuth', { error: err?.message });
    return res.status(500).json({ error: 'Unable to start email OAuth' });
  }
});

const exchangeCodeForTokens = async ({ provider, code, config }) => {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', config.redirectUri);
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);

  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token exchange failed (${provider}): ${res.status} ${text}`);
  }

  return res.json();
};

const fetchProviderProfile = async ({ provider, accessToken }) => {
  if (provider === 'gmail') {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to fetch Gmail profile: ${res.status} ${text}`);
    }
    const json = await res.json();
    return {
      email: json.email,
      displayName: json.name || null,
      providerUserId: json.id || null,
    };
  }

  if (provider === 'outlook') {
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to fetch Microsoft profile: ${res.status} ${text}`);
    }
    const json = await res.json();
    return {
      email: (json.mail || json.userPrincipalName || '').toLowerCase(),
      displayName: json.displayName || null,
      providerUserId: json.id || null,
    };
  }

  throw new Error('Unsupported provider');
};

app.get('/api/tenant/email/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const { code, state } = req.query || {};

  if (!code || !state) {
    return res.status(400).send('Missing code/state');
  }

  try {
    const config = getEmailOAuthConfig(provider);
    if (!config) {
      return res.status(400).send('Unsupported email provider');
    }

    const { customerId, provider: stateProvider, redirectPath } =
      await parseAndVerifyEmailOAuthState(state);

    if (stateProvider !== provider) {
      return res.status(400).send('State provider mismatch');
    }

    const tokenJson = await exchangeCodeForTokens({
      provider,
      code,
      config,
    });

    const accessToken = tokenJson.access_token;
    const refreshToken = tokenJson.refresh_token || null;
    const expiresIn = tokenJson.expires_in;
    if (!accessToken) {
      return res.status(500).send('No access token in response');
    }

    const profile = await fetchProviderProfile({ provider, accessToken });
    if (!profile.email) {
      return res.status(500).send('Provider did not return an email address');
    }

    const expiresAt =
      typeof expiresIn === 'number'
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

    await query(
      `
        INSERT INTO email_accounts (
          customer_id,
          provider,
          email_address,
          display_name,
          provider_user_id,
          access_token,
          refresh_token,
          expires_at,
          scopes,
          status
        )
        VALUES ($1, $2, LOWER($3), $4, $5, $6, $7, $8, $9, 'active')
        ON CONFLICT (customer_id, provider, email_address) DO UPDATE
        SET access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            expires_at = EXCLUDED.expires_at,
            scopes = EXCLUDED.scopes,
            status = 'active',
            updated_at = NOW()
      `,
      [
        customerId,
        provider,
        profile.email,
        profile.displayName,
        profile.providerUserId,
        accessToken,
        refreshToken,
        expiresAt,
        Array.isArray(tokenJson.scope)
          ? tokenJson.scope
          : typeof tokenJson.scope === 'string'
          ? tokenJson.scope.split(/[,\s]+/).filter(Boolean)
          : [],
      ]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'https://app.replypilot.dk';
    return res.redirect(
      `${frontendUrl.replace(/\/$/, '')}${redirectPath}?email=connected`
    );
  } catch (err) {
    logError('Email OAuth callback error', { error: err?.message, provider });
    return res.status(500).send('Email OAuth callback error');
  }
});

// List email accounts for the authenticated tenant
app.get('/api/tenant/email/accounts', async (req, res) => {
  try {
    await tenantAuth(req, res, async () => {
      const { customerId } = req.tenant;
      const result = await query(
        `
          SELECT
            id,
            provider,
            email_address,
            display_name,
            status,
            last_sync_at,
            created_at,
            updated_at
          FROM email_accounts
          WHERE customer_id = $1
          ORDER BY created_at DESC
        `,
        [customerId]
      );
      res.json({ data: result.rows });
    });
  } catch (err) {
    logError('Failed to list tenant email accounts', { error: err?.message });
    res.status(500).json({ error: 'Unable to list email accounts' });
  }
});

// Disable (disconnect) an email account for the authenticated tenant
app.delete('/api/tenant/email/accounts/:id', async (req, res) => {
  try {
    await tenantAuth(req, res, async () => {
      const { customerId } = req.tenant;
      const { id } = req.params;

      const result = await query(
        `
          UPDATE email_accounts
          SET status = 'disabled',
              access_token = NULL,
              refresh_token = NULL,
              updated_at = NOW()
          WHERE id = $1
            AND customer_id = $2
          RETURNING id
        `,
        [id, customerId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Email account not found' });
      }

      res.status(204).end();
    });
  } catch (err) {
    logError('Failed to disable tenant email account', { error: err?.message });
    res.status(500).json({ error: 'Unable to disable email account' });
  }
});

app.get('/api/tenant/shops/shopify/connect', async (req, res) => {
  try {
    // tenantAuth is not used here because Shopify will call back to /callback.
    // The caller (frontend) should already hold a tenant token; we include
    // customerId in state instead.
    const authHeader = req.headers.authorization || '';
    const [, token] = authHeader.split(' ');
    if (!token) {
      return res.status(401).json({ error: 'Missing tenant token' });
    }
    const payload = await verifyTenantToken(token);
    const { customerId } = payload;

    const { shop } = req.query;
    if (!shop || typeof shop !== 'string') {
      return res
        .status(400)
        .json({ error: 'Missing ?shop=your-shop.myshopify.com' });
    }

    // Check that Shopify integrations are enabled and within the store limit
    const customerResult = await query(
      `
        SELECT shopify_enabled, max_store_connections
        FROM customers
        WHERE id = $1
      `,
      [customerId]
    );

    if (customerResult.rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const { shopify_enabled: shopifyEnabled, max_store_connections: maxStoreConnections } =
      customerResult.rows[0] || {};

    if (!shopifyEnabled) {
      return res
        .status(403)
        .json({ error: 'Shopify integration is not enabled for this customer' });
    }

    if (typeof maxStoreConnections === 'number') {
      const countResult = await query(
        `
          SELECT COUNT(*) AS total
          FROM store_connections
          WHERE customer_id = $1
        `,
        [customerId]
      );
      const total = parseInt(countResult.rows[0].total, 10) || 0;
      if (total >= maxStoreConnections) {
        return res.status(400).json({
          error: `You have reached the maximum number of store connections (${maxStoreConnections})`,
        });
      }
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
    const scopes =
      process.env.SHOPIFY_SCOPES || 'read_products,read_orders,read_customers';
    const stateSecret = process.env.SHOPIFY_STATE_SECRET;

    if (!clientId || !redirectUri || !stateSecret) {
      return res.status(500).json({ error: 'Shopify OAuth not configured' });
    }

    const now = Date.now();
    const rawPayload = {
      customerId,
      shop,
      iat: now,
      exp: now + 10 * 60 * 1000,
      nonce: Math.random().toString(36).slice(2),
    };

    const { createHmac } = await import('crypto');
    const stateRaw = Buffer.from(JSON.stringify(rawPayload)).toString(
      'base64url'
    );
    const sig = createHmac('sha256', stateSecret)
      .update(stateRaw)
      .digest('base64url');
    const state = `${stateRaw}.${sig}`;

    const url = new URL(`https://${shop}/admin/oauth/authorize`);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('scope', scopes);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);

    return res.redirect(url.toString());
  } catch (err) {
    logError('Failed to start Shopify OAuth', { error: err?.message });
    return res.status(500).json({ error: 'Unable to start Shopify OAuth' });
  }
});

app.get('/api/tenant/shops/shopify/callback', async (req, res) => {
  const { code, shop, state } = req.query || {};

  if (!code || !shop || !state) {
    return res.status(400).send('Missing code/shop/state');
  }

  try {
    const [stateRaw, sig] = String(state).split('.');
    const stateSecret = process.env.SHOPIFY_STATE_SECRET;
    const { createHmac, timingSafeEqual } = await import('crypto');

    const expectedSig = createHmac('sha256', stateSecret)
      .update(stateRaw)
      .digest('base64url');

    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return res.status(400).send('Invalid state');
    }

    const decoded = JSON.parse(
      Buffer.from(stateRaw, 'base64url').toString('utf8')
    );
    const { customerId, exp } = decoded || {};
    if (!customerId || (exp && Date.now() > exp)) {
      return res.status(400).send('Invalid or expired state payload');
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).send('Shopify OAuth not configured');
    }

    const tokenRes = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      }
    );

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => '');
      logError('Shopify token exchange failed', {
        status: tokenRes.status,
        body: text,
      });
      return res.status(500).send('Token exchange failed');
    }

    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      return res.status(500).send('No access token in response');
    }

    // Check customer eligibility and store connection limits
    const customerResult = await query(
      `
        SELECT shopify_enabled, max_store_connections
        FROM customers
        WHERE id = $1
      `,
      [customerId]
    );

    if (customerResult.rowCount === 0) {
      return res.status(400).send('Customer not found');
    }

    const { shopify_enabled: shopifyEnabled, max_store_connections: maxStoreConnections } =
      customerResult.rows[0] || {};

    if (!shopifyEnabled) {
      return res.status(403).send('Shopify integration is not enabled for this customer');
    }

    // Allow reconnecting an existing store regardless of current count
    const existingStore = await query(
      `
        SELECT id
        FROM store_connections
        WHERE customer_id = $1
          AND platform = 'shopify'
          AND store_domain = $2
        LIMIT 1
      `,
      [customerId, shop]
    );

    if (existingStore.rowCount === 0 && typeof maxStoreConnections === 'number') {
      const countResult = await query(
        `
          SELECT COUNT(*) AS total
          FROM store_connections
          WHERE customer_id = $1
        `,
        [customerId]
      );
      const total = parseInt(countResult.rows[0].total, 10) || 0;
      if (total >= maxStoreConnections) {
        return res
          .status(400)
          .send('Maximum number of store connections reached for this customer');
      }
    }

    await query(
      `
        INSERT INTO store_connections (customer_id, platform, store_name, store_domain, credentials, status)
        VALUES ($1, 'shopify', NULL, $2, $3, 'active')
        ON CONFLICT (customer_id, platform, store_domain) DO UPDATE
        SET credentials = EXCLUDED.credentials,
            status = 'active',
            updated_at = NOW()
      `,
      [
        customerId,
        shop,
        {
          shopDomain: shop,
          accessToken,
          apiVersion: '2024-01',
        },
      ]
    );

    const frontendUrl =
      process.env.FRONTEND_URL || 'https://app.replypilot.dk';
    return res.redirect(
      `${frontendUrl.replace(/\/$/, '')}/settings?shopify=connected`
    );
  } catch (err) {
    logError('Shopify OAuth callback error', { error: err?.message });
    return res.status(500).send('Shopify OAuth callback error');
  }
});

app.get('/api/tenant/shops', async (req, res) => {
  try {
    await tenantAuth(req, res, async () => {
      const { customerId } = req.tenant;
      const result = await query(
        `
          SELECT
            id,
            platform,
            store_name,
            store_domain,
            status,
            support_emails,
            last_sync_at,
            created_at,
            updated_at
          FROM store_connections
          WHERE customer_id = $1
          ORDER BY created_at DESC
        `,
        [customerId]
      );
      res.json({ data: result.rows });
    });
  } catch (err) {
    logError('Failed to list tenant shops', { error: err?.message });
    res.status(500).json({ error: 'Unable to list shops' });
  }
});

app.post('/api/tenant/shops/:id/sync', async (req, res) => {
  try {
    await tenantAuth(req, res, async () => {
      const { customerId } = req.tenant;
      const { id } = req.params;

      const row = await query(
        `
          SELECT id, status
          FROM store_connections
          WHERE id = $1 AND customer_id = $2
          LIMIT 1
        `,
        [id, customerId]
      );
      if (row.rowCount === 0) {
        return res
          .status(404)
          .json({ error: 'Store connection not found' });
      }

      const connection = row.rows[0];
      if (connection.status !== 'active') {
        return res.status(400).json({ error: 'Store connection is inactive' });
      }

      const basePayload = {
        storeConnectionId: id,
        customerId,
        createdAt: Date.now(),
      };

      await enqueueJob('shop_sync_queue', {
        ...basePayload,
        type: 'shop_sync_products',
        page: 1,
        perPage: 50,
      });

      await enqueueJob('shop_sync_queue', {
        ...basePayload,
        type: 'shop_sync_orders',
        page: 1,
        perPage: 50,
      });

      res.json({ success: true, queued: true });
    });
  } catch (err) {
    logError('Failed to trigger tenant shop sync', { error: err?.message });
    res.status(500).json({ error: 'Unable to trigger sync' });
  }
});

if (process.argv[1] && process.argv[1].endsWith('tenant/index.mjs')) {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Tenant API server running on port ${port}`);
  });
}

export default app;

