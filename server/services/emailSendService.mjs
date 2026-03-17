import { query } from '../utils/db.mjs';
import { logInfo, logError, logWarn } from '../utils/logger.mjs';
import { enqueueJob } from '../utils/redis.mjs';
import { ensureValidToken } from './emailTokenService.mjs';
import { emailClient } from '../core/httpClient.mjs';

// ---------------------------------------------------------------------------
// Gmail send helpers
// ---------------------------------------------------------------------------

/**
 * Build an RFC 2822 email message and base64url-encode it for the Gmail API.
 */
const buildGmailRawMessage = ({ from, to, cc, subject, bodyPlain, bodyHtml, inReplyTo, threadId }) => {
  const boundary = `----replypilot_${Date.now().toString(36)}`;
  const toHeader = Array.isArray(to) ? to.join(', ') : to;
  const ccHeader = Array.isArray(cc) && cc.length > 0 ? cc.join(', ') : '';

  const lines = [
    `From: ${from}`,
    `To: ${toHeader}`,
  ];
  if (ccHeader) lines.push(`Cc: ${ccHeader}`);
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
 * Send an email via the Gmail API (messages.send).
 */
const sendViaGmail = async (accessToken, { from, to, cc, subject, bodyPlain, bodyHtml, inReplyTo, threadId }) => {
  const raw = buildGmailRawMessage({ from, to, cc, subject, bodyPlain, bodyHtml, inReplyTo });

  const payload = { raw };
  if (threadId) payload.threadId = threadId;

  const res = await emailClient.fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
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
  return { providerMessageId: data.id, threadId: data.threadId };
};

/**
 * Create a draft in Gmail (messages.drafts.create) instead of sending.
 */
const createGmailDraft = async (accessToken, { from, to, cc, subject, bodyPlain, bodyHtml, inReplyTo, threadId }) => {
  const raw = buildGmailRawMessage({ from, to, cc, subject, bodyPlain, bodyHtml, inReplyTo });

  const message = { raw };
  if (threadId) message.threadId = threadId;

  const res = await emailClient.fetch('https://www.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gmail draft creation failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { providerDraftId: data.id, providerMessageId: data.message?.id };
};

// ---------------------------------------------------------------------------
// Outlook / Microsoft Graph send helpers
// ---------------------------------------------------------------------------

/**
 * Send an email via Microsoft Graph (sendMail).
 */
const sendViaOutlook = async (accessToken, { to, cc, subject, bodyPlain, bodyHtml, inReplyTo }) => {
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

  if (ccRecipients.length > 0) message.ccRecipients = ccRecipients;

  if (inReplyTo) {
    message.internetMessageHeaders = [
      { name: 'In-Reply-To', value: inReplyTo },
      { name: 'References', value: inReplyTo },
    ];
  }

  const res = await emailClient.fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
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

  // sendMail returns 202 with no body
  return { providerMessageId: null };
};

/**
 * Create a draft in Outlook (not sent).
 */
const createOutlookDraft = async (accessToken, { to, cc, subject, bodyPlain, bodyHtml, inReplyTo }) => {
  const toRecipients = (Array.isArray(to) ? to : [to]).map((addr) => ({
    emailAddress: { address: addr },
  }));

  const ccRecipients =
    Array.isArray(cc) && cc.length > 0
      ? cc.map((addr) => ({ emailAddress: { address: addr } }))
      : [];

  const draft = {
    subject: subject || '',
    body: {
      contentType: bodyHtml ? 'HTML' : 'Text',
      content: bodyHtml || bodyPlain || '',
    },
    toRecipients,
  };

  if (ccRecipients.length > 0) draft.ccRecipients = ccRecipients;

  const res = await emailClient.fetch('https://graph.microsoft.com/v1.0/me/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(draft),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Outlook draft creation failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { providerDraftId: data.id, providerMessageId: data.internetMessageId };
};

// ---------------------------------------------------------------------------
// Unified send / push-draft functions
// ---------------------------------------------------------------------------

/**
 * Send an approved email draft through the customer's connected mailbox.
 * Updates the draft status to 'sent' on success.
 */
export const sendDraft = async (draftId, customerId) => {
  // Load draft
  const draftResult = await query(
    `SELECT * FROM email_drafts WHERE id = $1 AND customer_id = $2 LIMIT 1`,
    [draftId, customerId]
  );

  if (draftResult.rowCount === 0) {
    throw new Error('Draft not found');
  }

  const draft = draftResult.rows[0];

  if (draft.status !== 'draft' && draft.status !== 'approved') {
    throw new Error(`Draft cannot be sent (current status: ${draft.status})`);
  }

  // Load email account
  const acctResult = await query(
    `SELECT * FROM email_accounts WHERE id = $1 LIMIT 1`,
    [draft.email_account_id]
  );

  if (acctResult.rowCount === 0) {
    throw new Error('Email account not found');
  }

  const account = acctResult.rows[0];

  if (account.status !== 'active') {
    throw new Error('Email account is not active');
  }

  // Ensure valid token
  const accessToken = await ensureValidToken(account);
  if (!accessToken) {
    throw new Error('Could not obtain valid access token for email account');
  }

  const sendPayload = {
    from: account.display_name
      ? `${account.display_name} <${account.email_address}>`
      : account.email_address,
    to: draft.to_addresses,
    cc: draft.cc_addresses || [],
    subject: draft.subject,
    bodyPlain: draft.body_plain,
    bodyHtml: draft.body_html || null,
    inReplyTo: draft.in_reply_to_provider_id || null,
    threadId: draft.thread_id || null,
  };

  let sendResult;

  try {
    if (account.provider === 'gmail') {
      sendResult = await sendViaGmail(accessToken, sendPayload);
    } else if (account.provider === 'outlook') {
      sendResult = await sendViaOutlook(accessToken, sendPayload);
    } else {
      throw new Error(`Unsupported email provider: ${account.provider}`);
    }
  } catch (err) {
    logError('Failed to send email draft', { draftId, provider: account.provider, error: err?.message });
    throw err;
  }

  // Mark draft as sent
  await query(
    `
      UPDATE email_drafts
      SET status = 'sent',
          sent_at = NOW(),
          sent_provider_message_id = $1,
          updated_at = NOW()
      WHERE id = $2
    `,
    [sendResult.providerMessageId || null, draftId]
  );

  // Insert outbound message into conversation
  if (draft.conversation_id) {
    await query(
      `
        INSERT INTO messages (conversation_id, direction, sender, content, channel)
        VALUES ($1, 'outbound', 'ai', $2, 'email')
      `,
      [draft.conversation_id, draft.body_plain || draft.body_html || '']
    );

    // Update conversation AI response count
    await query(
      `
        UPDATE conversations
        SET ai_response_count = ai_response_count + 1,
            last_message_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [draft.conversation_id]
    );
  }

  // Record outbound email_message for traceability
  await query(
    `
      INSERT INTO email_messages (
        customer_id, email_account_id, provider_message_id, thread_id,
        from_address, to_addresses, cc_addresses, subject, body_plain, body_html,
        received_at, conversation_id, direction, meta
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, 'outbound', $12)
    `,
    [
      customerId,
      draft.email_account_id,
      sendResult.providerMessageId || `sent_${draftId}`,
      draft.thread_id,
      account.email_address,
      draft.to_addresses,
      draft.cc_addresses || [],
      draft.subject,
      draft.body_plain,
      draft.body_html,
      draft.conversation_id,
      { draftId, sentVia: account.provider },
    ]
  );

  logInfo('Email draft sent successfully', {
    draftId,
    customerId,
    provider: account.provider,
    providerMessageId: sendResult.providerMessageId,
  });

  return { success: true, providerMessageId: sendResult.providerMessageId };
};

/**
 * Push a draft into the customer's mailbox provider as an actual draft
 * (Gmail Draft / Outlook Draft) so they can see and edit it in their inbox.
 */
export const pushDraftToProvider = async (draftId, customerId) => {
  const draftResult = await query(
    `SELECT * FROM email_drafts WHERE id = $1 AND customer_id = $2 LIMIT 1`,
    [draftId, customerId]
  );

  if (draftResult.rowCount === 0) {
    throw new Error('Draft not found');
  }

  const draft = draftResult.rows[0];
  if (draft.status !== 'draft') {
    throw new Error(`Draft cannot be pushed (current status: ${draft.status})`);
  }

  const acctResult = await query(
    `SELECT * FROM email_accounts WHERE id = $1 LIMIT 1`,
    [draft.email_account_id]
  );
  const account = acctResult.rows[0];
  if (!account || account.status !== 'active') {
    throw new Error('Email account not found or inactive');
  }

  const accessToken = await ensureValidToken(account);
  if (!accessToken) throw new Error('No valid access token');

  const payload = {
    from: account.display_name
      ? `${account.display_name} <${account.email_address}>`
      : account.email_address,
    to: draft.to_addresses,
    cc: draft.cc_addresses || [],
    subject: draft.subject,
    bodyPlain: draft.body_plain,
    bodyHtml: draft.body_html || null,
    inReplyTo: draft.in_reply_to_provider_id || null,
    threadId: draft.thread_id || null,
  };

  let result;
  if (account.provider === 'gmail') {
    result = await createGmailDraft(accessToken, payload);
  } else if (account.provider === 'outlook') {
    result = await createOutlookDraft(accessToken, payload);
  } else {
    throw new Error(`Unsupported provider: ${account.provider}`);
  }

  // Update draft metadata
  await query(
    `
      UPDATE email_drafts
      SET meta = meta || $1,
          updated_at = NOW()
      WHERE id = $2
    `,
    [
      { pushedToProvider: true, providerDraftId: result.providerDraftId || null },
      draftId,
    ]
  );

  logInfo('Email draft pushed to provider', { draftId, provider: account.provider });

  return { success: true, providerDraftId: result.providerDraftId };
};
