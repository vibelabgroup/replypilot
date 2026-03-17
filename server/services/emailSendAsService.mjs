import { query } from '../utils/db.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { ensureValidToken } from './emailTokenService.mjs';

// ---------------------------------------------------------------------------
// Gmail Send-As Discovery Service
// ---------------------------------------------------------------------------

/**
 * Fetch all send-as aliases from Gmail API for a given email account.
 * Returns normalized alias data with verification status.
 */
export const discoverGmailSendAsAliases = async (emailAccountId) => {
  const emailAccount = await query(
    `SELECT id, provider, access_token, email_address FROM email_accounts WHERE id = $1`,
    [emailAccountId]
  );

  if (emailAccount.rowCount === 0) {
    throw new Error('Email account not found');
  }

  const account = emailAccount.rows[0];
  if (account.provider !== 'gmail') {
    throw new Error('Send-as discovery only supported for Gmail accounts');
  }

  const accessToken = await ensureValidToken(account);
  if (!accessToken) {
    throw new Error('Unable to obtain valid access token');
  }

  try {
    const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/settings/sendAs', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text().catch(() => '');
      throw new Error(`Gmail send-as API failed (${response.status}): ${error}`);
    }

    const data = await response.json();
    const aliases = (data.sendAs || []).map(normalizeGmailSendAsAlias);

    logInfo('Discovered Gmail send-as aliases', {
      emailAccountId,
      aliasCount: aliases.length,
      primaryAliases: aliases.filter(a => a.is_primary).length,
      verifiedAliases: aliases.filter(a => a.verification_status === 'accepted').length,
    });

    return aliases;
  } catch (error) {
    logError('Gmail send-as discovery failed', {
      emailAccountId,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Normalize Gmail send-as API response to our database format.
 */
const normalizeGmailSendAsAlias = (gmailAlias) => {
  return {
    send_as_email: gmailAlias.sendAsEmail?.toLowerCase() || '',
    display_name: gmailAlias.displayName || null,
    reply_to_address: gmailAlias.replyToAddress || null,
    is_primary: Boolean(gmailAlias.isPrimary),
    is_default: Boolean(gmailAlias.isDefault),
    treat_as_alias: Boolean(gmailAlias.treatAsAlias),
    verification_status: gmailAlias.verificationStatus || 'pending',
    smtp_msa: gmailAlias.smtpMsa ? {
      host: gmailAlias.smtpMsa.host,
      port: gmailAlias.smtpMsa.port,
      security_mode: gmailAlias.smtpMsa.securityMode,
      // Note: username/password are write-only fields, never returned
    } : null,
  };
};

/**
 * Sync discovered aliases to database, handling new, updated, and removed aliases.
 */
export const syncSendAsAliasesToDatabase = async (emailAccountId, aliases) => {
  if (!Array.isArray(aliases) || aliases.length === 0) {
    logInfo('No aliases to sync', { emailAccountId });
    return { created: 0, updated: 0, deactivated: 0 };
  }

  return await query('BEGIN') // Start transaction
    .then(async () => {
      let created = 0;
      let updated = 0;
      let deactivated = 0;

      // Get existing aliases for comparison
      const existingResult = await query(
        `SELECT id, send_as_email, is_active FROM email_send_as_aliases WHERE email_account_id = $1`,
        [emailAccountId]
      );
      const existingAliases = new Map(
        existingResult.rows.map(row => [row.send_as_email, { id: row.id, is_active: row.is_active }])
      );

      const discoveredEmails = new Set(aliases.map(a => a.send_as_email));

      // Process discovered aliases
      for (const alias of aliases) {
        const existing = existingAliases.get(alias.send_as_email);
        
        if (!existing) {
          // New alias - create it
          await query(
            `INSERT INTO email_send_as_aliases (
              email_account_id, send_as_email, display_name, reply_to_address,
              is_primary, is_default, treat_as_alias, verification_status,
              smtp_msa, last_verified_at, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), TRUE)`,
            [
              emailAccountId, alias.send_as_email, alias.display_name, alias.reply_to_address,
              alias.is_primary, alias.is_default, alias.treat_as_alias, alias.verification_status,
              alias.smtp_msa
            ]
          );
          created++;
        } else {
          // Existing alias - update if changed
          await query(
            `UPDATE email_send_as_aliases SET
              display_name = $2,
              reply_to_address = $3,
              is_primary = $4,
              is_default = $5,
              treat_as_alias = $6,
              verification_status = $7,
              smtp_msa = $8,
              last_verified_at = NOW(),
              is_active = TRUE,
              updated_at = NOW()
            WHERE id = $1`,
            [
              existing.id, alias.display_name, alias.reply_to_address,
              alias.is_primary, alias.is_default, alias.treat_as_alias,
              alias.verification_status, alias.smtp_msa
            ]
          );
          updated++;
        }
      }

      // Deactivate aliases that are no longer discovered
      for (const [email, { id }] of existingAliases) {
        if (!discoveredEmails.has(email)) {
          await query(
            `UPDATE email_send_as_aliases SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
            [id]
          );
          deactivated++;
        }
      }

      // Update email account with discovery timestamp
      await query(
        `UPDATE email_accounts SET send_as_discovered_at = NOW(), send_as_sync_error = NULL WHERE id = $1`,
        [emailAccountId]
      );

      await query('COMMIT');

      logInfo('Send-as aliases synced successfully', {
        emailAccountId,
        created,
        updated,
        deactivated,
        totalActive: aliases.length,
      });

      return { created, updated, deactivated };
    })
    .catch(async (error) => {
      await query('ROLLBACK');
      
      // Update email account with error
      await query(
        `UPDATE email_accounts SET send_as_sync_error = $1 WHERE id = $2`,
        [error.message, emailAccountId]
      );
      
      logError('Send-as alias sync failed', {
        emailAccountId,
        error: error.message,
      });
      throw error;
    });
};

/**
 * Get all active send-as aliases for an email account.
 */
export const getActiveSendAsAliases = async (emailAccountId) => {
  const result = await query(
    `SELECT 
      id, send_as_email, display_name, reply_to_address,
      is_primary, is_default, treat_as_alias, verification_status,
      smtp_msa, last_verified_at, is_active, created_at, updated_at
    FROM email_send_as_aliases 
    WHERE email_account_id = $1 AND is_active = TRUE 
    ORDER BY is_primary DESC, is_default DESC, send_as_email ASC`,
    [emailAccountId]
  );

  return result.rows;
};

/**
 * Find the best send-as alias for a given from address.
 * Priority: 1) Exact match, 2) Default alias, 3) Primary alias
 */
export const resolveSendAsAlias = async (emailAccountId, fromAddress) => {
  if (!fromAddress) return null;

  const aliases = await getActiveSendAsAliases(emailAccountId);
  const fromLower = fromAddress.toLowerCase();

  // Try exact match first
  let alias = aliases.find(a => a.send_as_email === fromLower);
  if (alias) return alias;

  // Try default alias
  alias = aliases.find(a => a.is_default);
  if (alias) return alias;

  // Fall back to primary alias
  alias = aliases.find(a => a.is_primary);
  if (alias) return alias;

  return null;
};
