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
//
// Two things learned from testing on a real iPhone:
//  - iOS Mail's dark mode repainted the whole layout (navy box turned lilac,
//    the navy logo vanished into the background), so the light scheme is
//    declared via meta + bgcolor attributes, which that client honours.
//  - the box used to be nested tables inside an <a>, and taps on it did
//    nothing; it is now a single <img> inside the link, which is a reliable
//    tap target everywhere.
function voucherEmailHtml({ voucher, experienceTitle, buyerName }) {
  const personalized = voucher.type === 'personalized';
  const typeLabelHe = personalized ? 'שובר אישי' : 'שובר להעברה';
  const typeLabelRu = personalized ? 'Именной ваучер' : 'Ваучер на предъявителя';
  const expiry = formatExpiry(voucher.expiresAt || voucher.expires_at);
  const giftUrl = voucher.giftUrl || voucher.url;
  // Hosted (not data:) so Gmail actually renders them.
  const logo = new URL('/logo-full.png', config.publicUrl).toString();
  const boxImg = new URL('/gift-box.png', config.publicUrl).toString();

  const INK = '#1b1510', MUTED = '#6b5d51', LINE = '#ece0d3', CORAL = '#ed3a1c', NAVY = '#1f3160';

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  a { text-decoration: none; }
</style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;color:${INK};font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff">
    <tr>
      <td align="center" style="padding:28px 16px 40px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%">

          <!-- logo -->
          <tr>
            <td align="center" style="padding:8px 0 4px">
              <img src="${logo}" alt="VAU" width="150" style="width:150px;max-width:60%;height:auto;display:block;border:0"/>
            </td>
          </tr>
          <tr><td align="center" style="padding:10px 0 22px"><div style="width:56px;height:2px;background-color:#d9b45f;line-height:2px;font-size:0">&nbsp;</div></td></tr>

          <!-- greeting -->
          <tr>
            <td align="center" style="padding:0 8px">
              <div dir="rtl" style="font-size:24px;font-weight:bold;color:${INK};padding-bottom:2px">🎁 יש לכם מתנה!</div>
              <div dir="ltr" style="font-size:24px;font-weight:bold;color:${INK};padding-bottom:10px">Вам подарок!</div>
              ${buyerName ? `<div dir="rtl" style="font-size:15px;color:${MUTED}">מאת ${buyerName}</div><div dir="ltr" style="font-size:15px;color:${MUTED};padding-bottom:6px">от ${buyerName}</div>` : ''}
              <div dir="rtl" style="font-size:14px;color:${MUTED}">לחצו על הקופסה כדי לפתוח</div>
              <div dir="ltr" style="font-size:14px;color:${MUTED}">Нажмите на коробку, чтобы открыть</div>
            </td>
          </tr>

          <!-- the box: one image inside the link, so the tap always registers -->
          <tr>
            <td align="center" style="padding:22px 0 6px">
              <a href="${giftUrl}" target="_blank" style="display:inline-block;border:0">
                <img src="${boxImg}" alt="🎁 Открыть подарок / לפתוח את המתנה" width="220" style="width:220px;max-width:70%;height:auto;display:block;border:0"/>
              </a>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:14px 0 4px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="${CORAL}" style="background-color:${CORAL};border-radius:999px">
                    <a href="${giftUrl}" target="_blank" style="display:inline-block;padding:15px 36px;color:#ffffff;font-size:16px;font-weight:bold;line-height:1.35">
                      <span dir="rtl" style="display:block;color:#ffffff">לפתוח את המתנה</span>
                      <span dir="ltr" style="display:block;color:#ffffff">Открыть подарок</span>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${experienceTitle ? `<tr><td align="center" style="padding:18px 8px 0;font-size:16px;font-weight:bold;color:${INK}">${experienceTitle}</td></tr>` : ''}

          <!-- validity -->
          <tr>
            <td align="center" style="padding:22px 0 0">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffaf4" style="background-color:#fffaf4;border:1px solid ${LINE};border-radius:14px">
                <tr>
                  <td align="center" style="padding:14px 16px">
                    <div dir="rtl" style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${MUTED}">תקף עד</div>
                    <div dir="ltr" style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${MUTED}">Действителен до</div>
                    <div dir="ltr" style="font-size:24px;font-weight:bold;color:${NAVY};padding:4px 0 6px">${expiry}</div>
                    <div dir="rtl" style="font-size:12px;color:${MUTED}">12 חודשים מרגע הרכישה</div>
                    <div dir="ltr" style="font-size:12px;color:${MUTED}">12 месяцев с момента покупки</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- fallback code -->
          <tr>
            <td align="center" style="padding:12px 0 0">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;border:1px dashed #ff9c82;border-radius:14px">
                <tr>
                  <td align="center" style="padding:14px 16px">
                    <div dir="rtl" style="font-size:11px;color:${MUTED}">אם הקישור לא נפתח — קוד השובר</div>
                    <div dir="ltr" style="font-size:11px;color:${MUTED}">Если ссылка не открывается — код ваучера</div>
                    <div dir="ltr" style="font-size:20px;font-weight:bold;letter-spacing:3px;color:${CORAL};padding:6px 0 4px">${voucher.code}</div>
                    <div dir="rtl" style="font-size:11px;color:${MUTED}">${typeLabelHe}</div>
                    <div dir="ltr" style="font-size:11px;color:${MUTED}">${typeLabelRu}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- footer -->
          <tr>
            <td align="center" style="padding:22px 8px 0">
              <div style="width:56px;height:1px;background-color:${LINE};line-height:1px;font-size:0">&nbsp;</div>
              <div dir="rtl" style="font-size:12px;color:${MUTED};padding-top:12px">VAU · מתנות של חוויות · נבנה באהבה בישראל 🇮🇱</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body></html>`;
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
