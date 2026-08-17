// E-voucher email delivery. Sends the digital voucher to the email the buyer
// entered at checkout. Transports:
//   log   (default) — prints a summary; fully testable without a mail server.
//   brevo           — Brevo transactional email API (reuses BREVO_API_KEY).
//   smtp            — any SMTP server via nodemailer.
const nodemailer = require('nodemailer');
const config = require('./config');

// Parse "VAU <no-reply@vaugift.com>" into a { name, email } sender.
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

// DD/MM/YYYY — the format the business asked for, independent of server locale.
function formatExpiry(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// The e-voucher email. It deliberately does NOT reveal the voucher up front:
// the recipient sees a closed gift box and opens it on the site, where the
// unwrapping animation runs (email clients don't execute JavaScript, so the
// animation itself cannot live in here). The code is still printed at the
// bottom as a fallback, so a blocked image or link never costs someone a
// voucher they paid for.
function voucherEmailHtml({ voucher, experienceTitle, buyerName }) {
  const personalized = voucher.type === 'personalized';
  const typeLabelHe = personalized ? 'שובר אישי' : 'שובר להעברה';
  const typeLabelRu = personalized ? 'Именной ваучер' : 'Ваучер на предъявителя';
  const expiry = formatExpiry(voucher.expiresAt || voucher.expires_at);
  const giftUrl = voucher.giftUrl || voucher.url;
  // Hosted (not data:) so Gmail actually renders it.
  const logo = new URL('/logo-full.png', config.publicUrl).toString();

  return `<!doctype html><html><body style="margin:0;background:#fff6ef;font-family:Arial,Helvetica,sans-serif;color:#1b1510">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="text-align:center">
      <img src="${logo}" alt="VAU" width="120" style="width:120px;height:auto;display:inline-block"/>
    </div>

    <div style="background:#fff;border-radius:24px;padding:28px 24px;margin-top:18px;box-shadow:0 8px 24px -8px rgba(27,21,16,.12);text-align:center">
      <h1 dir="rtl" style="font-size:22px;margin:0 0 2px">🎁 יש לכם מתנה!</h1>
      <h1 dir="ltr" style="font-size:22px;margin:0 0 6px">Вам подарок!</h1>
      ${buyerName ? `<p dir="rtl" style="color:#5a4e42;margin:0">מאת ${buyerName}</p><p dir="ltr" style="color:#5a4e42;margin:0 0 4px">от ${buyerName}</p>` : ''}
      <p dir="rtl" style="color:#5a4e42;margin:0;font-size:14px">לחצו על הקופסה כדי לפתוח</p>
      <p dir="ltr" style="color:#5a4e42;margin:0 0 20px;font-size:14px">Нажмите на коробку, чтобы открыть</p>

      <!-- Gift box: table-based so Outlook renders it; the whole box is a link -->
      <a href="${giftUrl}" style="text-decoration:none;display:inline-block">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
          <tr>
            <td style="padding-bottom:6px;text-align:center">
              <!-- bow -->
              <div style="font-size:34px;line-height:1">🎀</div>
            </td>
          </tr>
          <tr>
            <td>
              <!-- lid -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="220" style="width:220px">
                <tr><td style="background:#1f3160;border-radius:10px;height:34px;text-align:center;color:#d9b45f;font-size:13px;font-weight:bold;letter-spacing:3px">V A U</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:4px">
              <!-- body with a gold ribbon down the middle -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="200" style="width:200px;margin:0 auto">
                <tr>
                  <td width="80" style="background:#25396f;height:120px;border-bottom-left-radius:12px"></td>
                  <td width="40" style="background:#d9b45f;height:120px"></td>
                  <td width="80" style="background:#25396f;height:120px;border-bottom-right-radius:12px"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </a>

      <div style="margin-top:22px">
        <a href="${giftUrl}" style="display:inline-block;background:#ff5436;color:#fff;text-decoration:none;font-weight:bold;padding:14px 34px;border-radius:999px;font-size:16px;line-height:1.35">
          <span dir="rtl" style="display:block">לפתוח את המתנה</span>
          <span dir="ltr" style="display:block">Открыть подарок</span>
        </a>
      </div>

      ${experienceTitle ? `<p style="font-weight:bold;margin:20px 0 0;color:#1b1510">${experienceTitle}</p>` : ''}

      <div style="margin-top:20px;padding:12px 14px;background:#fff6ef;border-radius:14px">
        <div dir="rtl" style="font-size:12px;color:#8c8072;text-transform:uppercase;letter-spacing:1px">תקף עד</div>
        <div dir="ltr" style="font-size:12px;color:#8c8072;text-transform:uppercase;letter-spacing:1px">Действителен до</div>
        <div dir="ltr" style="font-size:22px;font-weight:bold;color:#1f3160;margin-top:2px">${expiry}</div>
        <div dir="rtl" style="font-size:12px;color:#8c8072;margin-top:6px">12 חודשים מרגע הרכישה</div>
        <div dir="ltr" style="font-size:12px;color:#8c8072">12 месяцев с момента покупки</div>
      </div>
    </div>

    <div style="background:#fff;border-radius:18px;padding:16px 20px;margin-top:12px;text-align:center">
      <div dir="rtl" style="font-size:11px;color:#8c8072">אם הקישור לא נפתח — קוד השובר</div>
      <div dir="ltr" style="font-size:11px;color:#8c8072">Если ссылка не открывается — код ваучера</div>
      <div dir="ltr" style="font-size:20px;font-weight:bold;letter-spacing:3px;color:#ed3a1c;margin-top:6px">${voucher.code}</div>
      <div dir="rtl" style="font-size:11px;color:#8c8072;margin-top:6px">${typeLabelHe}</div>
      <div dir="ltr" style="font-size:11px;color:#8c8072">${typeLabelRu}</div>
    </div>

    <p dir="rtl" style="text-align:center;color:#8c8072;font-size:12px;margin-top:16px">VAU · מתנות של חוויות · נבנה באהבה בישראל 🇮🇱</p>
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
  // Never let a transport failure throw into checkout — the customer is already
  // charged and has a valid voucher; a failed email must not 500 (or double-charge).
  try {
    await transport.sendMail({ from: config.email.from, to, subject, html });
    return { delivered: true, to };
  } catch (e) {
    console.error('[email:smtp]', e.message);
    return { delivered: false, error: e.message, to };
  }
}

module.exports = { sendVoucherEmail, voucherEmailHtml };
