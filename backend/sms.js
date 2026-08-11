// Pluggable SMS sender for admin account-recovery codes.
//   log    (default) — prints to console; fully testable with no provider.
//   brevo            — Brevo transactional SMS (reuses BREVO_API_KEY).
//   twilio           — Twilio (needs TWILIO_* env).
// Never throws into the request path — returns { sent, ... }.
const config = require('./config');

async function sendViaBrevo(to, text) {
  const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
    method: 'POST',
    headers: { 'api-key': config.crm.brevo.apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: config.sms.sender, recipient: to, content: text, type: 'transactional' }),
  });
  if (!res.ok) throw new Error(`Brevo SMS ${res.status} ${await res.text().catch(() => '')}`);
  return { sent: true, provider: 'brevo' };
}

async function sendViaTwilio(to, text) {
  const { accountSid, authToken, from } = config.sms.twilio;
  const body = new URLSearchParams({ To: to, From: from, Body: text });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) throw new Error(`Twilio SMS ${res.status} ${await res.text().catch(() => '')}`);
  return { sent: true, provider: 'twilio' };
}

async function sendSms(to, text) {
  try {
    if (config.sms.provider === 'brevo' && config.crm.brevo.apiKey) return await sendViaBrevo(to, text);
    if (config.sms.provider === 'twilio' && config.sms.twilio.accountSid) return await sendViaTwilio(to, text);
    // Demo/log transport — surface enough to test the flow without a provider.
    console.log(`[sms:log] to ${to || '(no phone)'}: ${text}`);
    return { sent: false, demo: true };
  } catch (e) {
    console.error('[sms]', e.message);
    return { sent: false, error: e.message };
  }
}

module.exports = { sendSms };
