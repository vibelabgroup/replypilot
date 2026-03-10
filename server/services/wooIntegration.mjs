import { logError, logDebug } from '../utils/logger.mjs';

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildWooUrl = (baseUrl, path, query = {}) => {
  const url = new URL(path.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
};

const wooRequest = async ({ restUrl, apiKey, apiSecret }, path, { query = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  if (!restUrl || !apiKey || !apiSecret) {
    throw new Error('WooCommerce credentials not configured');
  }

  const url = buildWooUrl(restUrl, path, query);

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logDebug('WooCommerce API request', { url, attempt });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 429 || res.status >= 500) {
        const body = await res.text().catch(() => '');
        lastError = new Error(`WooCommerce API temporary error ${res.status}: ${body}`);
        const delay = Math.min(2000 * attempt, 10000);
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`WooCommerce API error ${res.status}: ${body}`);
      }

      return await res.json();
    } catch (error) {
      lastError = error;
      logError('WooCommerce API request failed', {
        url,
        attempt,
        error: error?.message,
      });
      if (attempt < MAX_RETRIES) {
        await sleep(500 * attempt);
      }
    }
  }

  throw lastError || new Error('WooCommerce API request failed');
};

export const createWooIntegration = ({ restUrl, apiKey, apiSecret }) => {
  const clientConfig = { restUrl, apiKey, apiSecret };

  const fetchProducts = async ({ page = 1, perPage = 50, updatedAfter } = {}) => {
    const data = await wooRequest(clientConfig, '/products', {
      query: {
        page,
        per_page: perPage,
        ...(updatedAfter ? { after: new Date(updatedAfter).toISOString() } : {}),
      },
    });

    return data.map((p) => ({
      externalId: String(p.id),
      sku: p.sku || null,
      name: p.name || '',
      description: p.description || p.short_description || '',
      price: p.price ? Number(p.price) : null,
      currency: p.currency || null,
      stockQty: typeof p.stock_quantity === 'number' ? p.stock_quantity : null,
      url: p.permalink || null,
      imageUrl: Array.isArray(p.images) && p.images[0]?.src ? p.images[0].src : null,
      raw: p,
    }));
  };

  const fetchProductById = async (id) => {
    const data = await wooRequest(clientConfig, `/products/${id}`);
    return {
      externalId: String(data.id),
      sku: data.sku || null,
      name: data.name || '',
      description: data.description || data.short_description || '',
      price: data.price ? Number(data.price) : null,
      currency: data.currency || null,
      stockQty: typeof data.stock_quantity === 'number' ? data.stock_quantity : null,
      url: data.permalink || null,
      imageUrl: Array.isArray(data.images) && data.images[0]?.src ? data.images[0].src : null,
      raw: data,
    };
  };

  const fetchOrders = async ({ page = 1, perPage = 50, updatedAfter, email } = {}) => {
    const data = await wooRequest(clientConfig, '/orders', {
      query: {
        page,
        per_page: perPage,
        ...(updatedAfter ? { after: new Date(updatedAfter).toISOString() } : {}),
        ...(email ? { email } : {}),
      },
    });

    return data.map((o) => ({
      externalId: String(o.id),
      status: o.status || null,
      currency: o.currency || null,
      total: o.total ? Number(o.total) : null,
      subtotal: o.subtotal ? Number(o.subtotal) : null,
      createdAtShop: o.date_created ? new Date(o.date_created).toISOString() : null,
      updatedAtShop: o.date_modified ? new Date(o.date_modified).toISOString() : null,
      customerExternalId: o.customer_id ? String(o.customer_id) : null,
      email: o.billing?.email || null,
      raw: o,
    }));
  };

  const fetchOrderById = async (id) => {
    const o = await wooRequest(clientConfig, `/orders/${id}`);
    return {
      externalId: String(o.id),
      status: o.status || null,
      currency: o.currency || null,
      total: o.total ? Number(o.total) : null,
      subtotal: o.subtotal ? Number(o.subtotal) : null,
      createdAtShop: o.date_created ? new Date(o.date_created).toISOString() : null,
      updatedAtShop: o.date_modified ? new Date(o.date_modified).toISOString() : null,
      customerExternalId: o.customer_id ? String(o.customer_id) : null,
      email: o.billing?.email || null,
      raw: o,
    };
  };

  const fetchCustomerByEmail = async (email) => {
    if (!email) return [];
    const data = await wooRequest(clientConfig, '/customers', {
      query: { email },
    });

    return data.map((c) => ({
      externalId: String(c.id),
      email: c.email || null,
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || null,
      phone: c.billing?.phone || null,
      raw: c,
    }));
  };

  const fetchCustomerById = async (id) => {
    const c = await wooRequest(clientConfig, `/customers/${id}`);
    return {
      externalId: String(c.id),
      email: c.email || null,
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || null,
      phone: c.billing?.phone || null,
      raw: c,
    };
  };

  return {
    fetchProducts,
    fetchProductById,
    fetchOrders,
    fetchOrderById,
    fetchCustomerByEmail,
    fetchCustomerById,
  };
};

