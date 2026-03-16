import { query, withTransaction } from '../utils/db.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { enqueueJob } from '../utils/redis.mjs';
import { ensureValidToken, scheduleNextSync } from './emailTokenService.mjs';

// ---------------------------------------------------------------------------
// Gmail helpers
// ---------------------------------------------------------------------------

const GMAIL_BASE = 'https://www.googleapis.com/gmail/v1/users/me';

const gmailFetch = async (accessToken, path, opts = {}) => {
  const url = path.startsWith('http') ? path : `${GMAIL_BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gmail API ${res.status}: ${text}`);
  }
  return res.json();
};

/**
 * Fetch new messages from Gmail since the stored historyId cursor.
 * Falls back to listing recent INBOX messages on first sync.
 */
const fetchGmailMessages = async (accessToken, syncCursor) => {
  const messageIds = [];

  if (syncCursor) {
    // Incremental sync via history API
    try {
      const history = await gmailFetch(
        accessToken,
        `/history?startHistoryId=${syncCursor}&historyTypes=messageAdded&labelIds=INBOX&maxResults=100`
      );

      const newHistoryId = history.historyId;

      if (Array.isArray(history.history)) {
        for (const h of history.history) {
          if (Array.isArray(h.messagesAdded)) {
            for (const ma of h.messagesAdded) {
              if (ma.message?.id) {
                messageIds.push(ma.message.id);
              }
            }
          }
        }
      }

      return { messageIds: [...new Set(messageIds)], newCursor: newHistoryId };
    } catch (err) {
      // historyId may be expired – fall back to full list
      logError('Gmail history fetch failed, falling back to list', { error: err?.message });
    }
  }

  // Full list (first sync or history expired)
  const list = await gmailFetch(
    accessToken,
    '/messages?labelIds=INBOX&maxResults=25&q=is:unread'
  );

  const ids = Array.isArray(list.messages) ? list.messages.map((m) => m.id) : [];

  // Get current historyId for future incremental sync
  const profile = await gmailFetch(accessToken, '/profile');
  const newCursor = profile.historyId ? String(profile.historyId) : null;

  return { messageIds: ids, newCursor };
};

/**
 * Fetch a single Gmail message by id (full format).
 */
const fetchGmailMessageDetail = async (accessToken, messageId) => {
  const msg = await gmailFetch(accessToken, `/messages/${messageId}?format=full`);
  return normalizeGmailMessage(msg);
};

const getGmailHeader = (headers, name) => {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : null;
};

const decodeBase64Url = (str) => {
  if (!str) return '';
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
};

const extractGmailBody = (payload) => {
  let plain = '';
  let html = '';

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if ((payload.mimeType || '').includes('html')) {
      html = decoded;
    } else {
      plain = decoded;
    }
  }

  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data && !plain) {
        plain = decodeBase64Url(part.body.data);
      }
      if (part.mimeType === 'text/html' && part.body?.data && !html) {
        html = decodeBase64Url(part.body.data);
      }
      // Recurse for multipart/alternative, multipart/mixed
      if (Array.isArray(part.parts)) {
        const nested = extractGmailBody(part);
        if (!plain && nested.plain) plain = nested.plain;
        if (!html && nested.html) html = nested.html;
      }
    }
  }

  return { plain, html };
};

const parseEmailAddresses = (header) => {
  if (!header) return [];
  return header
    .split(',')
    .map((s) => {
      const match = s.match(/<([^>]+)>/);
      return (match ? match[1] : s).trim().toLowerCase();
    })
    .filter(Boolean);
};

const normalizeGmailMessage = (msg) => {
  const headers = msg.payload?.headers || [];
  const { plain, html } = extractGmailBody(msg.payload || {});

  return {
    providerMessageId: msg.id,
    threadId: msg.threadId || null,
    from: (getGmailHeader(headers, 'From') || '').trim(),
    fromAddress: parseEmailAddresses(getGmailHeader(headers, 'From'))[0] || '',
    toAddresses: parseEmailAddresses(getGmailHeader(headers, 'To')),
    ccAddresses: parseEmailAddresses(getGmailHeader(headers, 'Cc')),
    subject: getGmailHeader(headers, 'Subject') || '(no subject)',
    snippet: msg.snippet || '',
    bodyPlain: plain,
    bodyHtml: html,
    receivedAt: msg.internalDate
      ? new Date(Number(msg.internalDate)).toISOString()
      : new Date().toISOString(),
    messageIdHeader: getGmailHeader(headers, 'Message-ID') || null,
    inReplyTo: getGmailHeader(headers, 'In-Reply-To') || null,
    labels: msg.labelIds || [],
  };
};

// ---------------------------------------------------------------------------
// Outlook / Microsoft Graph helpers
// ---------------------------------------------------------------------------

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0/me';

const graphFetch = async (accessToken, path, opts = {}) => {
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Graph API ${res.status}: ${text}`);
  }
  return res.json();
};

/**
 * Fetch new messages from Outlook using delta link or initial query.
 */
const fetchOutlookMessages = async (accessToken, syncCursor) => {
  const messages = [];
  let newCursor = null;

  const url = syncCursor
    ? syncCursor // deltaLink from last sync
    : '/mailFolders/inbox/messages/delta?$top=25&$select=id,conversationId,from,toRecipients,ccRecipients,subject,bodyPreview,body,receivedDateTime,internetMessageId,internetMessageHeaders&$filter=isRead eq false';

  let nextLink = url;

  while (nextLink) {
    const data = await graphFetch(accessToken, nextLink);

    if (Array.isArray(data.value)) {
      for (const m of data.value) {
        messages.push(normalizeOutlookMessage(m));
      }
    }

    nextLink = data['@odata.nextLink'] || null;
    if (data['@odata.deltaLink']) {
      newCursor = data['@odata.deltaLink'];
      nextLink = null; // done
    }

    // Safety cap
    if (messages.length >= 100) break;
  }

  return { messages, newCursor };
};

const normalizeOutlookMessage = (m) => {
  const fromAddr =
    m.from?.emailAddress?.address?.toLowerCase() || '';
  const toAddresses = (m.toRecipients || [])
    .map((r) => r.emailAddress?.address?.toLowerCase())
    .filter(Boolean);
  const ccAddresses = (m.ccRecipients || [])
    .map((r) => r.emailAddress?.address?.toLowerCase())
    .filter(Boolean);

  const headers = m.internetMessageHeaders || [];
  const inReplyToHeader = headers.find(
    (h) => h.name.toLowerCase() === 'in-reply-to'
  );

  return {
    providerMessageId: m.id,
    threadId: m.conversationId || null,
    from: m.from?.emailAddress?.name
      ? `${m.from.emailAddress.name} <${fromAddr}>`
      : fromAddr,
    fromAddress: fromAddr,
    toAddresses,
    ccAddresses,
    subject: m.subject || '(no subject)',
    snippet: m.bodyPreview || '',
    bodyPlain: m.body?.contentType === 'text' ? (m.body.content || '') : '',
    bodyHtml: m.body?.contentType === 'html' ? (m.body.content || '') : '',
    receivedAt: m.receivedDateTime
      ? new Date(m.receivedDateTime).toISOString()
      : new Date().toISOString(),
    messageIdHeader: m.internetMessageId || null,
    inReplyTo: inReplyToHeader?.value || null,
    labels: [],
  };
};

// ---------------------------------------------------------------------------
// Unified ingestion pipeline
// ---------------------------------------------------------------------------

/**
 * Determine the store_connection_id for a customer's email if the sender
 * matches one of the support_emails configured on a store connection.
 * This links incoming support emails to the correct e-commerce store.
 */
const resolveStoreConnection = async (customerId, fromAddress) => {
  if (!fromAddress) return null;

  const result = await query(
    `
      SELECT id
      FROM store_connections
      WHERE customer_id = $1
        AND status = 'active'
        AND $2 = ANY(support_emails)
      LIMIT 1
    `,
    [customerId, fromAddress.toLowerCase()]
  );

  return result.rows[0]?.id || null;
};

/**
 * Find or create a conversation for an incoming email.
 * Groups by thread_id within the same email_account; falls back to
 * from_address matching within recent window.
 */
const findOrCreateConversation = async (client, {
  customerId,
  emailAccountId,
  threadId,
  fromAddress,
  subject,
  storeConnectionId,
}) => {
  // Try thread match first
  if (threadId) {
    const existing = await client.query(
      `
        SELECT id
        FROM conversations
        WHERE customer_id = $1
          AND email_account_id = $2
          AND email_thread_id = $3
          AND status != 'closed'
        LIMIT 1
      `,
      [customerId, emailAccountId, threadId]
    );
    if (existing.rowCount > 0) {
      return { conversationId: existing.rows[0].id, isNew: false };
    }
  }

  // Try recent conversation from same sender (within 48h)
  if (fromAddress) {
    const recent = await client.query(
      `
        SELECT id
        FROM conversations
        WHERE customer_id = $1
          AND email_account_id = $2
          AND lead_email = $3
          AND channel = 'email'
          AND status != 'closed'
          AND last_message_at > NOW() - INTERVAL '48 hours'
        ORDER BY last_message_at DESC
        LIMIT 1
      `,
      [customerId, emailAccountId, fromAddress]
    );
    if (recent.rowCount > 0) {
      // Update thread_id if we now have one
      if (threadId) {
        await client.query(
          `UPDATE conversations SET email_thread_id = $1 WHERE id = $2`,
          [threadId, recent.rows[0].id]
        );
      }
      return { conversationId: recent.rows[0].id, isNew: false };
    }
  }

  // Create new conversation
  const result = await client.query(
    `
      INSERT INTO conversations (
        customer_id,
        email_account_id,
        email_thread_id,
        email_subject,
        lead_name,
        lead_email,
        lead_source,
        channel,
        status,
        store_connection_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'email', 'email', 'active', $7)
      RETURNING id
    `,
    [
      customerId,
      emailAccountId,
      threadId || null,
      subject || null,
      fromAddress, // lead_name defaults to email
      fromAddress,
      storeConnectionId || null,
    ]
  );

  const conversationId = result.rows[0].id;

  // Create lead record
  await client.query(
    `
      INSERT INTO leads (customer_id, conversation_id, name, phone, email, source)
      VALUES ($1, $2, $3, '', $4, 'email')
    `,
    [customerId, conversationId, fromAddress, fromAddress]
  );

  return { conversationId, isNew: true };
};

/**
 * Persist a normalized email message and link it to a conversation.
 * Returns { emailMessageId, conversationId, isNewConversation, isDuplicate }.
 */
export const ingestEmailMessage = async (emailAccount, normalizedMsg) => {
  const {
    id: emailAccountId,
    customer_id: customerId,
  } = emailAccount;

  return withTransaction(async (client) => {
    // De-duplicate by provider_message_id
    const dupeCheck = await client.query(
      `
        SELECT id
        FROM email_messages
        WHERE email_account_id = $1 AND provider_message_id = $2
        LIMIT 1
      `,
      [emailAccountId, normalizedMsg.providerMessageId]
    );

    if (dupeCheck.rowCount > 0) {
      return { emailMessageId: dupeCheck.rows[0].id, isDuplicate: true };
    }

    // Resolve store connection
    const storeConnectionId = await resolveStoreConnection(
      customerId,
      normalizedMsg.fromAddress
    );

    // Find or create conversation
    const { conversationId, isNew: isNewConversation } =
      await findOrCreateConversation(client, {
        customerId,
        emailAccountId,
        threadId: normalizedMsg.threadId,
        fromAddress: normalizedMsg.fromAddress,
        subject: normalizedMsg.subject,
        storeConnectionId,
      });

    // Insert email_message
    const emResult = await client.query(
      `
        INSERT INTO email_messages (
          customer_id,
          email_account_id,
          provider_message_id,
          thread_id,
          from_address,
          to_addresses,
          cc_addresses,
          subject,
          snippet,
          body_plain,
          body_html,
          received_at,
          store_connection_id,
          conversation_id,
          direction,
          meta
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'inbound', $15)
        RETURNING id
      `,
      [
        customerId,
        emailAccountId,
        normalizedMsg.providerMessageId,
        normalizedMsg.threadId,
        normalizedMsg.fromAddress,
        normalizedMsg.toAddresses,
        normalizedMsg.ccAddresses,
        normalizedMsg.subject,
        normalizedMsg.snippet,
        normalizedMsg.bodyPlain,
        normalizedMsg.bodyHtml,
        normalizedMsg.receivedAt,
        storeConnectionId,
        conversationId,
        {
          messageIdHeader: normalizedMsg.messageIdHeader,
          inReplyTo: normalizedMsg.inReplyTo,
          labels: normalizedMsg.labels,
        },
      ]
    );

    const emailMessageId = emResult.rows[0].id;

    // Insert a messages row (conversation message) for the AI pipeline
    const msgContent =
      normalizedMsg.bodyPlain ||
      normalizedMsg.snippet ||
      normalizedMsg.subject ||
      '(empty email)';

    await client.query(
      `
        INSERT INTO messages (
          conversation_id,
          direction,
          sender,
          content,
          channel,
          email_message_id
        )
        VALUES ($1, 'inbound', 'lead', $2, 'email', $3)
      `,
      [conversationId, msgContent, emailMessageId]
    );

    return {
      emailMessageId,
      conversationId,
      isNewConversation,
      isDuplicate: false,
      storeConnectionId,
    };
  });
};

// ---------------------------------------------------------------------------
// Top-level sync entry point (called by the email worker)
// ---------------------------------------------------------------------------

/**
 * Sync a single email account: fetch new messages, ingest them, then
 * schedule AI draft generation for each new inbound email.
 */
export const syncEmailAccount = async (emailAccount) => {
  const { id: emailAccountId, provider, customer_id: customerId } = emailAccount;

  logDebug('Starting email sync', { emailAccountId, provider });

  // Ensure valid token
  const accessToken = await ensureValidToken(emailAccount);
  if (!accessToken) {
    logError('Skipping sync – no valid access token', { emailAccountId });
    await scheduleNextSync(emailAccountId, 5); // retry in 5 min
    return { success: false, reason: 'no_token' };
  }

  let normalizedMessages = [];
  let newCursor = emailAccount.sync_cursor;

  try {
    if (provider === 'gmail') {
      const { messageIds, newCursor: gmailCursor } = await fetchGmailMessages(
        accessToken,
        emailAccount.sync_cursor
      );
      newCursor = gmailCursor;

      // Fetch details for each message id
      for (const msgId of messageIds) {
        try {
          const detail = await fetchGmailMessageDetail(accessToken, msgId);
          normalizedMessages.push(detail);
        } catch (err) {
          logError('Failed to fetch Gmail message detail', {
            emailAccountId,
            messageId: msgId,
            error: err?.message,
          });
        }
      }
    } else if (provider === 'outlook') {
      const { messages, newCursor: outlookCursor } = await fetchOutlookMessages(
        accessToken,
        emailAccount.sync_cursor
      );
      newCursor = outlookCursor;
      normalizedMessages = messages;
    } else {
      logError('Unsupported email provider for sync', { provider, emailAccountId });
      return { success: false, reason: 'unsupported_provider' };
    }
  } catch (err) {
    logError('Email fetch failed', { emailAccountId, provider, error: err?.message });
    await scheduleNextSync(emailAccountId, 5);
    return { success: false, reason: 'fetch_error', error: err?.message };
  }

  // Filter out emails sent BY the connected account (outbound)
  const accountEmail = emailAccount.email_address?.toLowerCase();
  const inboundMessages = normalizedMessages.filter(
    (m) => m.fromAddress?.toLowerCase() !== accountEmail
  );

  let ingested = 0;

  for (const msg of inboundMessages) {
    try {
      const result = await ingestEmailMessage(emailAccount, msg);

      if (result.isDuplicate) continue;
      ingested++;

      // Queue AI draft generation for this new inbound email
      await enqueueJob('email_draft_queue', {
        type: 'email_draft_generate',
        customerId,
        emailAccountId,
        conversationId: result.conversationId,
        emailMessageId: result.emailMessageId,
        isNewConversation: result.isNewConversation,
        storeConnectionId: result.storeConnectionId,
        createdAt: Date.now(),
      });

      logInfo('Email ingested and draft queued', {
        emailAccountId,
        emailMessageId: result.emailMessageId,
        conversationId: result.conversationId,
        isNew: result.isNewConversation,
      });
    } catch (err) {
      logError('Failed to ingest email message', {
        emailAccountId,
        providerMessageId: msg.providerMessageId,
        error: err?.message,
      });
    }
  }

  // Persist new cursor
  if (newCursor) {
    await query(
      `
        UPDATE email_accounts
        SET sync_cursor    = $1,
            sync_error     = NULL,
            sync_error_count = 0,
            updated_at     = NOW()
        WHERE id = $2
      `,
      [newCursor, emailAccountId]
    );
  }

  await scheduleNextSync(emailAccountId, 2); // poll every 2 min

  logInfo('Email sync completed', { emailAccountId, provider, fetched: normalizedMessages.length, ingested });

  return { success: true, fetched: normalizedMessages.length, ingested };
};
