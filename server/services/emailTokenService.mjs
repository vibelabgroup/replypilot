import { query } from '../utils/db.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

/**
 * Return provider-specific OAuth config (mirrors tenant/index.mjs helper).
 */
const getOAuthConfig = (provider) => {
  if (provider === 'gmail') {
    return {
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (provider === 'outlook') {
    return {
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    };
  }
  return null;
};

/**
 * Refresh the OAuth access token for the given email_account row.
 * Returns the new access_token string on success, or null on failure.
 * Persists updated tokens + expiry back to the DB.
 */
export const refreshAccessToken = async (emailAccount) => {
  const { id, provider, refresh_token: refreshToken } = emailAccount;

  if (!refreshToken) {
    logError('Cannot refresh token – no refresh_token stored', { emailAccountId: id, provider });
    await markAccountError(id, 'Missing refresh_token');
    return null;
  }

  const config = getOAuthConfig(provider);
  if (!config || !config.clientId || !config.clientSecret) {
    logError('OAuth config missing for provider', { provider, emailAccountId: id });
    await markAccountError(id, `OAuth config missing for ${provider}`);
    return null;
  }

  try {
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshToken);
    body.set('client_id', config.clientId);
    body.set('client_secret', config.clientSecret);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    try {
      const res = await fetch(config.tokenUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logError('Token refresh failed', { provider, status: res.status, body: text, emailAccountId: id });

        // If 400/401, mark the account as needing re-auth
        if (res.status === 400 || res.status === 401) {
          await markAccountError(id, `Token refresh rejected (${res.status}): re-authentication required`);
        }
        return null;
      }

      const json = await res.json();
      const accessToken = json.access_token;
      const newRefreshToken = json.refresh_token || refreshToken; // some providers rotate
      const expiresIn = json.expires_in;

      if (!accessToken) {
        logError('Token refresh returned no access_token', { provider, emailAccountId: id });
        return null;
      }

      return { accessToken, refreshToken: newRefreshToken, expiresIn };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        logError('Token refresh timeout', { provider, emailAccountId: id });
        return null;
      }
      throw error;
    }

    const expiresAt =
      typeof expiresIn === 'number'
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

    await query(
      `
        UPDATE email_accounts
        SET access_token  = $1,
            refresh_token = $2,
            expires_at    = $3,
            status        = 'active',
            sync_error    = NULL,
            sync_error_count = 0,
            updated_at    = NOW()
        WHERE id = $4
      `,
      [accessToken, newRefreshToken, expiresAt, id]
    );

    logDebug('Token refreshed successfully', { emailAccountId: id, provider });
    return accessToken;
  } catch (error) {
    logError('Token refresh exception', { emailAccountId: id, provider, error: error?.message });
    await markAccountError(id, error?.message || 'Unknown refresh error');
    return null;
  }
};

/**
 * Ensure the email account has a valid (non-expired) access token.
 * Refreshes automatically if needed. Returns the valid access_token or null.
 */
export const ensureValidToken = async (emailAccount) => {
  const { expires_at: expiresAt, access_token: currentToken } = emailAccount;

  if (expiresAt) {
    const expiresMs = new Date(expiresAt).getTime();
    if (Date.now() + REFRESH_BUFFER_MS < expiresMs) {
      // Still valid
      return currentToken;
    }
  }

  // Token expired or no expiry recorded – refresh
  logDebug('Access token expired or near-expiry, refreshing', {
    emailAccountId: emailAccount.id,
    expiresAt,
  });
  return await refreshAccessToken(emailAccount);
};

/**
 * Mark an email account as errored and increment error count.
 */
const markAccountError = async (emailAccountId, errorMsg) => {
  try {
    await query(
      `
        UPDATE email_accounts
        SET sync_error       = $1,
            sync_error_count = sync_error_count + 1,
            status           = CASE
                                 WHEN sync_error_count + 1 >= 5 THEN 'error'
                                 ELSE status
                               END,
            updated_at       = NOW()
        WHERE id = $2
      `,
      [errorMsg, emailAccountId]
    );
  } catch (err) {
    logError('Failed to mark account error', { emailAccountId, error: err?.message });
  }
};

/**
 * Load all active email accounts that are due for a sync.
 */
export const getAccountsDueForSync = async () => {
  const result = await query(
    `
      SELECT *
      FROM email_accounts
      WHERE status = 'active'
        AND (next_sync_at IS NULL OR next_sync_at <= NOW())
      ORDER BY last_sync_at ASC NULLS FIRST
      LIMIT 50
    `,
    []
  );
  return result.rows;
};

/**
 * Update the next_sync_at timestamp after a successful or failed sync.
 */
export const scheduleNextSync = async (emailAccountId, intervalMinutes = 2) => {
  await query(
    `
      UPDATE email_accounts
      SET next_sync_at = NOW() + ($1 || ' minutes')::INTERVAL,
          last_sync_at = NOW(),
          updated_at   = NOW()
      WHERE id = $2
    `,
    [String(intervalMinutes), emailAccountId]
  );
};
