// E-voucher email delivery. Sends the digital voucher to the email the buyer
// entered at checkout. Transports:
//   log   (default) — prints a summary; fully testable without a mail server.
//   brevo           — Brevo transactional email API (reuses BREVO_API_KEY).
//   smtp            — any SMTP server via nodemailer.
const nodemailer = require('nodemailer');
const config = require('./config');

// Parse "VAU <no-reply@vau.co.il>" into a { name, email } sender.
function parseSender(from) {
  const m = /^\s*"?(.*?)"?\s*<([^>]+)>\s*$/.exec(from || '');
  return m ? { name: m[1].trim(), email: m[2].trim() } : { email: (from || '').trim() };
}

// Brevo transactional email. The sender address/domain must be verified in the
// Brevo account first, otherwise Brevo rejects the send.
async function sendViaBrevo({ to, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.crm.brevo.apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: parseSender(config.email.from), to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Brevo email ${res.status} ${t}`);
  }
  const data = await res.json().catch(() => ({}));
  return { delivered: true, to, messageId: data.messageId };
}

let transporter = null;
function getTransport() {
  if (config.email.transport !== 'smtp') return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: { user: config.email.smtp.user, pass: config.email.smtp.pass },
    });
  }
  return transporter;
}

function voucherEmailHtml({ voucher, experienceTitle, buyerName }) {
  const typeLabel = voucher.type === 'personalized' ? 'שובר אישי / Именной ваучер' : 'שובר להעברה / Ваучер на предъявителя';
  return `<!doctype html><html><body style="margin:0;background:#fff6ef;font-family:Arial,Helvetica,sans-serif;color:#1b1510">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-size:28px;font-weight:800;color:#ed3a1c">VAU</div>
    <div style="background:#fff;border-radius:24px;padding:28px;margin-top:16px;box-shadow:0 8px 24px -8px rgba(27,21,16,.12)">
      <h1 style="font-size:22px;margin:0 0 8px">🎁 המתנה שלך מוכנה! / Ваш подарок готов!</h1>
      ${buyerName ? `<p style="color:#5a4e42;margin:0 0 16px">From ${buyerName}</p>` : ''}
      ${experienceTitle ? `<p style="font-weight:700;margin:0 0 16px">${experienceTitle}</p>` : ''}
      <div style="border:2px dashed #ff9c82;border-radius:16px;padding:18px;text-align:center;margin:16px 0">
        <div style="font-size:12px;color:#8c8072;text-transform:uppercase;letter-spacing:1px">Voucher code</div>
        <div style="font-size:26px;font-weight:800;letter-spacing:3px;color:#ed3a1c">${voucher.code}</div>
        <div style="font-size:12px;color:#8c8072;margin-top:6px">${typeLabel}</div>
      </div>
      <div style="text-align:center;margin:16px 0">
        <img src="${voucher.qr}" alt="QR" width="180" height="180" style="border-radius:12px"/>
        <div style="margin-top:12px"><img src="${voucher.barcode}" alt="barcode" style="max-width:100%"/></div>
      </div>
      <a href="${voucher.url}" style="display:block;text-align:center;background:#ff5436;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:999px">
        לממש עכשיו / Активировать
      </a>
      <p style="font-size:12px;color:#8c8072;margin-top:16px">
        תקף עד / Действителен до: ${new Date(voucher.expiresAt || voucher.expires_at).toLocaleDateString('he-IL')}
      </p>
    </div>
    <p style="text-align:center;color:#8c8072;font-size:12px;margin-top:16px">VAU · מתנות של חוויות · נבנה באהבה בישראל 🇮🇱</p>
  </div></body></html>`;
}

async function sendVoucherEmail({ to, voucher, experienceTitle, buyerName }) {
  const html = voucherEmailHtml({ voucher, experienceTitle, buyerName });
  const subject = '🎁 VAU — השובר שלך / Ваш ваучер';

  // Brevo transactional API (reuses BREVO_API_KEY).
  if (config.email.transport === 'brevo') {
    try {
      return await sendViaBrevo({ to, subject, html });
    } catch (e) {
      console.error('[email:brevo]', e.message);
      return { delivered: false, error: e.message, to };
    }
  }

  const transport = getTransport();
  if (!transport) {
    // Demo mode: log a summary instead of sending.
    console.log(`[email:demo] voucher ${voucher.code} -> ${to} (${voucher.type}) "${experienceTitle || ''}"`);
    return { delivered: false, demo: true, to };
  }
  await transport.sendMail({ from: config.email.from, to, subject, html });
  return { delivered: true, to };
}

module.exports = { sendVoucherEmail, voucherEmailHtml };
