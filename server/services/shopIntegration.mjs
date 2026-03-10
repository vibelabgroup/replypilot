import { query } from '../utils/db.mjs';
import { logError } from '../utils/logger.mjs';
import { createWooIntegration } from './wooIntegration.mjs';
import { createShopifyIntegration } from './shopifyIntegration.mjs';

/**
 * Factory that returns a concrete shop integration implementation
 * for a given store_connection row.
 *
 * A ShopIntegration implementation must expose:
 * - fetchProducts(params)
 * - fetchProductById(id)
 * - fetchOrders(params)
 * - fetchOrderById(id)
 * - fetchCustomerByEmail(email)
 * - fetchCustomerById(id)
 */
export const createShopIntegrationFromConnection = (connection) => {
  if (!connection) {
    throw new Error('Missing store connection');
  }

  const platform = connection.platform;
  const credentials = connection.credentials || {};

  if (platform === 'woo') {
    return createWooIntegration({
      restUrl: credentials.restUrl,
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
    });
  }

  if (platform === 'shopify') {
    return createShopifyIntegration({
      shopDomain: credentials.shopDomain,
      accessToken: credentials.accessToken,
      apiVersion: credentials.apiVersion,
    });
  }

  throw new Error(`Unsupported store platform: ${platform}`);
};

/**
 * Load a store_connection row by id and return a concrete integration.
 */
export const getIntegrationForStoreConnection = async (storeConnectionId) => {
  const result = await query(
    `
      SELECT id,
             customer_id,
             platform,
             store_name,
             store_domain,
             credentials,
             status,
             last_sync_at
      FROM store_connections
      WHERE id = $1
      LIMIT 1
    `,
    [storeConnectionId]
  );

  if (result.rowCount === 0) {
    throw new Error('Store connection not found');
  }

  return createShopIntegrationFromConnection(result.rows[0]);
};

/**
 * Safe helper that returns null instead of throwing if a connection
 * cannot be loaded or an integration cannot be created.
 */
export const tryGetIntegrationForStoreConnection = async (storeConnectionId) => {
  try {
    return await getIntegrationForStoreConnection(storeConnectionId);
  } catch (error) {
    logError('Failed to create shop integration', {
      storeConnectionId,
      error: error?.message,
    });
    return null;
  }
};

