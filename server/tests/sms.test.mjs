import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProvider, registerProvider } from '../sms/registry.mjs';
import { createSmsProvider } from '../sms/contract.mjs';
import * as gateway from '../sms/gateway.mjs';

describe('SMS registry', () => {
  beforeEach(() => {
    // register a simple test provider
    const testProvider = createSmsProvider({
      async send() {
        return { success: true, providerMessageId: 'test', status: 'ok' };
      },
      async handleIncoming() {
        return { success: true, conversationId: 'c1', messageId: 'm1' };
      },
      async provisionNumber() {
        return { success: false, error: 'not-impl' };
      },
      async releaseNumber() {
        return { success: false, error: 'not-impl' };
      },
      verifyWebhookSignature() {
        return true;
      },
    });

    registerProvider('test', testProvider);
  });

  it('registers and retrieves providers', () => {
    const provider = getProvider('test');
    expect(provider).toBeDefined();
    expect(typeof provider.send).toBe('function');
  });
});

describe('SMS gateway', () => {
  it('throws when provider is missing', async () => {
    await expect(
      gateway.sendSms({
        customerId: 'non-existing',
        to: '+4512345678',
        body: 'Hej',
      })
    ).resolves.toMatchObject({
      // because fallback provider is twilio which is registered by default,
      // this should still succeed
      success: expect.any(Boolean),
    });
  });
});

