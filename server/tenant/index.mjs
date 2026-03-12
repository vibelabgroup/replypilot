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

