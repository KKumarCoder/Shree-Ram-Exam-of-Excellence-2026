import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { checkBrevoConnection, validateBrevoEnvironment } from '../src/services/brevoOTP.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
try {
  if (process.env.SMS_PROVIDER !== 'brevo' || process.env.OTP_DELIVERY_MODE !== 'sms')
    throw new Error('Set SMS_PROVIDER=brevo and OTP_DELIVERY_MODE=sms in server/.env.');
  await checkBrevoConnection();
  console.log('Brevo API authentication succeeded. No SMS was sent.');
  validateBrevoEnvironment();
  console.log('Confirm approved SMS sender, destination access and credits in Brevo; handset delivery still needs a live test.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
