import Twilio from 'twilio';
import { initDb, pool } from '../db.mjs';
import { logInfo, logError } from '../logger.mjs';

async function main() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const rawBaseUrl = process.env.FRONTEND_URL;

  if (!accountSid || !authToken) {
    console.error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  if (!rawBaseUrl) {
    console.error('FRONTEND_URL must be set to build webhook URLs');
    process.exit(1);
  }

  const baseUrl = rawBaseUrl.replace(/\/$/, '');
  const voiceUrl = `${baseUrl}/webhook/twilio-voice-demo`;

  const twilioClient = Twilio(accountSid, authToken);

  try {
    await initDb();
  } catch (err) {
    console.error('Failed to initialize database', err);
    process.exit(1);
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT id, phone_number, twilio_sid
       FROM twilio_numbers
       WHERE is_active = true
         AND twilio_sid IS NOT NULL`
    );

    console.log(
      `Found ${result.rowCount} active Twilio numbers to check/update voice webhook`
    );

    for (const row of result.rows) {
      const { id, phone_number: phoneNumber, twilio_sid: twilioSid } = row;
      try {
        console.log(
          `Updating Twilio incoming phone number SID=${twilioSid} phone=${phoneNumber} with voiceUrl=${voiceUrl}`
        );

        await twilioClient
          .incomingPhoneNumbers(twilioSid)
          .update({ voiceUrl, voiceMethod: 'POST' });

        logInfo('Updated Twilio voice webhook', {
          localId: id,
          phoneNumber,
          twilioSid,
          voiceUrl,
        });
      } catch (err) {
        logError('Failed to update Twilio voice webhook', {
          localId: id,
          phoneNumber,
          twilioSid,
          error: err?.message || String(err),
        });
        console.error(
          `Error updating SID=${twilioSid} phone=${phoneNumber}:`,
          err
        );
      }
    }

    console.log('Twilio voice webhook sync completed');
    process.exit(0);
  } catch (err) {
    console.error('Unexpected error during Twilio voice webhook sync', err);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
  }
}

main();

