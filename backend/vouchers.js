// Voucher issuing: unique codes, cryptographic signatures, QR + barcode images,
// and the personalized (именной) vs bearer (неименной) distinction.
const crypto = require('crypto');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const config = require('./config');

// Crockford-ish base32 without ambiguous chars (no I, L, O, U, 0, 1).
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomCode(len = 8) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// A voucher code the recipient types in, e.g. VAU-7F3KQ9M2.
function generateCode() {
  return 'VAU-' + randomCode(8);
}

// Opaque secret token embedded in the QR link (not shown to humans). Makes the
// QR URL unguessable even if someone knows the short code.
function generateToken() {
  return crypto.randomBytes(16).toString('base64url');
}

// HMAC signature binding code + token + type + recipient. Lets any VAU service
// verify a voucher is authentic (not forged) BEFORE hitting the database —
// a fabricated code won't carry a valid signature.
function sign({ code, token, type, recipientRef }) {
  return crypto
    .createHmac('sha256', config.voucherSecret)
    .update([code, token, type, recipientRef || ''].join('|'))
    .digest('base64url')
    .slice(0, 24);
}

function verifySignature(voucher, signature) {
  const expected = sign(voucher);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// The scannable redemption URL encoded in the QR.
function redemptionUrl({ code, token, signature }) {
  const u = new URL('/redeem', config.publicUrl);
  u.searchParams.set('code', code);
  u.searchParams.set('t', token);
  u.searchParams.set('s', signature);
  return u.toString();
}

// Where the email's gift box points: the site's unwrapping page, which verifies
// the voucher and plays the reveal animation before showing it.
function giftUrl({ code, token, signature }) {
  const u = new URL('/', config.publicUrl);
  u.searchParams.set('v', 'gift');
  u.searchParams.set('code', code);
  u.searchParams.set('t', token);
  u.searchParams.set('s', signature);
  return u.toString();
}

async function qrDataUrl(text) {
  return QRCode.toDataURL(text, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
}

// Code128 barcode of the human code — for POS scanners at partner venues.
function barcodeDataUrl(code) {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      { bcid: 'code128', text: code, scale: 3, height: 12, includetext: true, textxalign: 'center' },
      (err, png) => (err ? reject(err) : resolve('data:image/png;base64,' + png.toString('base64')))
    );
  });
}

// Build a fully-materialized voucher (codes, signature, links, images) from the
// order context. `recipient` is required only for personalized vouchers.
async function issue({ type = 'bearer', recipient = null } = {}) {
  const code = generateCode();
  const token = generateToken();
  // For personalized vouchers the recipient email is folded into the signature
  // so the voucher can only be validated together with that identity.
  const recipientRef = type === 'personalized' && recipient?.email
    ? crypto.createHash('sha256').update(recipient.email.trim().toLowerCase()).digest('hex').slice(0, 16)
    : '';
  const core = { code, token, type, recipientRef };
  const signature = sign(core);
  const url = redemptionUrl({ code, token, signature });
  const gift = giftUrl({ code, token, signature });
  const [qr, barcode] = await Promise.all([qrDataUrl(url), barcodeDataUrl(code)]);
  const expiresAt = new Date(Date.now() + config.fraud.voucherValidityDays * 86400000);
  return { ...core, signature, url, giftUrl: gift, qr, barcode, expiresAt, recipient, status: 'active' };
}

module.exports = { generateCode, generateToken, sign, verifySignature, redemptionUrl, giftUrl, qrDataUrl, barcodeDataUrl, issue };
