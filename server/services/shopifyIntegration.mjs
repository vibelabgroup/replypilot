import { logError, logDebug } from '../utils/logger.mjs';

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildShopifyUrl = (shopDomain, apiVersion, path, query = {}) => {
  const base = `https://${shopDomain}/admin/api/${apiVersion || '2024-01'}/`;
  const url = new URL(path.replace(/^\//, ''), base);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
};

const shopifyRequest = async ({ shopDomain, accessToken, apiVersion }, path, { query = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  if (!shopDomain || !accessToken) {
    throw new Error('Shopify credentials not configured');
  }

  const url = buildShopifyUrl(shopDomain, apiVersion, path, query);

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logDebug('Shopify API request', { url, attempt });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const callLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
      if (callLimit) {
        logDebug('Shopify call limit header', { callLimit });
      }

      if (res.status === 429 || res.status >= 500) {
        const body = await res.text().catch(() => '');
        lastError = new Error(`Shopify API temporary error ${res.status}: ${body}`);
        const delay = Math.min(2000 * attempt, 10000);
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Shopify API error ${res.status}: ${body}`);
      }

      return await res.json();
    } catch (error) {
      lastError = error;
      logError('Shopify API request failed', {
        url,
        attempt,
        error: error?.message,
      });
      if (attempt < MAX_RETRIES) {
        await sleep(500 * attempt);
      }
    }
  }

  throw lastError || new Error('Shopify API request failed');
};

export const createShopifyIntegration = ({ shopDomain, accessToken, apiVersion }) => {
  const clientConfig = { shopDomain, accessToken, apiVersion };

  const fetchProducts = async ({ pageInfo, limit = 50 } = {}) => {
    const data = await shopifyRequest(clientConfig, '/products.json', {
      query: {
        limit,
        ...(pageInfo ? { page_info: pageInfo } : {}),
      },
    });

    const products = Array.isArray(data.products) ? data.products : [];
    return products.map((p) => ({
      externalId: String(p.id),
      sku: Array.isArray(p.variants) && p.variants[0]?.sku ? p.variants[0].sku : null,
      name: p.title || '',
      description: p.body_html || '',
      price: Array.isArray(p.variants) && p.variants[0]?.price ? Number(p.variants[0].price) : null,
      currency: p.presentment_prices?.[0]?.price?.currency_code || null,
      stockQty:
        Array.isArray(p.variants) && typeof p.variants[0]?.inventory_quantity === 'number'
          ? p.variants[0].inventory_quantity
          : null,
      url: null,
      imageUrl: Array.isArray(p.images) && p.images[0]?.src ? p.images[0].src : null,
      raw: p,
    }));
  };

  const fetchProductById = async (id) => {
    const data = await shopifyRequest(clientConfig, `/products/${id}.json`);
    const p = data.product || data;
    return {
      externalId: String(p.id),
      sku: Array.isArray(p.variants) && p.variants[0]?.sku ? p.variants[0].sku : null,
      name: p.title || '',
      description: p.body_html || '',
      price: Array.isArray(p.variants) && p.variants[0]?.price ? Number(p.variants[0].price) : null,
      currency: p.presentment_prices?.[0]?.price?.currency_code || null,
      stockQty:
        Array.isArray(p.variants) && typeof p.variants[0]?.inventory_quantity === 'number'
          ? p.variants[0].inventory_quantity
          : null,
      url: null,
      imageUrl: Array.isArray(p.images) && p.images[0]?.src ? p.images[0].src : null,
      raw: p,
    };
  };

  const fetchOrders = async ({ status = 'any', limit = 50, createdAfter, email } = {}) => {
    const data = await shopifyRequest(clientConfig, '/orders.json', {
      query: {
        status,
        limit,
        ...(createdAfter ? { created_at_min: new Date(createdAfter).toISOString() } : {}),
        ...(email ? { email } : {}),
      },
    });

    const orders = Array.isArray(data.orders) ? data.orders : [];
    return orders.map((o) => ({
      externalId: String(o.id),
      status: o.financial_status || o.fulfillment_status || null,
      currency: o.currency || null,
      total: o.total_price ? Number(o.total_price) : null,
      subtotal: o.subtotal_price ? Number(o.subtotal_price) : null,
      createdAtShop: o.created_at ? new Date(o.created_at).toISOString() : null,
      updatedAtShop: o.updated_at ? new Date(o.updated_at).toISOString() : null,
      customerExternalId: o.customer?.id ? String(o.customer.id) : null,
      email: o.email || o.customer?.email || null,
      raw: o,
    }));
  };

  const fetchOrderById = async (id) => {
    const data = await shopifyRequest(clientConfig, `/orders/${id}.json`);
    const o = data.order || data;
    return {
      externalId: String(o.id),
      status: o.financial_status || o.fulfillment_status || null,
      currency: o.currency || null,
      total: o.total_price ? Number(o.total_price) : null,
      subtotal: o.subtotal_price ? Number(o.subtotal_price) : null,
      createdAtShop: o.created_at ? new Date(o.created_at).toISOString() : null,
      updatedAtShop: o.updated_at ? new Date(o.updated_at).toISOString() : null,
      customerExternalId: o.customer?.id ? String(o.customer.id) : null,
      email: o.email || o.customer?.email || null,
      raw: o,
    };
  };

  const fetchCustomerByEmail = async (email) => {
    if (!email) return [];
    const data = await shopifyRequest(clientConfig, '/customers/search.json', {
      query: { query: `email:${email}` },
    });
    const customers = Array.isArray(data.customers) ? data.customers : [];

    return customers.map((c) => ({
      externalId: String(c.id),
      email: c.email || null,
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || null,
      phone: c.phone || null,
      raw: c,
    }));
  };

  const fetchCustomerById = async (id) => {
    const data = await shopifyRequest(clientConfig, `/customers/${id}.json`);
    const c = data.customer || data;
    return {
      externalId: String(c.id),
      email: c.email || null,
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || null,
      phone: c.phone || null,
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

