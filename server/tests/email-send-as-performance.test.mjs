// Performance and load testing for email send-as functionality
// File: server/tests/email-send-as-performance.test.mjs

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { performance } from 'node:perf_hooks';

describe('Email Send-As Performance Tests', () => {
  let testCustomerId;
  let testEmailAccountId;
  let testStoreConnections = [];
  let testAliases = [];

  beforeEach(async () => {
    // Create test customer
    const customerResult = await query(
      `INSERT INTO customers (email, name, status) VALUES ($1, $2, $3) RETURNING id`,
      ['perf-test@example.com', 'Performance Test Customer', 'trial']
    );
    testCustomerId = customerResult.rows[0].id;

    // Create test email account
    const accountResult = await query(
      `INSERT INTO email_accounts (
        customer_id, provider, email_address, display_name, 
        access_token, refresh_token, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [testCustomerId, 'gmail', 'perf@gmail.com', 'Perf Test', 'fake_token', 'fake_refresh', 'active']
    );
    testEmailAccountId = accountResult.rows[0].id;

    // Create multiple store connections (simulating 10 shops)
    for (let i = 1; i <= 10; i++) {
      const storeResult = await query(
        `INSERT INTO store_connections (
          customer_id, platform, store_name, store_domain, status
        ) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [testCustomerId, 'shopify', `Store ${i}`, `store${i}.com`, 'active']
      );
      testStoreConnections.push(storeResult.rows[0].id);
    }

    // Create multiple aliases (simulating email aliases for each store)
    for (let i = 1; i <= 10; i++) {
      await query(
        `INSERT INTO email_send_as_aliases (
          email_account_id, send_as_email, display_name, verification_status
        ) VALUES ($1, $2, $3, $4)`,
        [testEmailAccountId, `support@store${i}.com`, `Store ${i} Support`, 'accepted']
      );
      testAliases.push(`support@store${i}.com`);
    }
  });

  afterEach(async () => {
    // Clean up test data
    await query('DELETE FROM email_error_log WHERE customer_id = $1', [testCustomerId]);
    await query('DELETE FROM email_send_as_aliases WHERE email_account_id = $1', [testEmailAccountId]);
    await query('DELETE FROM store_connections WHERE id = ANY($1)', [testStoreConnections]);
    await query('DELETE FROM email_accounts WHERE id = $1', [testEmailAccountId]);
    await query('DELETE FROM customers WHERE id = $1', [testCustomerId]);
    
    testStoreConnections = [];
    testAliases = [];
  });

  describe('Alias Resolution Performance', () => {
    it('should resolve aliases quickly under load', async () => {
      const iterations = 1000;
      const resolutions = [];

      // Mock fetch for token validation
      global.fetch = async () => ({ ok: true, json: async () => ({}) });

      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const aliasEmail = testAliases[i % testAliases.length];
        const startTime = performance.now();
        
        const alias = await resolveSendAsAlias(testEmailAccountId, aliasEmail);
        
        const endTime = performance.now();
        resolutions.push(endTime - startTime);
        
        assert(alias);
        assert.strictEqual(alias.send_as_email, aliasEmail);
      }

      const totalTime = performance.now() - startTime;
      const avgTime = resolutions.reduce((a, b) => a + b, 0) / resolutions.length;
      const maxTime = Math.max(...resolutions);
      const p95Time = resolutions.sort((a, b) => a - b)[Math.floor(resolutions.length * 0.95)];

      console.log(`Alias Resolution Performance (${iterations} iterations):`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Average time: ${avgTime.toFixed(2)}ms`);
      console.log(`  Max time: ${maxTime.toFixed(2)}ms`);
      console.log(`  95th percentile: ${p95Time.toFixed(2)}ms`);

      // Performance assertions
      assert(avgTime < 10, `Average resolution time should be < 10ms, got ${avgTime.toFixed(2)}ms`);
      assert(p95Time < 20, `95th percentile should be < 20ms, got ${p95Time.toFixed(2)}ms`);
      assert(maxTime < 50, `Max resolution time should be < 50ms, got ${maxTime.toFixed(2)}ms`);
    });

    it('should handle concurrent alias resolution', async () => {
      const concurrency = 50;
      const iterations = 20;

      // Mock fetch for token validation
      global.fetch = async () => ({ ok: true, json: async () => ({}) });

      const startTime = performance.now();

      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        for (let j = 0; j < iterations; j++) {
          const aliasEmail = testAliases[j % testAliases.length];
          promises.push(resolveSendAsAlias(testEmailAccountId, aliasEmail));
        }
      }

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const totalOperations = concurrency * iterations;
      const avgTime = totalTime / totalOperations;
      const throughput = totalOperations / (totalTime / 1000);

      console.log(`Concurrent Alias Resolution Performance:`);
      console.log(`  Concurrency: ${concurrency}`);
      console.log(`  Iterations per thread: ${iterations}`);
      console.log(`  Total operations: ${totalOperations}`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Average time per operation: ${avgTime.toFixed(2)}ms`);
      console.log(`  Throughput: ${throughput.toFixed(2)} operations/second`);

      assert.strictEqual(results.length, totalOperations);
      assert(results.every(result => result !== null));
      assert(throughput > 100, `Throughput should be > 100 ops/sec, got ${throughput.toFixed(2)}`);
    });
  });

  describe('Email Sending Performance', () => {
    beforeEach(async () => {
      // Configure each store with its corresponding alias
      for (let i = 0; i < testStoreConnections.length; i++) {
        await configureStoreEmailRouting(testStoreConnections[i], {
          defaultFromEmail: testAliases[i],
        });
      }
    });

    it('should send emails quickly across multiple stores', async () => {
      const iterations = 100;
      const sendTimes = [];

      // Mock successful Gmail API response
      global.fetch = async (url) => {
        if (url.includes('messages/send')) {
          return {
            ok: true,
            json: async () => ({ id: `msg_${Date.now()}`, threadId: `thread_${Date.now()}` }),
          };
        }
        throw new Error('Unexpected fetch call');
      };

      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const storeIndex = i % testStoreConnections.length;
        const startTime = performance.now();

        const result = await sendEmailWithSendAs({
          customerId: testCustomerId,
          emailAccountId: testEmailAccountId,
          storeConnectionId: testStoreConnections[storeIndex],
          to: `customer${i}@example.com`,
          subject: `Test Email ${i}`,
          bodyPlain: `This is test email ${i}`,
        });

        const endTime = performance.now();
        sendTimes.push(endTime - startTime);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.from, testAliases[storeIndex]);
      }

      const totalTime = performance.now() - startTime;
      const avgTime = sendTimes.reduce((a, b) => a + b, 0) / sendTimes.length;
      const maxTime = Math.max(...sendTimes);
      const p95Time = sendTimes.sort((a, b) => a - b)[Math.floor(sendTimes.length * 0.95)];
      const throughput = iterations / (totalTime / 1000);

      console.log(`Email Sending Performance (${iterations} emails):`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Average time: ${avgTime.toFixed(2)}ms`);
      console.log(`  Max time: ${maxTime.toFixed(2)}ms`);
      console.log(`  95th percentile: ${p95Time.toFixed(2)}ms`);
      console.log(`  Throughput: ${throughput.toFixed(2)} emails/second`);

      // Performance assertions
      assert(avgTime < 100, `Average send time should be < 100ms, got ${avgTime.toFixed(2)}ms`);
      assert(p95Time < 200, `95th percentile should be < 200ms, got ${p95Time.toFixed(2)}ms`);
      assert(throughput > 10, `Throughput should be > 10 emails/sec, got ${throughput.toFixed(2)}`);
    });

    it('should handle concurrent email sending', async () => {
      const concurrency = 20;
      const iterations = 10;

      // Mock successful Gmail API response
      global.fetch = async (url) => {
        if (url.includes('messages/send')) {
          return {
            ok: true,
            json: async () => ({ id: `msg_${Date.now()}`, threadId: `thread_${Date.now()}` }),
          };
        }
        throw new Error('Unexpected fetch call');
      };

      const startTime = performance.now();

      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        for (let j = 0; j < iterations; j++) {
          const storeIndex = (i * iterations + j) % testStoreConnections.length;
          promises.push(
            sendEmailWithSendAs({
              customerId: testCustomerId,
              emailAccountId: testEmailAccountId,
              storeConnectionId: testStoreConnections[storeIndex],
              to: `customer${i}_${j}@example.com`,
              subject: `Concurrent Test ${i}-${j}`,
              bodyPlain: `Concurrent test email ${i}-${j}`,
            })
          );
        }
      }

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const totalOperations = concurrency * iterations;
      const avgTime = totalTime / totalOperations;
      const throughput = totalOperations / (totalTime / 1000);

      console.log(`Concurrent Email Sending Performance:`);
      console.log(`  Concurrency: ${concurrency}`);
      console.log(`  Iterations per thread: ${iterations}`);
      console.log(`  Total operations: ${totalOperations}`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Average time per operation: ${avgTime.toFixed(2)}ms`);
      console.log(`  Throughput: ${throughput.toFixed(2)} emails/second`);

      assert.strictEqual(results.length, totalOperations);
      assert(results.every(result => result.success));
      assert(throughput > 50, `Concurrent throughput should be > 50 emails/sec, got ${throughput.toFixed(2)}`);
    });
  });

  describe('Database Performance', () => {
    it('should handle large numbers of aliases efficiently', async () => {
      const aliasCount = 1000;
      
      // Create many aliases
      const startTime = performance.now();
      
      for (let i = 1; i <= aliasCount; i++) {
        await query(
          `INSERT INTO email_send_as_aliases (
            email_account_id, send_as_email, display_name, verification_status
          ) VALUES ($1, $2, $3, $4)`,
          [testEmailAccountId, `alias${i}@example.com`, `Alias ${i}`, 'accepted']
        );
      }
      
      const insertTime = performance.now() - startTime;
      
      // Test alias lookup performance
      const lookupStartTime = performance.now();
      
      for (let i = 1; i <= 100; i++) {
        const aliasEmail = `alias${Math.floor(Math.random() * aliasCount) + 1}@example.com`;
        const alias = await resolveSendAsAlias(testEmailAccountId, aliasEmail);
        assert(alias);
      }
      
      const lookupTime = performance.now() - lookupStartTime;
      const avgLookupTime = lookupTime / 100;
      
      console.log(`Large Alias Set Performance:`);
      console.log(`  Alias count: ${aliasCount}`);
      console.log(`  Insert time: ${insertTime.toFixed(2)}ms`);
      console.log(`  100 lookups time: ${lookupTime.toFixed(2)}ms`);
      console.log(`  Average lookup time: ${avgLookupTime.toFixed(2)}ms`);
      
      assert(avgLookupTime < 20, `Average lookup time should be < 20ms, got ${avgLookupTime.toFixed(2)}ms`);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during repeated operations', async () => {
      const iterations = 1000;
      
      // Mock fetch
      global.fetch = async () => ({ ok: true, json: async () => ({}) });
      
      const initialMemory = process.memoryUsage();
      
      for (let i = 0; i < iterations; i++) {
        const aliasEmail = testAliases[i % testAliases.length];
        await resolveSendAsAlias(testEmailAccountId, aliasEmail);
        
        // Force garbage collection every 100 iterations
        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);
      
      console.log(`Memory Usage Test:`);
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Initial heap: ${(initialMemory.heapUsed / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`  Final heap: ${(finalMemory.heapUsed / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`  Memory increase: ${memoryIncreaseMB.toFixed(2)}MB`);
      
      // Memory should not increase significantly
      assert(memoryIncreaseMB < 10, `Memory increase should be < 10MB, got ${memoryIncreaseMB.toFixed(2)}MB`);
    });
  });
});
