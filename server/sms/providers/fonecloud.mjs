import { createSmsProvider } from '../contract.mjs';
import { logError, logInfo, logDebug } from '../../utils/logger.mjs';

const getConfig = () => {
  const baseUrl = process.env.FONECLOUD_API_BASE_URL;
  const token = process.env.FONECLOUD_TOKEN;
  const defaultSender = process.env.FONECLOUD_DEFAULT_SENDER_ID || 'SMS';

  return { baseUrl, token, defaultSender };
};

const buildSendUrl = ({ baseUrl, token, phone, senderID, text, options = {} }) => {
  const url = new URL('/send', baseUrl);
  url.searchParams.set('token', token);
  url.searchParams.set('phone', phone);
  url.searchParams.set('senderID', senderID);
  url.searchParams.set('text', text);

  // Optional parameters
  if (options.type) url.searchParams.set('type', options.type);
  if (options.lifetime) url.searchParams.set('lifetime', String(options.lifetime));
  if (options.beginDate) url.searchParams.set('beginDate', options.beginDate);
  if (options.beginTime) url.searchParams.set('beginTime', options.beginTime);
  if (options.callback_url) url.searchParams.set('callback_url', options.callback_url);
  if (options.delivery) url.searchParams.set('delivery', String(options.delivery));

  // Default type if not provided
  if (!url.searchParams.has('type')) {
    url.searchParams.set('type', 'sms');
  }

  return url;
};

const extractProviderMessageId = (payload, phone) => {
  try {
    if (!payload || typeof payload !== 'object') return undefined;

    const phoneKey = phone in payload ? phone : Object.keys(payload)[0];
    const value = payload[phoneKey];

    if (!value) return undefined;

    if (Array.isArray(value)) {
      const first = value[0];
      if (first && typeof first === 'object' && 'id_state' in first) {
        return first.id_state;
      }
      return undefined;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'object' && 'id_state' in value) {
      return value.id_state;
    }

    return undefined;
  } catch {
    return undefined;
  }
};

export const fonecloudProvider = createSmsProvider({
  async send({ to, body, from, options = {} }) {
    const { baseUrl, token, defaultSender } = getConfig();

    if (!baseUrl || !token) {
      logError('Fonecloud not configured', {
        hasBaseUrl: !!baseUrl,
        hasToken: !!token,
      });
      return {
        success: false,
        error: 'Fonecloud SMS provider is not configured',
      };
    }

    const senderID = from || defaultSender;
    const url = buildSendUrl({
      baseUrl,
      token,
      phone: to,
      senderID,
      text: body,
      options,
    });

    logDebug('Fonecloud SMS request', {
      url: url.toString(),
      to,
      senderID,
    });

    let res;
    try {
      res = await fetch(url.toString(), { method: 'GET' });
    } catch (err) {
      logError('Fonecloud request failed', {
        to,
        error: err?.message,
      });
      return {
        success: false,
        error: 'Network error calling Fonecloud',
      };
    }

    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      logError('Fonecloud returned non-200', {
        status: res.status,
        body: data,
      });

      const errorMessage =
        (data && (data.error || data.message)) ||
        `Fonecloud error status ${res.status}`;

      return {
        success: false,
        error: errorMessage,
        code: res.status,
      };
    }

    const providerMessageId = extractProviderMessageId(data, to);

    logInfo('Fonecloud SMS sent', {
      to,
      providerMessageId,
    });

    return {
      success: true,
      providerMessageId,
      status: 'accepted',
    };
  },

  async handleIncoming(_payload) {
    // Fonecloud inbound webhooks are not integrated yet.
    return {
      success: false,
      error: 'Fonecloud inbound webhooks are not supported',
    };
  },

  async provisionNumber() {
    return {
      success: false,
      error: 'Number provisioning is not supported for Fonecloud',
    };
  },

  async releaseNumber() {
    return {
      success: false,
      error: 'Number release is not supported for Fonecloud',
    };
  },

  verifyWebhookSignature() {
    // If Fonecloud adds signatures later, implement here.
    return true;
  },
});

export default fonecloudProvider;

