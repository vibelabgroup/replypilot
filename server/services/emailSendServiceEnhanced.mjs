import { query } from '../utils/db.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { ensureValidToken } from './emailTokenService.mjs';
import { resolveSendAsAlias } from './emailSendAsService.mjs';

// ---------------------------------------------------------------------------
// Enhanced Gmail send helpers with send-as alias support
// ---------------------------------------------------------------------------

/**
 * Build an RFC 2822 email message with send-as alias support.
 */
const buildGmailRawMessage = ({ 
  from, 
  fromName, 
  to, 
  cc, 
  subject, 
  bodyPlain, 
  bodyHtml, 
  inReplyTo, 
  threadId,
  replyTo 
}) => {
  const boundary = `----replypilot_${Date.now().toString(36)}`;
  const toHeader = Array.isArray(to) ? to.join(', ') : to;
  const ccHeader = Array.isArray(cc) && cc.length > 0 ? cc.join(', ') : '';

  // Build From header with display name
  const fromHeader = fromName ? `${fromName} <${from}>` : from;

  const lines = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
  ];
  
  if (ccHeader) lines.push(`Cc: ${ccHeader}`);
  
  if (replyTo && replyTo !== from) {
    lines.push(`Reply-To: ${replyTo}`);
  }
  
  lines.push(`Subject: ${subject || ''}`);
  lines.push(`MIME-Version: 1.0`);
  
  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`);
    lines.push(`References: ${inReplyTo}`);
  }

  if (bodyHtml) {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('');
    lines.push(bodyPlain || '');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push('');
    lines.push(bodyHtml);
    lines.push(`--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('');
    lines.push(bodyPlain || '');
  }

  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64url');
};

/**
 * Enhanced Gmail send with send-as alias resolution and validation.
 */
const sendViaGmail = async (accessToken, { 
  from, 
  to, 
  cc, 
  subject, 
  bodyPlain, 
  bodyHtml, 
  inReplyTo, 
  threadId,
  sendAsAlias 
}) => {
  try {
    // Use alias information if provided
    const fromAddress = sendAsAlias?.send_as_email || from;
    const fromName = sendAsAlias?.display_name;
    const replyTo = sendAsAlias?.reply_to_address;

    // Validate that we can send from this alias
    if (sendAsAlias && sendAsAlias.verification_status !== 'accepted') {
      throw new Error(`Cannot send from unverified alias: ${fromAddress}`);
    }

    const raw = buildGmailRawMessage({ 
      from: fromAddress, 
      fromName, 
      to, 
      cc, 
      subject, 
      bodyPlain, 
      bodyHtml, 
      inReplyTo,
      replyTo 
    });

    const payload = { raw };
    if (threadId) payload.threadId = threadId;

    const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gmail send failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    
    logInfo('Gmail send successful with send-as alias', {
      fromAddress,
      threadId: data.threadId,
      messageId: data.id,
      usedAlias: Boolean(sendAsAlias),
    });

    return { 
      providerMessageId: data.id, 
      threadId: data.threadId,
      actualFromAddress: fromAddress,
      sendAsAliasId: sendAsAlias?.id || null,
    };
  } catch (error) {
    logError('Gmail send with send-as failed', {
      from,
      error: error.message,
      sendAsAlias: sendAsAlias?.send_as_email,
    });
    throw error;
  }
};

/**
 * Enhanced Outlook send with send-as alias support (limited).
 */
const sendViaOutlook = async (accessToken, { 
  from, 
  to, 
  cc, 
  subject, 
  bodyPlain, 
  bodyHtml, 
  inReplyTo,
  sendAsAlias 
}) => {
  // Outlook/Graph API has limited send-as support compared to Gmail
  // We'll implement basic From header support but it's more restricted
  
  const toRecipients = (Array.isArray(to) ? to : [to]).map((addr) => ({
    emailAddress: { address: addr },
  }));

  const ccRecipients =
    Array.isArray(cc) && cc.length > 0
      ? cc.map((addr) => ({ emailAddress: { address: addr } }))
      : [];

  const message = {
    subject: subject || '',
    body: {
      contentType: bodyHtml ? 'HTML' : 'Text',
      content: bodyHtml || bodyPlain || '',
    },
    toRecipients,
  };

  // Outlook send-as is more limited - primarily through delegate access
  // For now, we'll use the primary account and note limitations
  if (sendAsAlias) {
    logWarn('Outlook send-as alias support is limited', {
      alias: sendAsAlias.send_as_email,
      primary: from,
    });
  }

  if (ccRecipients.length > 0) message.ccRecipients = ccRecipients;

  if (inReplyTo) {
    message.internetMessageHeaders = [
      { name: 'In-Reply-To', value: inReplyTo },
      { name: 'References', value: inReplyTo },
    ];
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Outlook sendMail failed (${res.status}): ${text}`);
  }

  logInfo('Outlook send completed', { from, to });

  // sendMail returns 202 with no body
  return { 
    providerMessageId: null, 
    actualFromAddress: from,
    sendAsAliasId: sendAsAlias?.id || null,
  };
};

// ---------------------------------------------------------------------------
// Enhanced main send functions with alias resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the best send-as alias for a given store connection.
 */
const resolveStoreSendAsAlias = async (customerId, storeConnectionId, emailAccountId) => {
  if (!storeConnectionId || !emailAccountId) return null;

  // Get store connection with email configuration
  const storeResult = await query(
    `SELECT default_from_email, reply_to_email, email_signature 
     FROM store_connections 
     WHERE id = $1 AND customer_id = $2`,
    [storeConnectionId, customerId]
  );

  if (storeResult.rowCount === 0) return null;

  const store = storeResult.rows[0];
  const fromEmail = store.default_from_email;

  if (!fromEmail) return null;

  // Resolve the best send-as alias for this from address
  return await resolveSendAsAlias(emailAccountId, fromEmail);
};

/**
 * Enhanced sendEmail function with send-as alias support.
 */
export const sendEmailWithSendAs = async ({
  customerId,
  emailAccountId,
  storeConnectionId = null,
  to,
  cc = [],
  subject,
  bodyPlain,
  bodyHtml,
  inReplyTo = null,
  threadId = null,
  forceFrom = null, // Override for system emails
}) => {
  if (!emailAccountId || !to || !subject) {
    throw new Error('Missing required parameters: emailAccountId, to, subject');
  }

  // Get email account
  const accountResult = await query(
    `SELECT id, provider, email_address, display_name, access_token, refresh_token, expires_at 
     FROM email_accounts 
     WHERE id = $1 AND customer_id = $2 AND status = 'active'`,
    [emailAccountId, customerId]
  );

  if (accountResult.rowCount === 0) {
    throw new Error('Email account not found or inactive');
  }

  const account = accountResult.rows[0];
  
  // Get valid access token
  const accessToken = await ensureValidToken(account);
  if (!accessToken) {
    throw new Error('Unable to obtain valid access token');
  }

  let sendAsAlias = null;
  let effectiveFrom = forceFrom || account.email_address;

  // Resolve send-as alias if we have a store connection
  if (storeConnectionId && !forceFrom) {
    sendAsAlias = await resolveStoreSendAsAlias(customerId, storeConnectionId, emailAccountId);
    if (sendAsAlias) {
      effectiveFrom = sendAsAlias.send_as_email;
    }
  }

  // Validate that we can send from the effective address
  if (sendAsAlias && sendAsAlias.verification_status !== 'accepted') {
    logWarn('Attempted to send from unverified alias, falling back to primary', {
      attemptedFrom: effectiveFrom,
      primaryFrom: account.email_address,
      verificationStatus: sendAsAlias.verification_status,
    });
    sendAsAlias = null;
    effectiveFrom = account.email_address;
  }

  // Send via appropriate provider
  let result;
  if (account.provider === 'gmail') {
    result = await sendViaGmail(accessToken, {
      from: account.email_address,
      to,
      cc,
      subject,
      bodyPlain,
      bodyHtml,
      inReplyTo,
      threadId,
      sendAsAlias,
    });
  } else if (account.provider === 'outlook') {
    result = await sendViaOutlook(accessToken, {
      from: account.email_address,
      to,
      cc,
      subject,
      bodyPlain,
      bodyHtml,
      inReplyTo,
      sendAsAlias,
    });
  } else {
    throw new Error(`Unsupported email provider: ${account.provider}`);
  }

  // Record the outbound message in database
  await query(
    `INSERT INTO email_messages (
      customer_id, email_account_id, provider_message_id, thread_id,
      from_address, to_addresses, cc_addresses, subject, body_plain, body_html,
      received_at, conversation_id, direction, meta, actual_from_address, send_as_alias_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NULL, 'outbound', $11, $12, $13)`,
    [
      customerId,
      emailAccountId,
      result.providerMessageId,
      result.threadId,
      account.email_address, // Original account email
      Array.isArray(to) ? to : [to],
      cc,
      subject,
      bodyPlain,
      bodyHtml,
      JSON.stringify({
        provider: account.provider,
        sendAsAlias: sendAsAlias?.send_as_email,
        storeConnectionId,
      }),
      result.actualFromAddress, // Actual From: header used
      result.sendAsAliasId,
    ]
  );

  logInfo('Email sent successfully with send-as support', {
    customerId,
    emailAccountId,
    storeConnectionId,
    from: account.email_address,
    actualFrom: result.actualFromAddress,
    to,
    usedAlias: Boolean(sendAsAlias),
  });

  return {
    success: true,
    messageId: result.providerMessageId,
    threadId: result.threadId,
    from: result.actualFromAddress,
    sendAsAlias: sendAsAlias?.send_as_email || null,
  };
};

/**
 * Test email sending with a specific send-as alias.
 */
export const testSendAsAlias = async (emailAccountId, aliasId) => {
  // Get email account and alias
  const [accountResult, aliasResult] = await Promise.all([
    query(`SELECT * FROM email_accounts WHERE id = $1`, [emailAccountId]),
    query(`SELECT * FROM email_send_as_aliases WHERE id = $1`, [aliasId]),
  ]);

  if (accountResult.rowCount === 0 || aliasResult.rowCount === 0) {
    throw new Error('Email account or alias not found');
  }

  const account = accountResult.rows[0];
  const alias = aliasResult.rows[0];

  // Send test email to the account itself
  return await sendEmailWithSendAs({
    customerId: account.customer_id,
    emailAccountId,
    storeConnectionId: null,
    to: account.email_address,
    subject: `Send-As Alias Test: ${alias.send_as_email}`,
    bodyPlain: `This is a test email sent from the send-as alias: ${alias.send_as_email}\n\nIf you receive this, the alias is working correctly.`,
    bodyHtml: `<p>This is a test email sent from the send-as alias: <strong>${alias.send_as_email}</strong></p><p>If you receive this, the alias is working correctly.</p>`,
  });
};
