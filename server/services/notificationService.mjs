import sgMail from '@sendgrid/mail';
import { query } from '../utils/db.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { sendSms } from '../sms/gateway.mjs';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

// Send notification based on type
export const sendNotification = async (customerId, type, data) => {
  // Get notification preferences
  const prefsResult = await query(
    `SELECT np.*, u.email, u.id as user_id
     FROM notification_preferences np
     JOIN users u ON np.customer_id = u.customer_id
     WHERE np.customer_id = $1
     LIMIT 1`,
    [customerId]
  );

  if (prefsResult.rowCount === 0) {
    logDebug('No notification preferences found', { customerId });
    return { sent: false, reason: 'no_preferences' };
  }

  const prefs = prefsResult.rows[0];
  const results = [];

  // Send email notification
  if (prefs.email_enabled && shouldSendEmail(type, prefs)) {
    const emailResult = await sendEmailNotification(type, data, prefs);
    results.push({ channel: 'email', ...emailResult });
  }

  // Send SMS notification
  if (prefs.sms_enabled && prefs.sms_phone && shouldSendSMS(type, prefs)) {
    const smsResult = await sendSMSNotification(customerId, type, data, prefs);
    results.push({ channel: 'sms', ...smsResult });
  }

  // Record in notification queue
  await query(
    `INSERT INTO notification_queue (customer_id, user_id, type, channel, payload, status)
     VALUES ($1, $2, $3, $4, $5, 'sent')`,
    [customerId, prefs.user_id, type, results.map(r => r.channel).join(','), JSON.stringify(data)]
  );

  return { sent: true, results };
};

// Check if should send email
const shouldSendEmail = (type, prefs) => {
  switch (type) {
    case 'new_lead':
      return prefs.email_new_lead;
    case 'new_message':
      return prefs.email_new_message;
    case 'digest':
      return prefs.email_daily_digest;
    case 'weekly_report':
      return prefs.email_weekly_report;
    default:
      return true;
  }
};

// Check if should send SMS
const shouldSendSMS = (type, prefs) => {
  switch (type) {
    case 'new_lead':
      return prefs.sms_new_lead;
    case 'new_message':
      return prefs.sms_new_message;
    default:
      return false;
  }
};

// Send email notification by type
const sendEmailNotification = async (type, data, prefs) => {
  const templates = {
    new_lead: () => ({
      subject: '🎉 Ny kundeemne modtaget!',
      html: `
        <h2>Ny kundeemne modtaget</h2>
        <p>Du har modtaget en ny henvendelse fra <strong>${data.leadPhone}</strong>.</p>
        <p><strong>Besked:</strong> ${data.message}</p>
        <p><a href="${process.env.FRONTEND_URL}/dashboard/conversations/${data.conversationId}">Se samtalen</a></p>
      `,
    }),
    new_message: () => ({
      subject: 'Ny besked modtaget',
      html: `
        <h2>Ny besked modtaget</h2>
        <p><strong>Fra:</strong> ${data.leadPhone}</p>
        <p><strong>Besked:</strong> ${data.message}</p>
        <p><a href="${process.env.FRONTEND_URL}/dashboard/conversations/${data.conversationId}">Se samtalen</a></p>
      `,
    }),
    digest: () => {
      const conversations = data.conversations || [];
      const leads = data.leads || [];
      return {
        subject: `Daglig opsummering - ${data.date}`,
        html: `
          <h2>Daglig opsummering</h2>
          <p><strong>Dato:</strong> ${data.date}</p>
          <h3>Statistik</h3>
          <ul>
            <li>Nye samtaler: ${conversations.length}</li>
            <li>Nye kundeemner: ${leads.length}</li>
          </ul>
          <p><a href="${process.env.FRONTEND_URL}/dashboard">Se dashboard</a></p>
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
        <p><a href="${process.env.FRONTEND_URL}/dashboard/analytics">Se analytics</a></p>
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
  const templates = {
    new_lead: () => `Ny kundeemne: ${data.leadPhone}. Se Replypilot dashboard for besked.`,
    new_message: () => `Ny besked fra ${data.leadPhone}: ${data.message.substring(0, 100)}${data.message.length > 100 ? '...' : ''}`,
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
    `SELECT np.customer_id, np.digest_time, np.email, np.sms_phone, c.name as customer_name
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

      const result = await sendNotification(
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
  const { customerId, notificationType, payload } = job;
  return await sendNotification(customerId, notificationType, payload);
};