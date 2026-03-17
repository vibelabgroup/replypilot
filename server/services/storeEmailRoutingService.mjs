import { query } from '../utils/db.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { getActiveSendAsAliases } from './emailSendAsService.mjs';

// ---------------------------------------------------------------------------
// Store Connection Email Mapping Service
// ---------------------------------------------------------------------------

/**
 * Configure email routing for a store connection.
 */
export const configureStoreEmailRouting = async (storeConnectionId, config) => {
  const {
    defaultFromEmail,
    replyToEmail,
    emailSignature,
    emailAccountId,
  } = config || {};

  const result = await query(
    `UPDATE store_connections 
     SET 
       default_from_email = $1,
       reply_to_email = $2,
       email_signature = $3,
       updated_at = NOW()
     WHERE id = $4
     RETURNING id, customer_id, store_name, store_domain, default_from_email, reply_to_email`,
    [defaultFromEmail || null, replyToEmail || null, emailSignature || null, storeConnectionId]
  );

  if (result.rowCount === 0) {
    throw new Error('Store connection not found');
  }

  const store = result.rows[0];

  // Validate that the from email is available as a send-as alias
  if (defaultFromEmail && emailAccountId) {
    try {
      const aliases = await getActiveSendAsAliases(emailAccountId);
      const aliasExists = aliases.some(a => a.send_as_email === defaultFromEmail.toLowerCase());
      
      if (!aliasExists) {
        logWarn('Configured from email not found in send-as aliases', {
          storeConnectionId,
          fromEmail: defaultFromEmail,
          emailAccountId,
          availableAliases: aliases.map(a => a.send_as_email),
        });
        
        // Don't fail the configuration, just warn
      } else {
        logInfo('Store email routing configured successfully', {
          storeConnectionId,
          storeName: store.store_name,
          fromEmail: defaultFromEmail,
        });
      }
    } catch (error) {
      logError('Failed to validate send-as alias for store', {
        storeConnectionId,
        fromEmail: defaultFromEmail,
        error: error.message,
      });
    }
  }

  return store;
};

/**
 * Get email routing configuration for a store connection.
 */
export const getStoreEmailRouting = async (storeConnectionId) => {
  const result = await query(
    `SELECT 
       sc.id, sc.customer_id, sc.store_name, sc.store_domain,
       sc.default_from_email, sc.reply_to_email, sc.email_signature,
       sc.support_emails,
       ea.id as email_account_id, ea.provider, ea.email_address as account_email
     FROM store_connections sc
     LEFT JOIN email_accounts ea ON ea.customer_id = sc.customer_id AND ea.status = 'active'
     WHERE sc.id = $1`,
    [storeConnectionId]
  );

  if (result.rowCount === 0) {
    throw new Error('Store connection not found');
  }

  const store = result.rows[0];

  // Get available send-as aliases if we have an email account
  let availableAliases = [];
  if (store.email_account_id) {
    try {
      availableAliases = await getActiveSendAsAliases(store.email_account_id);
    } catch (error) {
      logError('Failed to get send-as aliases for store', {
        storeConnectionId,
        error: error.message,
      });
    }
  }

  return {
    ...store,
    availableAliases,
    hasValidAlias: availableAliases.some(a => a.send_as_email === store.default_from_email?.toLowerCase()),
  };
};

/**
 * Get all store connections with email routing for a customer.
 */
export const getCustomerStoreEmailRouting = async (customerId) => {
  const result = await query(
    `SELECT 
       sc.id, sc.store_name, sc.store_domain, sc.platform, sc.status,
       sc.default_from_email, sc.reply_to_email, sc.email_signature,
       sc.support_emails, sc.last_sync_at,
       ea.id as email_account_id, ea.provider, ea.email_address as account_email
     FROM store_connections sc
     LEFT JOIN email_accounts ea ON ea.customer_id = sc.customer_id AND ea.status = 'active'
     WHERE sc.customer_id = $1
     ORDER BY sc.store_name ASC`,
    [customerId]
  );

  const stores = result.rows;

  // Get available aliases for each store
  for (const store of stores) {
    if (store.email_account_id) {
      try {
        store.availableAliases = await getActiveSendAsAliases(store.email_account_id);
        store.hasValidAlias = store.availableAliases.some(a => a.send_as_email === store.default_from_email?.toLowerCase());
      } catch (error) {
        store.availableAliases = [];
        store.hasValidAlias = false;
        logError('Failed to get aliases for store', {
          storeId: store.id,
          error: error.message,
        });
      }
    } else {
      store.availableAliases = [];
      store.hasValidAlias = false;
    }
  }

  return stores;
};

/**
 * Auto-suggest email routing for a store based on store domain and available aliases.
 */
export const suggestEmailRouting = async (storeConnectionId) => {
  // Get store info and available aliases
  const [storeResult, aliasesResult] = await Promise.all([
    query(
      `SELECT sc.customer_id, sc.store_name, sc.store_domain, sc.support_emails,
              ea.id as email_account_id
       FROM store_connections sc
       LEFT JOIN email_accounts ea ON ea.customer_id = sc.customer_id AND ea.status = 'active'
       WHERE sc.id = $1`,
      [storeConnectionId]
    ),
    query(
      `SELECT esa.send_as_email, esa.display_name, esa.is_primary, esa.is_default
       FROM email_send_as_aliases esa
       JOIN email_accounts ea ON ea.id = esa.email_account_id
       JOIN store_connections sc ON sc.customer_id = ea.customer_id AND sc.id = $1
       WHERE esa.is_active = TRUE AND esa.verification_status = 'accepted'
       ORDER BY esa.is_primary DESC, esa.is_default DESC, esa.send_as_email ASC`,
      [storeConnectionId]
    ),
  ]);

  if (storeResult.rowCount === 0) {
    throw new Error('Store connection not found');
  }

  const store = storeResult.rows[0];
  const aliases = aliasesResult.rows;

  if (aliases.length === 0) {
    return {
      suggestions: [],
      message: 'No verified send-as aliases available for this store.',
    };
  }

  const suggestions = [];
  const storeDomain = store.store_domain?.toLowerCase();
  const supportEmails = store.support_emails || [];

  // Priority 1: Exact match with support emails
  for (const supportEmail of supportEmails) {
    const alias = aliases.find(a => a.send_as_email === supportEmail.toLowerCase());
    if (alias) {
      suggestions.push({
        type: 'support_email_match',
        fromEmail: alias.send_as_email,
        displayName: alias.display_name,
        replyTo: alias.send_as_email,
        confidence: 'high',
        reason: 'Matches configured support email',
      });
    }
  }

  // Priority 2: Domain-based matching
  if (storeDomain) {
    const domainAliases = aliases.filter(a => a.send_as_email.includes(storeDomain));
    for (const alias of domainAliases) {
      if (!suggestions.find(s => s.fromEmail === alias.send_as_email)) {
        suggestions.push({
          type: 'domain_match',
          fromEmail: alias.send_as_email,
          displayName: alias.display_name,
          replyTo: alias.send_as_email,
          confidence: 'medium',
          reason: `Matches store domain: ${storeDomain}`,
        });
      }
    }
  }

  // Priority 3: Default/Primary alias
  const defaultAlias = aliases.find(a => a.is_default);
  const primaryAlias = aliases.find(a => a.is_primary);

  if (defaultAlias && !suggestions.find(s => s.fromEmail === defaultAlias.send_as_email)) {
    suggestions.push({
      type: 'default_alias',
      fromEmail: defaultAlias.send_as_email,
      displayName: defaultAlias.display_name,
      replyTo: defaultAlias.send_as_email,
      confidence: 'low',
      reason: 'Default send-as alias for the account',
    });
  }

  if (primaryAlias && !suggestions.find(s => s.fromEmail === primaryAlias.send_as_email)) {
    suggestions.push({
      type: 'primary_alias',
      fromEmail: primaryAlias.send_as_email,
      displayName: primaryAlias.display_name,
      replyTo: primaryAlias.send_as_email,
      confidence: 'low',
      reason: 'Primary email account address',
    });
  }

  return {
    suggestions,
    availableAliases: aliases,
    storeInfo: {
      name: store.store_name,
      domain: store.store_domain,
      supportEmails,
    },
  };
};

/**
 * Bulk configure email routing for multiple stores.
 */
export const bulkConfigureEmailRouting = async (configurations) => {
  const results = [];
  
  for (const config of configurations) {
    try {
      const result = await configureStoreEmailRouting(config.storeConnectionId, config);
      results.push({
        storeConnectionId: config.storeConnectionId,
        success: true,
        result,
      });
    } catch (error) {
      results.push({
        storeConnectionId: config.storeConnectionId,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
};

/**
 * Validate email routing configuration before saving.
 */
export const validateEmailRouting = async (storeConnectionId, config) => {
  const { defaultFromEmail, emailAccountId } = config || {};
  const issues = [];

  if (!defaultFromEmail) {
    issues.push({
      field: 'defaultFromEmail',
      severity: 'warning',
      message: 'No default from email configured',
    });
  }

  if (!emailAccountId) {
    issues.push({
      field: 'emailAccountId',
      severity: 'error',
      message: 'No email account available for this customer',
    });
  } else {
    // Check if the from email is available as a verified alias
    try {
      const aliases = await getActiveSendAsAliases(emailAccountId);
      const matchingAlias = aliases.find(a => a.send_as_email === defaultFromEmail?.toLowerCase());
      
      if (!matchingAlias) {
        issues.push({
          field: 'defaultFromEmail',
          severity: 'error',
          message: `Email ${defaultFromEmail} is not available as a verified send-as alias`,
          availableAliases: aliases.map(a => a.send_as_email),
        });
      } else if (matchingAlias.verification_status !== 'accepted') {
        issues.push({
          field: 'defaultFromEmail',
          severity: 'error',
          message: `Email ${defaultFromEmail} is not verified (${matchingAlias.verification_status})`,
        });
      }
    } catch (error) {
      issues.push({
        field: 'emailAccountId',
        severity: 'error',
        message: 'Failed to validate send-as aliases',
        error: error.message,
      });
    }
  }

  return {
    isValid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
  };
};
