import { query, withTransaction } from '../utils/db.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { createShopIntegrationFromConnection } from './shopIntegration.mjs';

/**
 * Load a store connection by id, ensuring it belongs to the given customer.
 */
export const getStoreConnectionById = async (customerId, storeConnectionId) => {
  const result = await query(
    `
      SELECT *
      FROM store_connections
      WHERE id = $1
        AND customer_id = $2
      LIMIT 1
    `,
    [storeConnectionId, customerId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
};

/**
 * Upsert product, collections, customer and order records from a normalized
 * integration payload into the local store_* tables.
 */
export const syncProductsBatch = async (storeConnectionId, products) => {
  if (!Array.isArray(products) || products.length === 0) {
    return { success: true, count: 0 };
  }

  return withTransaction(async (client) => {
    for (const p of products) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `
          INSERT INTO store_products (
            store_connection_id,
            external_id,
            sku,
            name,
            description,
            price,
            currency,
            stock_qty,
            url,
            image_url,
            meta
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (store_connection_id, external_id) DO UPDATE
          SET
            sku = EXCLUDED.sku,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            price = EXCLUDED.price,
            currency = EXCLUDED.currency,
            stock_qty = EXCLUDED.stock_qty,
            url = EXCLUDED.url,
            image_url = EXCLUDED.image_url,
            meta = EXCLUDED.meta,
            updated_at = NOW()
        `,
        [
          storeConnectionId,
          p.externalId,
          p.sku || null,
          p.name || '',
          p.description || '',
          p.price,
          p.currency || null,
          p.stockQty,
          p.url || null,
          p.imageUrl || null,
          p.raw || {},
        ]
      );
    }

    logInfo('Synced products batch', {
      storeConnectionId,
      count: products.length,
    });

    return { success: true, count: products.length };
  });
};

export const syncOrdersBatch = async (storeConnectionId, orders) => {
  if (!Array.isArray(orders) || orders.length === 0) {
    return { success: true, count: 0 };
  }

  return withTransaction(async (client) => {
    for (const o of orders) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `
          INSERT INTO store_orders (
            store_connection_id,
            external_id,
            status,
            currency,
            total,
            subtotal,
            created_at_shop,
            updated_at_shop,
            customer_external_id,
            email,
            meta,
            synced_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
          ON CONFLICT (store_connection_id, external_id) DO UPDATE
          SET
            status = EXCLUDED.status,
            currency = EXCLUDED.currency,
            total = EXCLUDED.total,
            subtotal = EXCLUDED.subtotal,
            created_at_shop = EXCLUDED.created_at_shop,
            updated_at_shop = EXCLUDED.updated_at_shop,
            customer_external_id = EXCLUDED.customer_external_id,
            email = EXCLUDED.email,
            meta = EXCLUDED.meta,
            synced_at = NOW(),
            updated_at = NOW()
        `,
        [
          storeConnectionId,
          o.externalId,
          o.status || null,
          o.currency || null,
          o.total,
          o.subtotal,
          o.createdAtShop,
          o.updatedAtShop,
          o.customerExternalId || null,
          o.email || null,
          o.raw || {},
        ]
      );
    }

    logInfo('Synced orders batch', {
      storeConnectionId,
      count: orders.length,
    });

    return { success: true, count: orders.length };
  });
};

export const syncCustomersBatch = async (storeConnectionId, customers) => {
  if (!Array.isArray(customers) || customers.length === 0) {
    return { success: true, count: 0 };
  }

  return withTransaction(async (client) => {
    for (const c of customers) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `
          INSERT INTO store_customers (
            store_connection_id,
            external_id,
            email,
            name,
            phone,
            meta
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (store_connection_id, external_id) DO UPDATE
          SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            meta = EXCLUDED.meta,
            updated_at = NOW()
        `,
        [
          storeConnectionId,
          c.externalId,
          c.email || null,
          c.name || null,
          c.phone || null,
          c.raw || {},
        ]
      );
    }

    logInfo('Synced customers batch', {
      storeConnectionId,
      count: customers.length,
    });

    return { success: true, count: customers.length };
  });
};

/**
 * High-level helper used by workers to run a product sync for a single
 * store connection, handling integration instantiation and logging.
 */
export const runProductSync = async ({ storeConnectionId, customerId, page = 1, perPage = 50, updatedAfter }) => {
  const connectionResult = await query(
    `
      SELECT *
      FROM store_connections
      WHERE id = $1
        AND customer_id = $2
      LIMIT 1
    `,
    [storeConnectionId, customerId]
  );

  if (connectionResult.rowCount === 0) {
    logError('Store connection not found for product sync', {
      storeConnectionId,
      customerId,
    });
    return { success: false, reason: 'store_connection_not_found' };
  }

  const connection = connectionResult.rows[0];
  const integration = createShopIntegrationFromConnection(connection);

  const products = await integration.fetchProducts({ page, perPage, updatedAfter });
  const result = await syncProductsBatch(storeConnectionId, products);

  await query(
    `
      UPDATE store_connections
      SET last_sync_at = NOW()
      WHERE id = $1
    `,
    [storeConnectionId]
  );

  return { success: true, count: result.count };
};

export const runOrderSync = async ({ storeConnectionId, customerId, page = 1, perPage = 50, updatedAfter, email }) => {
  const connectionResult = await query(
    `
      SELECT *
      FROM store_connections
      WHERE id = $1
        AND customer_id = $2
      LIMIT 1
    `,
    [storeConnectionId, customerId]
  );

  if (connectionResult.rowCount === 0) {
    logError('Store connection not found for order sync', {
      storeConnectionId,
      customerId,
    });
    return { success: false, reason: 'store_connection_not_found' };
  }

  const connection = connectionResult.rows[0];
  const integration = createShopIntegrationFromConnection(connection);

  const orders = await integration.fetchOrders({ page, perPage, updatedAfter, email });
  const result = await syncOrdersBatch(storeConnectionId, orders);

  await query(
    `
      UPDATE store_connections
      SET last_sync_at = NOW()
      WHERE id = $1
    `,
    [storeConnectionId]
  );

  return { success: true, count: result.count };
};

export const lookupOrderByEmailAndNumber = async ({ customerId, email, orderNumber }) => {
  if (!email && !orderNumber) {
    return null;
  }

  const result = await query(
    `
      SELECT o.*, sc.platform, sc.store_name, sc.store_domain
      FROM store_orders o
      JOIN store_connections sc ON sc.id = o.store_connection_id
      WHERE sc.customer_id = $1
        AND ($2::TEXT IS NULL OR lower(o.email) = lower($2))
        AND ($3::TEXT IS NULL OR o.external_id = $3)
      ORDER BY o.created_at_shop DESC NULLS LAST
      LIMIT 1
    `,
    [customerId, email || null, orderNumber || null]
  );

  return result.rows[0] || null;
};

export const searchProductsForCustomer = async ({ customerId, queryText, limit = 10 }) => {
  if (!queryText) {
    return [];
  }

  const result = await query(
    `
      SELECT
        p.*,
        sc.platform,
        sc.store_name,
        sc.store_domain
      FROM store_products p
      JOIN store_connections sc ON sc.id = p.store_connection_id
      WHERE sc.customer_id = $1
        AND (
          p.sku ILIKE $2
          OR p.name ILIKE $2
        )
      ORDER BY p.updated_at DESC
      LIMIT $3
    `,
    [customerId, `%${queryText}%`, limit]
  );

  return result.rows;
};

export const getProductDetailsForCustomer = async ({ customerId, externalId }) => {
  if (!externalId) return null;

  const result = await query(
    `
      SELECT
        p.*,
        sc.platform,
        sc.store_name,
        sc.store_domain
      FROM store_products p
      JOIN store_connections sc ON sc.id = p.store_connection_id
      WHERE sc.customer_id = $1
        AND p.external_id = $2
      LIMIT 1
    `,
    [customerId, externalId]
  );

  return result.rows[0] || null;
};

export const listRecentOrdersForCustomer = async ({ customerId, email, limit = 5 }) => {
  if (!email) return [];

  const result = await query(
    `
      SELECT
        o.*,
        sc.platform,
        sc.store_name,
        sc.store_domain
      FROM store_orders o
      JOIN store_connections sc ON sc.id = o.store_connection_id
      WHERE sc.customer_id = $1
        AND lower(o.email) = lower($2)
      ORDER BY o.created_at_shop DESC NULLS LAST
      LIMIT $3
    `,
    [customerId, email, limit]
  );

  return result.rows;
};

