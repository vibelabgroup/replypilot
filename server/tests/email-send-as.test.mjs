// Comprehensive test suite for Gmail send-as aliases functionality
// File: server/tests/email-send-as.test.mjs

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { 
  discoverGmailSendAsAliases,
  syncSendAsAliasesToDatabase,
  getActiveSendAsAliases,
  resolveSendAsAlias,
} from '../services/emailSendAsService.mjs';
import { 
  sendEmailWithSendAs,
  testSendAsAlias,
} from '../services/emailSendServiceEnhanced.mjs';
import { 
  configureStoreEmailRouting,
  getStoreEmailRouting,
  suggestEmailRouting,
  validateEmailRouting,
} from '../services/storeEmailRoutingService.mjs';
import { 
  handleEmailSendError,
  classifyEmailError,
  EmailErrorTypes,
} from '../services/emailErrorHandlingService.mjs';
import { query } from '../utils/db.mjs';

describe('Gmail Send-As Aliases', () => {
  let testCustomerId;
  let testEmailAccountId;
  let testStoreConnectionId;
  let testAliasId;

  beforeEach(async () => {
    // Create test customer
    const customerResult = await query(
      `INSERT INTO customers (email, name, status) VALUES ($1, $2, $3) RETURNING id`,
      ['test@example.com', 'Test Customer', 'trial']
    );
    testCustomerId = customerResult.rows[0].id;

    // Create test email account
    const accountResult = await query(
      `INSERT INTO email_accounts (
        customer_id, provider, email_address, display_name, 
        access_token, refresh_token, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [testCustomerId, 'gmail', 'test@gmail.com', 'Test Account', 'fake_token', 'fake_refresh', 'active']
    );
    testEmailAccountId = accountResult.rows[0].id;

    // Create test store connection
    const storeResult = await query(
      `INSERT INTO store_connections (
        customer_id, platform, store_name, store_domain, status
      ) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [testCustomerId, 'shopify', 'Test Store', 'test-store.com', 'active']
    );
    testStoreConnectionId = storeResult.rows[0].id;
  });

  afterEach(async () => {
    // Clean up test data
    await query('DELETE FROM email_error_log WHERE customer_id = $1', [testCustomerId]);
    await query('DELETE FROM email_send_as_aliases WHERE email_account_id = $1', [testEmailAccountId]);
    await query('DELETE FROM store_connections WHERE id = $1', [testStoreConnectionId]);
    await query('DELETE FROM email_accounts WHERE id = $1', [testEmailAccountId]);
    await query('DELETE FROM customers WHERE id = $1', [testCustomerId]);
  });

  describe('Alias Discovery and Sync', () => {
    it('should discover Gmail send-as aliases', async () => {
      // Mock Gmail API response
      const mockGmailResponse = {
        sendAs: [
          {
            sendAsEmail: 'test@gmail.com',
            displayName: 'Test Account',
            isPrimary: true,
            isDefault: true,
            verificationStatus: 'accepted',
          },
          {
            sendAsEmail: 'support@test-store.com',
            displayName: 'Test Store Support',
            replyToAddress: 'support@test-store.com',
            isPrimary: false,
            isDefault: false,
            verificationStatus: 'accepted',
          },
          {
            sendAsEmail: 'pending@test-store.com',
            displayName: 'Pending Alias',
            verificationStatus: 'pending',
          },
        ],
      };

      // Mock fetch for Gmail API
      global.fetch = async (url) => {
        if (url.includes('sendAs')) {
          return {
            ok: true,
            json: async () => mockGmailResponse,
          };
        }
        throw new Error('Unexpected fetch call');
      };

      const aliases = await discoverGmailSendAsAliases(testEmailAccountId);
      
      assert.strictEqual(aliases.length, 3);
      assert.strictEqual(aliases[0].send_as_email, 'test@gmail.com');
      assert.strictEqual(aliases[0].is_primary, true);
      assert.strictEqual(aliases[1].send_as_email, 'support@test-store.com');
      assert.strictEqual(aliases[1].verification_status, 'accepted');
      assert.strictEqual(aliases[2].verification_status, 'pending');
    });

    it('should sync aliases to database', async () => {
      const aliases = [
        {
          send_as_email: 'test@gmail.com',
          display_name: 'Test Account',
          is_primary: true,
          is_default: true,
          verification_status: 'accepted',
        },
        {
          send_as_email: 'support@test-store.com',
          display_name: 'Support',
          verification_status: 'accepted',
        },
      ];

      const syncResult = await syncSendAsAliasesToDatabase(testEmailAccountId, aliases);
      
      assert.strictEqual(syncResult.created, 2);
      assert.strictEqual(syncResult.updated, 0);
      assert.strictEqual(syncResult.deactivated, 0);

      // Verify aliases were created
      const dbAliases = await getActiveSendAsAliases(testEmailAccountId);
      assert.strictEqual(dbAliases.length, 2);
    });

    it('should handle alias updates and deactivation', async () => {
      // Initial sync
      const initialAliases = [
        { send_as_email: 'test@gmail.com', verification_status: 'accepted', is_primary: true },
        { send_as_email: 'old@test-store.com', verification_status: 'accepted' },
      ];
      await syncSendAsAliasesToDatabase(testEmailAccountId, initialAliases);

      // Updated sync (one removed, one updated)
      const updatedAliases = [
        { send_as_email: 'test@gmail.com', verification_status: 'accepted', is_primary: true },
        { send_as_email: 'new@test-store.com', display_name: 'New Support', verification_status: 'accepted' },
      ];
      const syncResult = await syncSendAsAliasesToDatabase(testEmailAccountId, updatedAliases);
      
      assert.strictEqual(syncResult.created, 1); // new alias
      assert.strictEqual(syncResult.deactivated, 1); // old alias
    });
  });

  describe('Alias Resolution', () => {
    beforeEach(async () => {
      // Create test aliases
      await query(
        `INSERT INTO email_send_as_aliases (
          email_account_id, send_as_email, display_name, is_primary, is_default, verification_status
        ) VALUES ($1, $2, $3, $4, $5, $6), ($1, $7, $8, $9, $10, $11)`,
        [
          testEmailAccountId,
          'primary@gmail.com',
          'Primary Account',
          true,
          true,
          'accepted',
          'support@test-store.com',
          'Store Support',
          false,
          false,
          'accepted',
        ]
      );
    });

    it('should resolve exact alias match', async () => {
      const alias = await resolveSendAsAlias(testEmailAccountId, 'support@test-store.com');
      
      assert(alias);
      assert.strictEqual(alias.send_as_email, 'support@test-store.com');
      assert.strictEqual(alias.display_name, 'Store Support');
    });

    it('should fall back to default alias', async () => {
      const alias = await resolveSendAsAlias(testEmailAccountId, 'unknown@test-store.com');
      
      assert(alias);
      assert.strictEqual(alias.send_as_email, 'primary@gmail.com');
      assert.strictEqual(alias.is_default, true);
    });
  });

  describe('Store Email Routing', () => {
    beforeEach(async () => {
      // Create test alias
      const aliasResult = await query(
        `INSERT INTO email_send_as_aliases (
          email_account_id, send_as_email, display_name, verification_status, is_default
        ) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [testEmailAccountId, 'support@test-store.com', 'Store Support', 'accepted', false]
      );
      testAliasId = aliasResult.rows[0].id;
    });

    it('should configure store email routing', async () => {
      const config = {
        defaultFromEmail: 'support@test-store.com',
        replyToEmail: 'replies@test-store.com',
        emailSignature: 'Best regards,\nTest Store Team',
      };

      const result = await configureStoreEmailRouting(testStoreConnectionId, config);
      
      assert.strictEqual(result.default_from_email, 'support@test-store.com');
      assert.strictEqual(result.reply_to_email, 'replies@test-store.com');
      assert.strictEqual(result.email_signature, config.emailSignature);
    });

    it('should suggest email routing based on available aliases', async () => {
      // Add support email to store connection
      await query(
        `UPDATE store_connections SET support_emails = $1 WHERE id = $2`,
        ['["support@test-store.com"]', testStoreConnectionId]
      );

      const suggestions = await suggestEmailRouting(testStoreConnectionId);
      
      assert(suggestions.suggestions.length > 0);
      const supportMatch = suggestions.suggestions.find(s => s.type === 'support_email_match');
      assert(supportMatch);
      assert.strictEqual(supportMatch.confidence, 'high');
    });

    it('should validate email routing configuration', async () => {
      const validConfig = {
        defaultFromEmail: 'support@test-store.com',
        emailAccountId: testEmailAccountId,
      };

      const validation = await validateEmailRouting(testStoreConnectionId, validConfig);
      
      assert(validation.isValid);
      assert.strictEqual(validation.issues.length, 0);
    });

    it('should reject invalid email routing', async () => {
      const invalidConfig = {
        defaultFromEmail: 'nonexistent@test-store.com',
        emailAccountId: testEmailAccountId,
      };

      const validation = await validateEmailRouting(testStoreConnectionId, invalidConfig);
      
      assert(!validation.isValid);
      assert(validation.issues.some(issue => issue.severity === 'error'));
    });
  });

  describe('Email Sending with Send-As', () => {
    beforeEach(async () => {
      // Create test alias
      await query(
        `INSERT INTO email_send_as_aliases (
          email_account_id, send_as_email, display_name, verification_status
        ) VALUES ($1, $2, $3, $4)`,
        [testEmailAccountId, 'support@test-store.com', 'Store Support', 'accepted']
      );
    });

    it('should send email using send-as alias', async () => {
      // Mock successful Gmail API response
      global.fetch = async (url) => {
        if (url.includes('messages/send')) {
          return {
            ok: true,
            json: async () => ({ id: 'msg_123', threadId: 'thread_456' }),
          };
        }
        throw new Error('Unexpected fetch call');
      };

      const result = await sendEmailWithSendAs({
        customerId: testCustomerId,
        emailAccountId: testEmailAccountId,
        storeConnectionId: testStoreConnectionId,
        to: 'customer@example.com',
        subject: 'Test Subject',
        bodyPlain: 'Test message',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.from, 'support@test-store.com');
      assert.strictEqual(result.sendAsAlias, 'support@test-store.com');
    });

    it('should fall back to primary account for unverified aliases', async () => {
      // Configure store with unverified alias
      await configureStoreEmailRouting(testStoreConnectionId, {
        defaultFromEmail: 'unverified@test-store.com',
      });

      // Mock successful Gmail API response
      global.fetch = async (url) => {
        if (url.includes('messages/send')) {
          return {
            ok: true,
            json: async () => ({ id: 'msg_123', threadId: 'thread_456' }),
          };
        }
        throw new Error('Unexpected fetch call');
      };

      const result = await sendEmailWithSendAs({
        customerId: testCustomerId,
        emailAccountId: testEmailAccountId,
        storeConnectionId: testStoreConnectionId,
        to: 'customer@example.com',
        subject: 'Test Subject',
        bodyPlain: 'Test message',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.from, 'test@gmail.com'); // Falls back to primary
      assert.strictEqual(result.sendAsAlias, null);
    });
  });

  describe('Error Handling', () => {
    it('should classify Gmail authentication errors', () => {
      const error = new Error('Invalid credentials');
      const errorType = classifyEmailError(error, 401);
      
      assert.strictEqual(errorType, EmailErrorTypes.AUTHENTICATION_ERROR);
    });

    it('should classify verification errors', () => {
      const error = new Error('Send-as address not verified');
      const errorType = classifyEmailError(error);
      
      assert.strictEqual(errorType, EmailErrorTypes.VERIFICATION_ERROR);
    });

    it('should classify rate limit errors', () => {
      const error = new Error('User-rate limit exceeded');
      const errorType = classifyEmailError(error, 429);
      
      assert.strictEqual(errorType, EmailErrorTypes.RATE_LIMIT_ERROR);
    });

    it('should handle authentication errors with token refresh', async () => {
      const error = new Error('Invalid credentials');
      const context = {
        emailAccountId: testEmailAccountId,
        customerId: testCustomerId,
        attempt: 1,
      };

      // Mock token refresh success
      const result = await handleEmailSendError(error, context);
      
      assert(result.shouldRetry);
      assert.strictEqual(result.fallbackStrategy, 'token_refresh');
    });

    it('should handle verification errors with alias fallback', async () => {
      // Create verified fallback alias
      await query(
        `INSERT INTO email_send_as_aliases (
          email_account_id, send_as_email, verification_status, is_primary
        ) VALUES ($1, $2, $3, $4)`,
        [testEmailAccountId, 'fallback@test-store.com', 'accepted', true]
      );

      const error = new Error('Send-as address not verified');
      const context = {
        emailAccountId: testEmailAccountId,
        originalAlias: { send_as_email: 'unverified@test-store.com', id: 'alias_123' },
      };

      const result = await handleEmailSendError(error, context);
      
      assert(result.shouldRetry);
      assert.strictEqual(result.fallbackStrategy, 'alias_fallback');
      assert(result.fallbackAlias);
      assert.strictEqual(result.fallbackAlias.send_as_email, 'fallback@test-store.com');
    });

    it('should implement exponential backoff for rate limits', async () => {
      const error = new Error('User-rate limit exceeded');
      const context = { attempt: 2 };

      const result = await handleEmailSendError(error, context);
      
      assert(result.shouldRetry);
      assert.strictEqual(result.fallbackStrategy, 'exponential_backoff');
      assert.strictEqual(result.retryDelay, 15000); // 5s * 3^(2-1) = 15s
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete email routing workflow', async () => {
      // 1. Set up aliases
      const aliases = [
        { send_as_email: 'primary@gmail.com', verification_status: 'accepted', is_primary: true },
        { send_as_email: 'support@test-store.com', verification_status: 'accepted' },
      ];
      await syncSendAsAliasesToDatabase(testEmailAccountId, aliases);

      // 2. Configure store routing
      await configureStoreEmailRouting(testStoreConnectionId, {
        defaultFromEmail: 'support@test-store.com',
        replyToEmail: 'replies@test-store.com',
      });

      // 3. Mock successful email sending
      global.fetch = async (url) => {
        if (url.includes('messages/send')) {
          return {
            ok: true,
            json: async () => ({ id: 'msg_123', threadId: 'thread_456' }),
          };
        }
        throw new Error('Unexpected fetch call');
      };

      // 4. Send email
      const result = await sendEmailWithSendAs({
        customerId: testCustomerId,
        emailAccountId: testEmailAccountId,
        storeConnectionId: testStoreConnectionId,
        to: 'customer@example.com',
        subject: 'Order Update',
        bodyPlain: 'Your order has been shipped!',
      });

      // 5. Verify results
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.from, 'support@test-store.com');
      assert.strictEqual(result.sendAsAlias, 'support@test-store.com');

      // 6. Verify message was recorded
      const messageResult = await query(
        `SELECT actual_from_address, send_as_alias_id FROM email_messages 
         WHERE email_account_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [testEmailAccountId]
      );
      assert.strictEqual(messageResult.rowCount, 1);
      assert.strictEqual(messageResult.rows[0].actual_from_address, 'support@test-store.com');
    });
  });
});

describe('Error Classification Edge Cases', () => {
  it('should handle unknown errors gracefully', () => {
    const error = new Error('Something completely unexpected happened');
    const errorType = classifyEmailError(error);
    
    assert.strictEqual(errorType, EmailErrorTypes.UNKNOWN_ERROR);
  });

  it('should classify network errors correctly', () => {
    const error = new Error('Network timeout occurred');
    const errorType = classifyEmailError(error);
    
    assert.strictEqual(errorType, EmailErrorTypes.NETWORK_ERROR);
  });

  it('should handle mixed error patterns', () => {
    const error = new Error('Gmail API network timeout with invalid credentials');
    const errorType = classifyEmailError(error);
    
    // Should prioritize authentication error as it's more specific
    assert.strictEqual(errorType, EmailErrorTypes.AUTHENTICATION_ERROR);
  });
});
