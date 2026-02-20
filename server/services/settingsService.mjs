import { query } from '../utils/db.mjs';
import { logInfo, logDebug } from '../utils/logger.mjs';

// Get company settings
export const getCompanySettings = async (customerId) => {
  const result = await query(
    `SELECT * FROM company_settings WHERE customer_id = $1`,
    [customerId]
  );

  if (result.rowCount === 0) {
    // Return default settings
    return getDefaultCompanySettings(customerId);
  }

  return result.rows[0];
};

// Update company settings
export const updateCompanySettings = async (customerId, data) => {
  const {
    companyName,
    website,
    industry,
    address,
    city,
    postalCode,
    country,
    businessHours,
    timezone,
  } = data;

  const result = await query(
    `INSERT INTO company_settings (
       customer_id, company_name, website, industry, address, city, postal_code, 
       country, business_hours, timezone
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (customer_id) DO UPDATE SET
       company_name = EXCLUDED.company_name,
       website = EXCLUDED.website,
       industry = EXCLUDED.industry,
       address = EXCLUDED.address,
       city = EXCLUDED.city,
       postal_code = EXCLUDED.postal_code,
       country = EXCLUDED.country,
       business_hours = EXCLUDED.business_hours,
       timezone = EXCLUDED.timezone,
       updated_at = NOW()
     RETURNING *`,
    [
      customerId,
      companyName,
      website,
      industry,
      address,
      city,
      postalCode,
      country || 'DK',
      JSON.stringify(businessHours),
      timezone || 'Europe/Copenhagen',
    ]
  );

  logInfo('Company settings updated', { customerId });

  return result.rows[0];
};

// Get AI settings
export const getAISettings = async (customerId) => {
  const result = await query(
    `SELECT * FROM ai_settings WHERE customer_id = $1`,
    [customerId]
  );

  if (result.rowCount === 0) {
    return getDefaultAISettings(customerId);
  }

  return result.rows[0];
};

// Update AI settings
export const updateAISettings = async (customerId, data) => {
  const {
    systemPrompt,
    temperature,
    maxTokens,
    responseTone,
    language,
    enableGreetings,
    greetingTemplate,
    enableClosings,
    closingTemplate,
    autoResponseEnabled,
    autoResponseDelaySeconds,
    workingHoursOnly,
    fallbackMessage,
  } = data;

  const result = await query(
    `INSERT INTO ai_settings (
       customer_id, system_prompt, temperature, max_tokens, response_tone, 
       language, enable_greetings, greeting_template, enable_closings, 
       closing_template, auto_response_enabled, auto_response_delay_seconds, 
       working_hours_only, fallback_message
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (customer_id) DO UPDATE SET
       system_prompt = EXCLUDED.system_prompt,
       temperature = EXCLUDED.temperature,
       max_tokens = EXCLUDED.max_tokens,
       response_tone = EXCLUDED.response_tone,
       language = EXCLUDED.language,
       enable_greetings = EXCLUDED.enable_greetings,
       greeting_template = EXCLUDED.greeting_template,
       enable_closings = EXCLUDED.enable_closings,
       closing_template = EXCLUDED.closing_template,
       auto_response_enabled = EXCLUDED.auto_response_enabled,
       auto_response_delay_seconds = EXCLUDED.auto_response_delay_seconds,
       working_hours_only = EXCLUDED.working_hours_only,
       fallback_message = EXCLUDED.fallback_message,
       updated_at = NOW()
     RETURNING *`,
    [
      customerId,
      systemPrompt,
      temperature,
      maxTokens,
      responseTone,
      language || 'da',
      enableGreetings,
      greetingTemplate,
      enableClosings,
      closingTemplate,
      autoResponseEnabled,
      autoResponseDelaySeconds,
      workingHoursOnly,
      fallbackMessage,
    ]
  );

  logInfo('AI settings updated', { customerId });

  return result.rows[0];
};

// Get notification preferences
export const getNotificationPreferences = async (customerId, userId = null) => {
  let query_sql = `SELECT * FROM notification_preferences WHERE customer_id = $1`;
  let params = [customerId];

  if (userId) {
    query_sql += ` AND user_id = $2`;
    params.push(userId);
  }

  query_sql += ` LIMIT 1`;

  const result = await query(query_sql, params);

  if (result.rowCount === 0) {
    return getDefaultNotificationPreferences(customerId, userId);
  }

  return result.rows[0];
};

// Update notification preferences
export const updateNotificationPreferences = async (customerId, userId, data) => {
  const {
    emailEnabled,
    emailNewLead,
    emailNewMessage,
    emailDailyDigest,
    emailWeeklyReport,
    smsEnabled,
    smsPhone,
    smsNewLead,
    smsNewMessage,
    notifyLeadManaged,
    notifyLeadConverted,
    notifyAiFailed,
    cadenceMode,
    cadenceIntervalMinutes,
    maxNotificationsPerDay,
    quietHoursStart,
    quietHoursEnd,
    timezone,
    digestType,
    digestTime,
  } = data;

  const result = await query(
    `INSERT INTO notification_preferences (
       customer_id, user_id, email_enabled, email_new_lead, email_new_message,
       email_daily_digest, email_weekly_report, sms_enabled, sms_phone,
       sms_new_lead, sms_new_message, notify_lead_managed, notify_lead_converted,
       notify_ai_failed, cadence_mode, cadence_interval_minutes, max_notifications_per_day,
       quiet_hours_start, quiet_hours_end, timezone, digest_type, digest_time
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
     ON CONFLICT (customer_id, user_id) DO UPDATE SET
       email_enabled = EXCLUDED.email_enabled,
       email_new_lead = EXCLUDED.email_new_lead,
       email_new_message = EXCLUDED.email_new_message,
       email_daily_digest = EXCLUDED.email_daily_digest,
       email_weekly_report = EXCLUDED.email_weekly_report,
       sms_enabled = EXCLUDED.sms_enabled,
       sms_phone = EXCLUDED.sms_phone,
       sms_new_lead = EXCLUDED.sms_new_lead,
       sms_new_message = EXCLUDED.sms_new_message,
       notify_lead_managed = EXCLUDED.notify_lead_managed,
       notify_lead_converted = EXCLUDED.notify_lead_converted,
       notify_ai_failed = EXCLUDED.notify_ai_failed,
       cadence_mode = EXCLUDED.cadence_mode,
       cadence_interval_minutes = EXCLUDED.cadence_interval_minutes,
       max_notifications_per_day = EXCLUDED.max_notifications_per_day,
       quiet_hours_start = EXCLUDED.quiet_hours_start,
       quiet_hours_end = EXCLUDED.quiet_hours_end,
       timezone = EXCLUDED.timezone,
       digest_type = EXCLUDED.digest_type,
       digest_time = EXCLUDED.digest_time,
       updated_at = NOW()
     RETURNING *`,
    [
      customerId,
      userId,
      emailEnabled,
      emailNewLead,
      emailNewMessage,
      emailDailyDigest,
      emailWeeklyReport,
      smsEnabled,
      smsPhone,
      smsNewLead,
      smsNewMessage,
      notifyLeadManaged,
      notifyLeadConverted,
      notifyAiFailed,
      cadenceMode,
      cadenceIntervalMinutes,
      maxNotificationsPerDay,
      quietHoursStart || null,
      quietHoursEnd || null,
      timezone || 'Europe/Copenhagen',
      digestType,
      digestTime,
    ]
  );

  logInfo('Notification preferences updated', { customerId, userId });

  return result.rows[0];
};

// Get routing rules
export const getRoutingRules = async (customerId) => {
  const result = await query(
    `SELECT * FROM routing_rules 
     WHERE customer_id = $1 
     ORDER BY priority DESC, created_at ASC`,
    [customerId]
  );

  return result.rows;
};

// Create routing rule
export const createRoutingRule = async (customerId, data) => {
  const { name, priority, conditionType, conditionValue, action, actionConfig } = data;

  const result = await query(
    `INSERT INTO routing_rules (
       customer_id, name, priority, condition_type, condition_value, action, action_config
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [customerId, name, priority, conditionType, conditionValue, action, JSON.stringify(actionConfig)]
  );

  logInfo('Routing rule created', { customerId, ruleId: result.rows[0].id });

  return result.rows[0];
};

// Update routing rule
export const updateRoutingRule = async (customerId, ruleId, data) => {
  const { name, priority, conditionType, conditionValue, action, actionConfig, isActive } = data;

  const result = await query(
    `UPDATE routing_rules
     SET name = COALESCE($3, name),
         priority = COALESCE($4, priority),
         condition_type = COALESCE($5, condition_type),
         condition_value = COALESCE($6, condition_value),
         action = COALESCE($7, action),
         action_config = COALESCE($8, action_config),
         is_active = COALESCE($9, is_active),
         updated_at = NOW()
     WHERE id = $1 AND customer_id = $2
     RETURNING *`,
    [ruleId, customerId, name, priority, conditionType, conditionValue, action, 
     actionConfig ? JSON.stringify(actionConfig) : null, isActive]
  );

  if (result.rowCount === 0) {
    return null;
  }

  logInfo('Routing rule updated', { customerId, ruleId });

  return result.rows[0];
};

// Delete routing rule
export const deleteRoutingRule = async (customerId, ruleId) => {
  const result = await query(
    `DELETE FROM routing_rules
     WHERE id = $1 AND customer_id = $2
     RETURNING id`,
    [ruleId, customerId]
  );

  return result.rowCount > 0;
};

// Get SMS templates
export const getSMSTemplates = async (customerId) => {
  const result = await query(
    `SELECT * FROM sms_templates 
     WHERE customer_id = $1 
     ORDER BY category, name`,
    [customerId]
  );

  return result.rows;
};

// Create SMS template
export const createSMSTemplate = async (customerId, data) => {
  const { name, category, content, variables } = data;

  const result = await query(
    `INSERT INTO sms_templates (customer_id, name, category, content, variables)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [customerId, name, category, content, JSON.stringify(variables || [])]
  );

  logInfo('SMS template created', { customerId, templateId: result.rows[0].id });

  return result.rows[0];
};

// Update SMS template
export const updateSMSTemplate = async (customerId, templateId, data) => {
  const { name, category, content, variables, isActive } = data;

  const result = await query(
    `UPDATE sms_templates
     SET name = COALESCE($3, name),
         category = COALESCE($4, category),
         content = COALESCE($5, content),
         variables = COALESCE($6, variables),
         is_active = COALESCE($7, is_active),
         updated_at = NOW()
     WHERE id = $1 AND customer_id = $2
     RETURNING *`,
    [templateId, customerId, name, category, content, 
     variables ? JSON.stringify(variables) : null, isActive]
  );

  if (result.rowCount === 0) {
    return null;
  }

  logInfo('SMS template updated', { customerId, templateId });

  return result.rows[0];
};

// Delete SMS template
export const deleteSMSTemplate = async (customerId, templateId) => {
  const result = await query(
    `DELETE FROM sms_templates
     WHERE id = $1 AND customer_id = $2
     RETURNING id`,
    [templateId, customerId]
  );

  return result.rowCount > 0;
};

// Default settings helpers
const getDefaultCompanySettings = (customerId) => ({
  customer_id: customerId,
  company_name: '',
  website: '',
  industry: '',
  address: '',
  city: '',
  postal_code: '',
  country: 'DK',
  business_hours: {
    monday: { open: '08:00', close: '17:00' },
    tuesday: { open: '08:00', close: '17:00' },
    wednesday: { open: '08:00', close: '17:00' },
    thursday: { open: '08:00', close: '17:00' },
    friday: { open: '08:00', close: '17:00' },
    saturday: { open: '', close: '' },
    sunday: { open: '', close: '' },
  },
  timezone: 'Europe/Copenhagen',
});

const getDefaultAISettings = (customerId) => ({
  customer_id: customerId,
  system_prompt: '',
  temperature: 0.7,
  max_tokens: 500,
  response_tone: 'professional',
  language: 'da',
  enable_greetings: true,
  greeting_template: null,
  enable_closings: true,
  closing_template: null,
  auto_response_enabled: true,
  auto_response_delay_seconds: 30,
  working_hours_only: false,
  fallback_message: null,
});

const getDefaultNotificationPreferences = (customerId, userId) => ({
  customer_id: customerId,
  user_id: userId,
  email_enabled: true,
  email_new_lead: true,
  email_new_message: false,
  email_daily_digest: true,
  email_weekly_report: true,
  sms_enabled: false,
  sms_phone: null,
  sms_new_lead: true,
  sms_new_message: false,
  notify_lead_managed: true,
  notify_lead_converted: true,
  notify_ai_failed: true,
  cadence_mode: 'immediate',
  cadence_interval_minutes: null,
  max_notifications_per_day: null,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: 'Europe/Copenhagen',
  digest_type: 'daily',
  digest_time: '09:00',
});