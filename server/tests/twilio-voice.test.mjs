import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.mjs';
import * as twilioService from '../services/twilioService.mjs';

describe('Twilio voice demo webhook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls handleIncomingVoiceDemo and returns TwiML response', async () => {
    const payload = {
      From: '+4512345678',
      To: '+4598765432',
      CallSid: 'CA1234567890',
    };

    const handlerSpy = vi
      .spyOn(twilioService, 'handleIncomingVoiceDemo')
      .mockResolvedValue({});

    const res = await request(app)
      .post('/webhook/twilio-voice-demo')
      .type('form')
      .send(payload);

    expect(handlerSpy).toHaveBeenCalledTimes(1);
    expect(handlerSpy).toHaveBeenCalledWith(payload);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/i);
    expect(res.text).toContain(
      'Tak for dit opkald. Du modtager straks en SMS fra vores AI-receptionist.'
    );
    expect(res.text).toContain('<Hangup/>');
  });
});

