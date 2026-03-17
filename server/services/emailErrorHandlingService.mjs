import { query } from '../utils/db.mjs';
import { logInfo, logError, logWarn, logDebug } from '../utils/logger.mjs';
import { ensureValidToken } from './emailTokenService.mjs';

// ---------------------------------------------------------------------------
// Email Error Handling and Fallback Service
// ---------------------------------------------------------------------------

/**
 * Error classification for email operations
 */
export const EmailErrorTypes = {
  AUTHENTICATION_ERROR: 'authentication_error',
  VERIFICATION_ERROR: 'verification_error', 
  RATE_LIMIT_ERROR: 'rate_limit_error',
  QUOTA_EXCEEDED_ERROR: 'quota_exceeded_error',
  INVALID_ALIAS_ERROR: 'invalid_alias_error',
  NETWORK_ERROR: 'network_error',
  PROVIDER_ERROR: 'provider_error',
  CONFIGURATION_ERROR: 'configuration_error',
  UNKNOWN_ERROR: 'unknown_error',
};

/**
 * Classify email errors based on error messages and HTTP status codes
 */
export const classifyEmailError = (error, httpStatus = null) => {
  const errorMessage = error?.message?.toLowerCase() || '';
  const errorCode = error?.code?.toLowerCase() || '';
  
  // Gmail API specific error patterns
  if (errorMessage.includes('invalid credentials') || errorMessage.includes('unauthorized') || httpStatus === 401) {
    return EmailErrorTypes.AUTHENTICATION_ERROR;
  }
  
  if (errorMessage.includes('verification') || errorMessage.includes('not verified') || errorMessage.includes('unverified')) {
    return EmailErrorTypes.VERIFICATION_ERROR;
  }
  
  if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests') || httpStatus === 429) {
    return EmailErrorTypes.RATE_LIMIT_ERROR;
  }
  
  if (errorMessage.includes('quota') || errorMessage.includes('limit exceeded') || errorMessage.includes('daily limit')) {
    return EmailErrorTypes.QUOTA_EXCEEDED_ERROR;
  }
  
  if (errorMessage.includes('send as') || errorMessage.includes('from address') || errorMessage.includes('alias')) {
    return EmailErrorTypes.INVALID_ALIAS_ERROR;
  }
  
  if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('connection')) {
    return EmailErrorTypes.NETWORK_ERROR;
  }
  
  if (errorMessage.includes('gmail') || errorMessage.includes('google') || errorMessage.includes('outlook') || errorMessage.includes('microsoft')) {
    return EmailErrorTypes.PROVIDER_ERROR;
  }
  
  if (errorMessage.includes('configuration') || errorMessage.includes('missing') || errorMessage.includes('invalid config')) {
    return EmailErrorTypes.CONFIGURATION_ERROR;
  }
  
  return EmailErrorTypes.UNKNOWN_ERROR;
};

/**
 * Handle email sending errors with appropriate fallback strategies
 */
export const handleEmailSendError = async (error, context) => {
  const {
    customerId,
    emailAccountId,
    storeConnectionId,
    to,
    subject,
    originalAlias,
    attempt = 1,
  } = context || {};

  const errorType = classifyEmailError(error);
  const errorDetails = {
    customerId,
    emailAccountId,
    storeConnectionId,
    to,
    subject,
    errorType,
    errorMessage: error.message,
    attempt,
    timestamp: new Date().toISOString(),
  };

  logError('Email send error detected', errorDetails);

  // Record error in database for monitoring
  await recordEmailError(errorDetails);

  // Apply fallback strategies based on error type
  switch (errorType) {
    case EmailErrorTypes.AUTHENTICATION_ERROR:
      return await handleAuthenticationError(error, context);
      
    case EmailErrorTypes.VERIFICATION_ERROR:
      return await handleVerificationError(error, context);
      
    case EmailErrorTypes.INVALID_ALIAS_ERROR:
      return await handleInvalidAliasError(error, context);
      
    case EmailErrorTypes.RATE_LIMIT_ERROR:
      return await handleRateLimitError(error, context);
      
    case EmailErrorTypes.QUOTA_EXCEEDED_ERROR:
      return await handleQuotaExceededError(error, context);
      
    case EmailErrorTypes.NETWORK_ERROR:
      return await handleNetworkError(error, context);
      
    case EmailErrorTypes.PROVIDER_ERROR:
      return await handleProviderError(error, context);
      
    default:
      return await handleUnknownError(error, context);
  }
};

/**
 * Handle authentication errors - refresh tokens or mark account as error
 */
const handleAuthenticationError = async (error, context) => {
  const { emailAccountId } = context;
  
  logWarn('Authentication error, attempting token refresh', { emailAccountId });
  
  try {
    // Force token refresh
    const accountResult = await query(
      `SELECT provider, access_token, refresh_token, expires_at FROM email_accounts WHERE id = $1`,
      [emailAccountId]
    );
    
    if (accountResult.rowCount === 0) {
      throw new Error('Email account not found');
    }
    
    const account = accountResult.rows[0];
    const refreshedToken = await ensureValidToken(account);
    
    if (refreshedToken) {
      logInfo('Token refresh successful', { emailAccountId });
      return {
        shouldRetry: true,
        retryDelay: 0,
        fallbackStrategy: 'token_refresh',
        message: 'Authentication refreshed, retrying send',
      };
    } else {
      // Mark account as needing re-authentication
      await query(
        `UPDATE email_accounts SET status = 'error', send_as_sync_error = $1 WHERE id = $2`,
        ['Authentication failed, re-authentication required', emailAccountId]
      );
      
      return {
        shouldRetry: false,
        fallbackStrategy: 'manual_reauth',
        message: 'Account requires re-authentication',
        requiresAction: 'reauth',
      };
    }
  } catch (refreshError) {
    logError('Token refresh failed', { emailAccountId, error: refreshError.message });
    
    await query(
      `UPDATE email_accounts SET status = 'error', send_as_sync_error = $1 WHERE id = $2`,
      ['Token refresh failed: ' + refreshError.message, emailAccountId]
    );
    
    return {
      shouldRetry: false,
      fallbackStrategy: 'manual_reauth',
      message: 'Token refresh failed, manual re-authentication required',
      requiresAction: 'reauth',
    };
  }
};

/**
 * Handle verification errors - fallback to primary/default alias
 */
const handleVerificationError = async (error, context) => {
  const { emailAccountId, originalAlias } = context;
  
  logWarn('Alias verification error, attempting fallback', { emailAccountId, originalAlias });
  
  try {
    // Get available verified aliases
    const aliasResult = await query(
      `SELECT id, send_as_email, display_name, is_primary, is_default 
       FROM email_send_as_aliases 
       WHERE email_account_id = $1 AND is_active = TRUE AND verification_status = 'accepted'
       ORDER BY is_primary DESC, is_default DESC, send_as_email ASC`,
      [emailAccountId]
    );
    
    const verifiedAliases = aliasResult.rows;
    
    if (verifiedAliases.length === 0) {
      return {
        shouldRetry: false,
        fallbackStrategy: 'no_verified_aliases',
        message: 'No verified aliases available',
        requiresAction: 'verify_aliases',
      };
    }
    
    // Try primary alias first, then default
    const fallbackAlias = verifiedAliases.find(a => a.is_primary) || verifiedAliases.find(a => a.is_default) || verifiedAliases[0];
    
    if (fallbackAlias.send_as_email === originalAlias?.send_as_email) {
      // We're already using the best available alias
      return {
        shouldRetry: false,
        fallbackStrategy: 'alias_verification_required',
        message: `Alias ${originalAlias.send_as_email} needs verification`,
        requiresAction: 'verify_alias',
        aliasId: originalAlias.id,
      };
    }
    
    logInfo('Using fallback alias', { 
      originalAlias: originalAlias?.send_as_email, 
      fallbackAlias: fallbackAlias.send_as_email 
    });
    
    return {
      shouldRetry: true,
      retryDelay: 0,
      fallbackStrategy: 'alias_fallback',
      fallbackAlias,
      message: `Using verified alias: ${fallbackAlias.send_as_email}`,
    };
  } catch (fallbackError) {
    logError('Fallback alias selection failed', { emailAccountId, error: fallbackError.message });
    
    return {
      shouldRetry: false,
      fallbackStrategy: 'fallback_failed',
      message: 'Failed to find fallback alias',
    };
  }
};

/**
 * Handle invalid alias errors - similar to verification errors
 */
const handleInvalidAliasError = async (error, context) => {
  return await handleVerificationError(error, context);
};

/**
 * Handle rate limit errors - implement exponential backoff
 */
const handleRateLimitError = async (error, context) => {
  const { attempt = 1 } = context;
  
  // Exponential backoff: 5s, 15s, 45s, 135s, max 5 minutes
  const baseDelay = 5000; // 5 seconds
  const maxDelay = 300000; // 5 minutes
  const delay = Math.min(baseDelay * Math.pow(3, attempt - 1), maxDelay);
  
  logWarn('Rate limit hit, implementing backoff', { 
    attempt, 
    delay: delay / 1000, 
    unit: 'seconds' 
  });
  
  return {
    shouldRetry: attempt < 5, // Max 5 attempts
    retryDelay: delay,
    fallbackStrategy: 'exponential_backoff',
    message: `Rate limited, retrying in ${delay / 1000} seconds (attempt ${attempt}/5)`,
  };
};

/**
 * Handle quota exceeded errors - defer to queue or notify admin
 */
const handleQuotaExceededError = async (error, context) => {
  const { customerId, emailAccountId } = context;
  
  logWarn('Email quota exceeded', { customerId, emailAccountId });
  
  // Mark account with quota warning
  await query(
    `UPDATE email_accounts SET send_as_sync_error = $1 WHERE id = $2`,
    ['Daily sending quota exceeded', emailAccountId]
  );
  
  return {
    shouldRetry: false,
    fallbackStrategy: 'quota_exceeded',
    message: 'Email sending quota exceeded for today',
    requiresAction: 'quota_reset',
    nextRetryTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
  };
};

/**
 * Handle network errors - retry with backoff
 */
const handleNetworkError = async (error, context) => {
  const { attempt = 1 } = context;
  
  // Linear backoff for network errors: 2s, 4s, 6s, 8s, 10s
  const delay = Math.min(2000 * attempt, 10000);
  
  logWarn('Network error, implementing backoff', { 
    attempt, 
    delay: delay / 1000, 
    unit: 'seconds' 
  });
  
  return {
    shouldRetry: attempt < 5, // Max 5 attempts
    retryDelay: delay,
    fallbackStrategy: 'network_backoff',
    message: `Network error, retrying in ${delay / 1000} seconds (attempt ${attempt}/5)`,
  };
};

/**
 * Handle provider errors - check service status
 */
const handleProviderError = async (error, context) => {
  const { emailAccountId } = context;
  
  logWarn('Provider error detected', { emailAccountId, error: error.message });
  
  // Check if this is a known provider outage
  const isOutage = await checkProviderOutage(error);
  
  if (isOutage) {
    return {
      shouldRetry: false,
      fallbackStrategy: 'provider_outage',
      message: 'Email provider experiencing issues',
      requiresAction: 'monitor_provider',
    };
  }
  
  // For other provider errors, try fallback to primary alias
  return await handleVerificationError(error, context);
};

/**
 * Handle unknown errors - conservative retry
 */
const handleUnknownError = async (error, context) => {
  const { attempt = 1 } = context;
  
  logError('Unknown email error', { error: error.message, context });
  
  // Conservative backoff for unknown errors
  const delay = Math.min(1000 * attempt, 5000); // 1s, 2s, 3s, 4s, 5s
  
  return {
    shouldRetry: attempt < 3, // Max 3 attempts for unknown errors
    retryDelay: delay,
    fallbackStrategy: 'conservative_backoff',
    message: `Unknown error, retrying in ${delay / 1000} seconds (attempt ${attempt}/3)`,
  };
};

/**
 * Record email errors for monitoring and analytics
 */
const recordEmailError = async (errorDetails) => {
  try {
    await query(
      `INSERT INTO email_error_log (
        customer_id, email_account_id, store_connection_id, to_address, subject,
        error_type, error_message, attempt, context, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        errorDetails.customerId,
        errorDetails.emailAccountId,
        errorDetails.storeConnectionId,
        errorDetails.to,
        errorDetails.subject,
        errorDetails.errorType,
        errorDetails.errorMessage,
        errorDetails.attempt,
        JSON.stringify(errorDetails),
      ]
    );
  } catch (logError) {
    logError('Failed to record email error', { error: logError.message, errorDetails });
  }
};

/**
 * Check for known provider outages
 */
const checkProviderOutage = async (error) => {
  const errorMessage = error?.message?.toLowerCase() || '';
  
  // Known outage patterns (this could be enhanced with external monitoring)
  const outagePatterns = [
    'service unavailable',
    'temporary failure',
    'service error',
    'internal server error',
    'gateway timeout',
  ];
  
  return outagePatterns.some(pattern => errorMessage.includes(pattern));
};

/**
 * Get email error statistics for monitoring
 */
export const getEmailErrorStats = async (customerId = null, hours = 24) => {
  const whereClause = customerId ? 'AND customer_id = $1' : '';
  const params = customerId ? [customerId, hours] : [hours];
  
  const result = await query(
    `SELECT 
      error_type,
      COUNT(*) as count,
      MAX(created_at) as last_occurrence,
      COUNT(DISTINCT email_account_id) as affected_accounts
    FROM email_error_log 
    WHERE created_at > NOW() - INTERVAL '${hours} hours' ${whereClause}
    GROUP BY error_type
    ORDER BY count DESC`,
    params
  );
  
  return result.rows;
};

/**
 * Get health status for email accounts based on recent errors
 */
export const getEmailAccountHealth = async (emailAccountId) => {
  const result = await query(
    `SELECT 
      COUNT(*) as total_errors,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as recent_errors,
      COUNT(CASE WHEN error_type = 'authentication_error' THEN 1 END) as auth_errors,
      MAX(created_at) as last_error
    FROM email_error_log 
    WHERE email_account_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [emailAccountId]
  );
  
  const stats = result.rows[0];
  const totalErrors = parseInt(stats.total_errors) || 0;
  const recentErrors = parseInt(stats.recent_errors) || 0;
  const authErrors = parseInt(stats.auth_errors) || 0;
  
  let health = 'healthy';
  if (authErrors > 0) {
    health = 'authentication_required';
  } else if (recentErrors > 5) {
    health = 'critical';
  } else if (totalErrors > 10) {
    health = 'degraded';
  } else if (totalErrors > 0) {
    health = 'warning';
  }
  
  return {
    health,
    totalErrors,
    recentErrors,
    authErrors,
    lastError: stats.last_error,
  };
};
