import { strict as assert } from 'assert';
import { createWooIntegration } from '../services/wooIntegration.mjs';
import { createShopifyIntegration } from '../services/shopifyIntegration.mjs';

// These tests are lightweight sanity checks around the HTTP client
// construction and mapping logic. They do not hit real APIs; instead
// they assert that the exported factories exist and can be called
// with minimal config without throwing synchronously.

describe('Shop integrations – construction', () => {
  it('creates WooIntegration without throwing when config is present', () => {
    const integration = createWooIntegration({
      restUrl: 'https://example.com/wp-json/wc/v3',
      apiKey: 'ck_test',
      apiSecret: 'cs_test',
    });
    assert.ok(integration);
    assert.equal(typeof integration.fetchProducts, 'function');
  });

  it('creates ShopifyIntegration without throwing when config is present', () => {
    const integration = createShopifyIntegration({
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'shpat_test',
      apiVersion: '2024-01',
    });
    assert.ok(integration);
    assert.equal(typeof integration.fetchProducts, 'function');
  });
});

