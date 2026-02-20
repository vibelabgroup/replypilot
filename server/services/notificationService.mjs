import sgMail from '@sendgrid/mail';
import { query } from '../utils/db.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { sendSms } from '../sms/gateway.mjs';
import { enqueueJob } from '../utils/redis.mjs';

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = 'noreply@replypilot.dk';
const FROM_NAME = 'Replypilot';

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Send email notification
export const sendEmail = async (to, subject, html, text = null) => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logDebug('Sending email', { to, subject, attempt });

      const msg = {
        to,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      };

      await sgMail.send(msg);

      logInfo('Email sent successfully', { to, subject });

      return { success: true };
    } catch (error) {
      logError('Email send failed', {
        attempt,
        to,
        subject,
        error: error.message,
        code: error.code,
      });

      if (attempt === MAX_RETRIES) {
        return {
          success: false,
          error: error.message,
          code: error.code,
        };
      }

      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }
};

const supportsTypeForEmail = (type, prefs) => {
  switch (type) {
    case 'new_lead':
      return !!prefs.email_new_lead;
    case 'new_message':
      return !!prefs.email_new_message;
    case 'lead_managed':
      return !!prefs.notify_lead_managed;
    case 'lead_converted':
      return !!prefs.notify_lead_converted;
    case 'ai_failed':
      return !!prefs.notify_ai_failed;
    case 'digest':
    case 'weekly_report':
      return true;
    default:
      return true;
  }
};

const supportsTypeForSMS = (type, prefs) => {
  switch (type) {
    case 'new_lead':
      return !!prefs.sms_new_lead;
    case 'new_message':
      return !!prefs.sms_new_message;
    case 'lead_managed':
      return !!prefs.notify_lead_managed;
    case 'lead_converted':
      return !!prefs.notify_lead_converted;
    case 'ai_failed':
      return !!prefs.notify_ai_failed;
    default:
      return false;
  }
};

const buildLeadLink = (payload = {}) => {
  const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (!base) return '';
  const params = new URLSearchParams();
  if (payload.leadId != null) params.set('leadId', String(payload.leadId));
  if (payload.conversationId != null) params.set('conversationId', String(payload.conversationId));
  return `${base}/?${params.toString()}`;
};

const getNotificationRecipients = async (customerId) => {
  const result = await query(
    `SELECT np.*,
            np.user_id::text AS user_id_text,
            COALESCE(u.email, c.email) AS email
     FROM notification_preferences np
     LEFT JOIN users u ON np.user_id = u.id
     LEFT JOIN customers c ON c.id = np.customer_id
     WHERE np.customer_id = $1
     ORDER BY np.user_id NULLS LAST, np.id ASC`,
    [customerId]
  );
  return result.rows;
};

const getDailySentCount = async (customerId, userId, channel) => {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM notification_queue
     WHERE customer_id = $1
       AND (($2::int IS NULL AND user_id IS NULL) OR user_id = $2)
       AND channel = $3
       AND status = 'sent'
       AND sent_at::date = NOW()::date`,
    [customerId, userId, channel]
  );
  return result.rows[0]?.count || 0;
};

const inQuietHours = (prefs, now = new Date()) => {
  if (!prefs.quiet_hours_start || !prefs.quiet_hours_end) {
    return false;
  }
  const [sH, sM] = String(prefs.quiet_hours_start).split(':').map(Number);
  const [eH, eM] = String(prefs.quiet_hours_end).split(':').map(Number);
  if (![sH, sM, eH, eM].every((n) => Number.isFinite(n))) return false;

  const current = now.getHours() * 60 + now.getMinutes();
  const start = sH * 60 + sM;
  const end = eH * 60 + eM;

  if (start === end) return false;
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
};

const computeBucketWindow = (prefs, now = new Date()) => {
  const cadence = prefs.cadence_mode || 'immediate';
  const date = new Date(now);

  if (cadence === 'hourly') {
    const start = new Date(date);
    start.setMinutes(0, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return { windowStart: start, windowEnd: end, scheduledFor: end };
  }

  if (cadence === 'daily') {
    const [digestHour, digestMinute] = String(prefs.digest_time || '09:00').split(':').map(Number);
    const scheduled = new Date(date);
    scheduled.setSeconds(0, 0);
    scheduled.setHours(
      Number.isFinite(digestHour) ? digestHour : 9,
      Number.isFinite(digestMinute) ? digestMinute : 0,
      0,
      0
    );
    if (scheduled <= date) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    const start = new Date(scheduled);
    start.setDate(start.getDate() - 1);
    return { windowStart: start, windowEnd: scheduled, scheduledFor: scheduled };
  }

  const intervalMinutes =
    cadence === 'custom' && Number.isFinite(Number(prefs.cadence_interval_minutes))
      ? Math.max(5, Number(prefs.cadence_interval_minutes))
      : 60;
  const intervalMs = intervalMinutes * 60 * 1000;
  const bucketEndMs = Math.ceil(date.getTime() / intervalMs) * intervalMs;
  const end = new Date(bucketEndMs);
  const start = new Date(bucketEndMs - intervalMs);
  return { windowStart: start, windowEnd: end, scheduledFor: end };
};

const ensureDigestBucket = async (customerId, recipient, channel, eventType, payload) => {
  const now = new Date();
  const { windowStart, windowEnd, scheduledFor } = computeBucketWindow(recipient, now);
  const userId = recipient.user_id ?? null;

  const existing = await query(
    `SELECT id, event_count
     FROM notification_digest_buckets
     WHERE customer_id = $1
       AND (($2::int IS NULL AND user_id IS NULL) OR user_id = $2)
       AND channel = $3
       AND status = 'pending'
       AND window_start = $4
       AND window_end = $5
     LIMIT 1`,
    [customerId, userId, channel, windowStart, windowEnd]
  );

  const eventRecord = {
    eventType,
    occurredAt: now.toISOString(),
    payload,
  };

  if (existing.rowCount > 0) {
    await query(
      `UPDATE notification_digest_buckets
       SET events = events || $1::jsonb,
           event_types = event_types || to_jsonb($2::text),
           event_count = event_count + 1,
           updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify([eventRecord]), eventType, existing.rows[0].id]
    );
    return { bucketId: existing.rows[0].id, created: false };
  }

  const created = await query(
    `INSERT INTO notification_digest_buckets (
       customer_id, user_id, channel, event_types, events, event_count,
       status, window_start, window_end, scheduled_for
     )
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 1, 'pending', $6, $7, $8)
     RETURNING id`,
    [
      customerId,
      userId,
      channel,
      JSON.stringify([eventType]),
      JSON.stringify([eventRecord]),
      windowStart,
      windowEnd,
      scheduledFor,
    ]
  );

  const bucketId = created.rows[0].id;
  await enqueueJob('notification_queue', {
    type: 'notification_flush_digest',
    customerId,
    bucketId,
    createdAt: Date.now(),
    scheduledFor: new Date(scheduledFor).getTime(),
  });

  return { bucketId, created: true };
};

const recordDelivery = async (customerId, userId, type, channel, payload, result) => {
  await query(
    `INSERT INTO notification_queue (customer_id, user_id, type, channel, payload, status, error_message, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $6 = 'sent' THEN NOW() ELSE NULL END)`,
    [
      customerId,
      userId ?? null,
      type,
      channel,
      JSON.stringify(payload || {}),
      result?.success ? 'sent' : 'failed',
      result?.success ? null : result?.error || 'unknown_error',
    ]
  );
};

const deliverToChannel = async (customerId, recipient, channel, type, payload) => {
  const userId = recipient.user_id ?? null;
  const dailyLimit = recipient.max_notifications_per_day;
  if (dailyLimit) {
    const sentToday = await getDailySentCount(customerId, userId, channel);
    if (sentToday >= dailyLimit) {
      return { success: false, suppressed: 'daily_limit' };
    }
  }

  if (inQuietHours(recipient)) {
    return { success: false, suppressed: 'quiet_hours' };
  }

  if (channel === 'email') {
    if (!recipient.email) {
      return { success: false, error: 'missing_email' };
    }
    const result = await sendEmailNotification(type, payload, recipient);
    await recordDelivery(customerId, userId, type, 'email', payload, result);
    return result;
  }

  if (channel === 'sms') {
    if (!recipient.sms_phone) {
      return { success: false, error: 'missing_sms_phone' };
    }
    const result = await sendSMSNotification(customerId, type, payload, recipient);
    await recordDelivery(customerId, userId, type, 'sms', payload, result);
    return result;
  }

  return { success: false, error: 'unknown_channel' };
};

const buildDigestPayload = (bucket) => {
  const events = Array.isArray(bucket.events) ? bucket.events : [];
  const eventTypes = Array.from(new Set(events.map((e) => e?.eventType).filter(Boolean)));
  const latest = events[events.length - 1]?.payload || {};

  return {
    bucketId: bucket.id,
    eventCount: events.length,
    eventTypes,
    events: events.slice(-20),
    leadId: latest.leadId || null,
    conversationId: latest.conversationId || null,
    summary: `Du har ${events.length} nye opdateringer fra AI-agenten.`,
  };
};

const flushDigestBucket = async (bucketId) => {
  const result = await query(
    `SELECT *
     FROM notification_digest_buckets
     WHERE id = $1 AND status = 'pending'
     LIMIT 1`,
    [bucketId]
  );
  if (result.rowCount === 0) {
    return { success: true, skipped: true };
  }

  const bucket = result.rows[0];
  const prefsResult = await query(
    `SELECT np.*,
            np.user_id::text AS user_id_text,
            COALESCE(u.email, c.email) AS email
     FROM notification_preferences np
     LEFT JOIN users u ON np.user_id = u.id
     LEFT JOIN customers c ON c.id = np.customer_id
     WHERE np.customer_id = $1
       AND (($2::int IS NULL AND np.user_id IS NULL) OR np.user_id = $2)
     ORDER BY np.id ASC
     LIMIT 1`,
    [bucket.customer_id, bucket.user_id]
  );

  if (prefsResult.rowCount === 0) {
    await query(
      `UPDATE notification_digest_buckets
       SET status = 'failed', error_message = 'missing_preferences', updated_at = NOW()
       WHERE id = $1`,
      [bucketId]
    );
    return { success: false, error: 'missing_preferences' };
  }

  const prefs = prefsResult.rows[0];
  const payload = buildDigestPayload(bucket);
  const delivery = await deliverToChannel(bucket.customer_id, prefs, bucket.channel, 'digest', payload);

  await query(
    `UPDATE notification_digest_buckets
     SET status = $2,
         sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
         error_message = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [bucketId, delivery.success ? 'sent' : 'failed', delivery.success ? null : delivery.error || delivery.suppressed || 'delivery_failed']
  );

  return delivery;
};

export const emitNotificationEvent = async (customerId, type, data) => {
  const recipients = await getNotificationRecipients(customerId);
  if (recipients.length === 0) {
    logDebug('No notification recipients found', { customerId });
    return { sent: false, reason: 'no_preferences' };
  }

  const results = [];
  for (const recipient of recipients) {
    if (recipient.email_enabled && supportsTypeForEmail(type, recipient)) {
      if (recipient.cadence_mode === 'immediate') {
        const result = await deliverToChannel(customerId, recipient, 'email', type, data);
        results.push({ userId: recipient.user_id, channel: 'email', ...result });
      } else {
        const bucket = await ensureDigestBucket(customerId, recipient, 'email', type, data);
        results.push({ userId: recipient.user_id, channel: 'email', queued: true, bucketId: bucket.bucketId });
      }
    }

    if (recipient.sms_enabled && recipient.sms_phone && supportsTypeForSMS(type, recipient)) {
      if (recipient.cadence_mode === 'immediate') {
        const result = await deliverToChannel(customerId, recipient, 'sms', type, data);
        results.push({ userId: recipient.user_id, channel: 'sms', ...result });
      } else {
        const bucket = await ensureDigestBucket(customerId, recipient, 'sms', type, data);
        results.push({ userId: recipient.user_id, channel: 'sms', queued: true, bucketId: bucket.bucketId });
      }
    }
  }

  return {
    sent: true,
    results,
  };
};

// Send notification based on type (compat wrapper)
export const sendNotification = async (customerId, type, data) => {
  return emitNotificationEvent(customerId, type, data);
};

// Send email notification by type
const sendEmailNotification = async (type, data, prefs) => {
  const leadLink = buildLeadLink(data);
  const templates = {
    new_lead: () => ({
      subject: '🎉 Ny kundeemne modtaget!',
      html: `
        <h2>Ny kundeemne modtaget</h2>
        <p>Du har modtaget en ny henvendelse fra <strong>${data.leadPhone}</strong>.</p>
        <p><strong>Besked:</strong> ${data.message}</p>
        <p><a href="${leadLink}">Se hele lead-detaljen i dashboard</a></p>
      `,
    }),
    new_message: () => ({
      subject: 'Ny besked modtaget',
      html: `
        <h2>Ny besked modtaget</h2>
        <p><strong>Fra:</strong> ${data.leadPhone}</p>
        <p><strong>Besked:</strong> ${data.message}</p>
        <p><a href="${leadLink}">Se hele lead-detaljen i dashboard</a></p>
      `,
    }),
    lead_managed: () => ({
      subject: 'AI-agenten har håndteret et lead',
      html: `
        <h2>Lead opdateret af AI-agenten</h2>
        <p><strong>Lead:</strong> ${data.leadName || data.leadPhone || 'Ukendt lead'}</p>
        <p><strong>Opsummering:</strong> ${data.summary || 'AI-agenten har håndteret en ny opdatering.'}</p>
        <p><a href="${leadLink}">Se alle detaljer i dashboard</a></p>
      `,
    }),
    lead_converted: () => ({
      subject: 'Lead er markeret som konverteret',
      html: `
        <h2>Lead konverteret</h2>
        <p><strong>Lead:</strong> ${data.leadName || data.leadPhone || 'Ukendt lead'}</p>
        <p><strong>Værdi:</strong> ${data.convertedValue ?? 'Ikke angivet'}</p>
        <p><a href="${leadLink}">Se hele forløbet i dashboard</a></p>
      `,
    }),
    ai_failed: () => ({
      subject: 'AI-agenten brugte fallback-besked',
      html: `
        <h2>AI fallback aktiveret</h2>
        <p><strong>Lead:</strong> ${data.leadName || data.leadPhone || 'Ukendt lead'}</p>
        <p><strong>Fejl:</strong> ${data.error || 'Ukendt fejl'}</p>
        <p><a href="${leadLink}">Se alle detaljer i dashboard</a></p>
      `,
    }),
    digest: () => {
      const eventList = Array.isArray(data.events) ? data.events : [];
      const eventLines = eventList
        .slice(-10)
        .map((event) => {
          const payload = event?.payload || {};
          return `<li>${payload.summary || payload.message || event?.eventType || 'Opdatering'} (${new Date(event?.occurredAt || Date.now()).toLocaleString('da-DK')})</li>`;
        })
        .join('');
      return {
        subject: `Opsummering: ${data.eventCount || 0} nye opdateringer`,
        html: `
          <h2>Opsummering fra AI-agenten</h2>
          <p>${data.summary || 'Du har nye opdateringer på leads.'}</p>
          <ul>${eventLines || '<li>Ingen detaljer fundet</li>'}</ul>
          <p><a href="${leadLink || `${process.env.FRONTEND_URL}/` }">Se alle leads i dashboard</a></p>
        `,
      };
    },
    weekly_report: () => ({
      subject: `Ugentlig rapport - ${data.weekRange}`,
      html: `
        <h2>Ugentlig rapport</h2>
        <p><strong>Periode:</strong> ${data.weekRange}</p>
        <h3>Dette uges højdepunkter</h3>
        <ul>
          <li>Samlede samtaler: ${data.totalConversations}</li>
          <li>Nye kundeemner: ${data.newLeads}</li>
          <li>Kvalificerede kundeemner: ${data.qualifiedLeads}</li>
        </ul>
        <p><a href="${process.env.FRONTEND_URL}/">Se analytics</a></p>
      `,
    }),
  };

  const template = templates[type];
  if (!template) {
    return { success: false, error: 'Unknown notification type' };
  }

  const { subject, html } = template();
  return await sendEmail(prefs.email, subject, html);
};

// Send SMS notification by type
const sendSMSNotification = async (customerId, type, data, prefs) => {
  const leadLink = buildLeadLink(data);
  const templates = {
    new_lead: () => `Ny kundeemne: ${data.leadPhone}. Se alle detaljer: ${leadLink}`,
    new_message: () => `Ny besked fra ${data.leadPhone}: ${data.message.substring(0, 100)}${data.message.length > 100 ? '...' : ''} ${leadLink}`.trim(),
    lead_managed: () => `AI har håndteret lead ${data.leadName || data.leadPhone || ''}. ${data.summary || ''} ${leadLink}`.trim(),
    lead_converted: () => `Lead konverteret: ${data.leadName || data.leadPhone || ''}. ${leadLink}`.trim(),
    ai_failed: () => `AI fallback brugt for lead ${data.leadName || data.leadPhone || ''}. ${leadLink}`.trim(),
    digest: () => `Opsummering: ${data.eventCount || 0} opdateringer. Se dashboard: ${leadLink || process.env.FRONTEND_URL}`.trim(),
  };

  const template = templates[type];
  if (!template) {
    return { success: false, error: 'Unknown notification type for SMS' };
  }

  const message = template();
  return await sendSms({
    customerId,
    to: prefs.sms_phone,
    body: message,
  });
};

// Send digest notifications
export const sendDigestNotifications = async (type = 'daily') => {
  const now = new Date();
  const customers = await query(
    `SELECT np.customer_id, np.digest_time, c.email, np.sms_phone, c.name as customer_name
     FROM notification_preferences np
     JOIN customers c ON np.customer_id = c.id
     WHERE np.${type === 'daily' ? 'email_daily_digest' : 'email_weekly_report'} = true
     AND c.status = 'active'`
  );

  const results = [];

  for (const customer of customers.rows) {
    try {
      // Get digest data
      const conversations = await query(
        `SELECT id, lead_phone, lead_name, message_count, created_at
         FROM conversations
         WHERE customer_id = $1
         AND created_at >= $2
         ORDER BY created_at DESC`,
        [customer.customer_id, type === 'daily' ? new Date(now - 24 * 60 * 60 * 1000) : new Date(now - 7 * 24 * 60 * 60 * 1000)]
      );

      const leads = await query(
        `SELECT id, name, phone, qualification, created_at
         FROM leads
         WHERE customer_id = $1
         AND created_at >= $2
         ORDER BY created_at DESC`,
        [customer.customer_id, type === 'daily' ? new Date(now - 24 * 60 * 60 * 1000) : new Date(now - 7 * 24 * 60 * 60 * 1000)]
      );

      const data = {
        date: now.toLocaleDateString('da-DK'),
        weekRange: type === 'weekly' ? `${new Date(now - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('da-DK')} - ${now.toLocaleDateString('da-DK')}` : null,
        conversations: conversations.rows,
        leads: leads.rows,
        totalConversations: conversations.rowCount,
        newLeads: leads.rowCount,
        qualifiedLeads: leads.rows.filter(l => l.qualification === 'hot' || l.qualification === 'warm').length,
      };

      const result = await emitNotificationEvent(
        customer.customer_id,
        type === 'daily' ? 'digest' : 'weekly_report',
        data
      );

      results.push({ customerId: customer.customer_id, ...result });
    } catch (error) {
      logError('Failed to send digest notification', {
        customerId: customer.customer_id,
        type,
        error: error.message,
      });
      results.push({ customerId: customer.customer_id, success: false, error: error.message });
    }
  }

  return results;
};

// Process notification job (for workers)
export const processNotificationJob = async (job) => {
  if (job?.type === 'notification_flush_digest') {
    return flushDigestBucket(job.bucketId);
  }

  const { customerId, notificationType, payload } = job;
  return emitNotificationEvent(customerId, notificationType, payload);
};