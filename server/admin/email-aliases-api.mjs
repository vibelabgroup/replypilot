// Enhanced admin API endpoints for email account and send-as management
// Add to server/admin/index.mjs after existing email account endpoints

// Get send-as aliases for an email account
app.get(
  '/api/admin/email-accounts/:accountId/aliases',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { accountId } = req.params;
    
    const result = await query(
      `SELECT 
        id, send_as_email, display_name, reply_to_address,
        is_primary, is_default, treat_as_alias, verification_status,
        smtp_msa, last_verified_at, is_active, created_at, updated_at
      FROM email_send_as_aliases 
      WHERE email_account_id = $1 
      ORDER BY is_primary DESC, is_default DESC, send_as_email ASC`,
      [accountId]
    );

    res.json({ data: result.rows });
  })
);

// Refresh send-as aliases from provider
app.post(
  '/api/admin/email-accounts/:accountId/refresh-aliases',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { accountId } = req.params;
    
    // Get email account
    const accountResult = await query(
      `SELECT provider, customer_id FROM email_accounts WHERE id = $1`,
      [accountId]
    );
    
    if (accountResult.rowCount === 0) {
      return res.status(404).json({ error: 'Email account not found' });
    }
    
    const account = accountResult.rows[0];
    
    if (account.provider !== 'gmail') {
      return res.status(400).json({ error: 'Send-as refresh only supported for Gmail accounts' });
    }
    
    try {
      const { discoverGmailSendAsAliases, syncSendAsAliasesToDatabase } = await import('../services/emailSendAsService.mjs');
      
      // Discover and sync aliases
      const aliases = await discoverGmailSendAsAliases(accountId);
      const syncResult = await syncSendAsAliasesToDatabase(accountId, aliases);
      
      res.json({
        success: true,
        aliasesDiscovered: aliases.length,
        syncResult,
      });
    } catch (error) {
      logError('Failed to refresh send-as aliases', { accountId, error: error.message });
      res.status(500).json({ error: 'Failed to refresh aliases' });
    }
  })
);

// Test send-as alias
app.post(
  '/api/admin/email-accounts/:accountId/test-alias',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { accountId } = req.params;
    const { aliasId } = req.body || {};
    
    if (!aliasId) {
      return res.status(400).json({ error: 'aliasId is required' });
    }
    
    try {
      const { testSendAsAlias } = await import('../services/emailSendServiceEnhanced.mjs');
      
      const result = await testSendAsAlias(accountId, aliasId);
      
      res.json({
        success: true,
        result,
      });
    } catch (error) {
      logError('Failed to test send-as alias', { accountId, aliasId, error: error.message });
      res.status(500).json({ error: 'Failed to test alias' });
    }
  })
);

// Get store email routing for customer
app.get(
  '/api/admin/customers/:id/store-email-routing',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
      const { getCustomerStoreEmailRouting } = await import('../services/storeEmailRoutingService.mjs');
      
      const stores = await getCustomerStoreEmailRouting(id);
      
      res.json({ data: stores });
    } catch (error) {
      logError('Failed to get store email routing', { customerId: id, error: error.message });
      res.status(500).json({ error: 'Failed to get store email routing' });
    }
  })
);

// Update store email routing
app.patch(
  '/api/admin/store-connections/:storeId/email-routing',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { storeId } = req.params;
    const { default_from_email, reply_to_email, email_signature } = req.body || {};
    
    try {
      const { configureStoreEmailRouting } = await import('../services/storeEmailRoutingService.mjs');
      
      const result = await configureStoreEmailRouting(storeId, {
        defaultFromEmail: default_from_email,
        replyToEmail: reply_to_email,
        emailSignature: email_signature,
      });
      
      res.json({
        success: true,
        store: result,
      });
    } catch (error) {
      logError('Failed to configure store email routing', { storeId, error: error.message });
      res.status(500).json({ error: 'Failed to configure store email routing' });
    }
  })
);

// Get email routing suggestions for a store
app.get(
  '/api/admin/store-connections/:storeId/email-suggestions',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { storeId } = req.params;
    
    try {
      const { suggestEmailRouting } = await import('../services/storeEmailRoutingService.mjs');
      
      const suggestions = await suggestEmailRouting(storeId);
      
      res.json(suggestions);
    } catch (error) {
      logError('Failed to get email routing suggestions', { storeId, error: error.message });
      res.status(500).json({ error: 'Failed to get suggestions' });
    }
  })
);

// Validate email routing configuration
app.post(
  '/api/admin/store-connections/:storeId/validate-email-routing',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { storeId } = req.params;
    const config = req.body || {};
    
    try {
      const { validateEmailRouting } = await import('../services/storeEmailRoutingService.mjs');
      
      // Get email account for this store's customer
      const accountResult = await query(
        `SELECT ea.id FROM email_accounts ea 
         JOIN store_connections sc ON sc.customer_id = ea.customer_id 
         WHERE sc.id = $1 AND ea.status = 'active' 
         ORDER BY ea.created_at DESC LIMIT 1`,
        [storeId]
      );
      
      const validation = await validateEmailRouting(storeId, {
        ...config,
        emailAccountId: accountResult.rows[0]?.id,
      });
      
      res.json(validation);
    } catch (error) {
      logError('Failed to validate email routing', { storeId, error: error.message });
      res.status(500).json({ error: 'Failed to validate configuration' });
    }
  })
);

// Bulk configure email routing for multiple stores
app.post(
  '/api/admin/customers/:id/bulk-email-routing',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { configurations } = req.body || {};
    
    if (!Array.isArray(configurations)) {
      return res.status(400).json({ error: 'configurations must be an array' });
    }
    
    try {
      const { bulkConfigureEmailRouting } = await import('../services/storeEmailRoutingService.mjs');
      
      const results = await bulkConfigureEmailRouting(configurations);
      
      res.json({
        success: true,
        results,
        summary: {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        },
      });
    } catch (error) {
      logError('Failed to bulk configure email routing', { customerId: id, error: error.message });
      res.status(500).json({ error: 'Failed to bulk configure' });
    }
  })
);

// Get email account health and statistics
app.get(
  '/api/admin/email-accounts/:accountId/health',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { accountId } = req.params;
    
    try {
      // Get account info
      const accountResult = await query(
        `SELECT 
          ea.*, 
          COUNT(esa.id) as total_aliases,
          COUNT(CASE WHEN esa.verification_status = 'accepted' AND esa.is_active = TRUE THEN 1 END) as verified_aliases,
          COUNT(CASE WHEN esa.is_active = TRUE THEN 1 END) as active_aliases
        FROM email_accounts ea
        LEFT JOIN email_send_as_aliases esa ON esa.email_account_id = ea.id
        WHERE ea.id = $1
        GROUP BY ea.id`,
        [accountId]
      );
      
      if (accountResult.rowCount === 0) {
        return res.status(404).json({ error: 'Email account not found' });
      }
      
      const account = accountResult.rows[0];
      
      // Get recent message statistics
      const messageStats = await query(
        `SELECT 
          direction,
          COUNT(*) as count,
          MAX(received_at) as last_activity
        FROM email_messages 
        WHERE email_account_id = $1 
          AND received_at > NOW() - INTERVAL '7 days'
        GROUP BY direction`,
        [accountId]
      );
      
      // Get store usage
      const storeUsage = await query(
        `SELECT 
          COUNT(DISTINCT sc.id) as stores_using,
          COUNT(DISTINCT CASE WHEN sc.default_from_email IS NOT NULL THEN sc.id END) as stores_configured
        FROM store_connections sc
        JOIN email_accounts ea ON ea.customer_id = sc.customer_id
        WHERE ea.id = $1`,
        [accountId]
      );
      
      res.json({
        account: {
          id: account.id,
          provider: account.provider,
          email_address: account.email_address,
          status: account.status,
          last_sync_at: account.last_sync_at,
          send_as_discovered_at: account.send_as_discovered_at,
        },
        aliases: {
          total: parseInt(account.total_aliases) || 0,
          verified: parseInt(account.verified_aliases) || 0,
          active: parseInt(account.active_aliases) || 0,
        },
        activity: {
          inbound: messageStats.rows.find(r => r.direction === 'inbound')?.count || 0,
          outbound: messageStats.rows.find(r => r.direction === 'outbound')?.count || 0,
          last_activity: messageStats.rows[0]?.last_activity || null,
        },
        stores: {
          using: parseInt(storeUsage.rows[0]?.stores_using) || 0,
          configured: parseInt(storeUsage.rows[0]?.stores_configured) || 0,
        },
      });
    } catch (error) {
      logError('Failed to get email account health', { accountId, error: error.message });
      res.status(500).json({ error: 'Failed to get account health' });
    }
  })
);
