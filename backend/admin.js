// Admin authentication & security primitives.
//
// Threat model / controls:
//  - Passwords: scrypt with a per-user random salt (never stored in clear).
//  - Brute force: per-account lockout after MAX_FAILED wrong passwords, plus a
//    per-IP velocity limit at the route layer; every attempt is audited.
//  - 2FA: TOTP (RFC 6238) — app-based (Google Authenticator/Authy), works
//    offline, no SMS dependency. Enforced on login once enrolled.
//  - Recovery: single-use, short-lived OTP sent to the admin's linked phone,
//    stored only as an HMAC; requires a new password to complete.
//  - Sessions: short-lived signed JWT carrying adm:true + the admin id/role.
//
// No third-party crypto deps — Node's crypto provides scrypt + HMAC (TOTP).
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('./config');

const MAX_FAILED = 3;          // wrong passwords before lockout
const LOCK_MINUTES = 15;       // lockout duration
const SESSION_TTL = '8h';      // admin JWT lifetime
const RECOVERY_TTL_MIN = 10;   // SMS code validity

// ── Passwords (scrypt) ──
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, keyHex] = stored.split(':');
  const key = Buffer.from(keyHex, 'hex');
  const test = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), key.length);
  return key.length === test.length && crypto.timingSafeEqual(key, test);
}

// ── Admin session JWT ──
function issueAdminToken(admin) {
  return jwt.sign({ adm: true, sub: admin.id, email: admin.email, role: admin.role }, config.jwtSecret, { expiresIn: SESSION_TTL });
}
function verifyAdminToken(token) {
  try {
    const p = jwt.verify(token, config.jwtSecret);
    return p?.adm === true ? p : null;
  } catch { return null; }
}

// ── TOTP (RFC 6238) ──
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/,'').replace(/\s/g,'');
  let bits = 0, value = 0; const out = [];
  for (const c of clean) {
    const idx = B32.indexOf(c); if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20)); // 160-bit
}
function hotp(secretB32, counter) {
  const key = base32Decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1000000).padStart(6, '0');
}
// Verify a TOTP code within a ±1 step window (30s steps).
function verifyTotp(secretB32, token) {
  if (!secretB32 || !/^\d{6}$/.test(String(token || ''))) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let w = -1; w <= 1; w++) {
    if (crypto.timingSafeEqual(Buffer.from(hotp(secretB32, step + w)), Buffer.from(String(token)))) return true;
  }
  return false;
}
function totpUri(email, secretB32) {
  const label = encodeURIComponent(`VAU:${email}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=VAU&digits=6&period=30&algorithm=SHA1`;
}

// ── Recovery OTP hashing ──
function hashCode(code) {
  return crypto.createHmac('sha256', config.voucherSecret).update(String(code)).digest('hex');
}
function generateNumericCode(len = 6) {
  let s = '';
  while (s.length < len) s += crypto.randomInt(0, 10);
  return s;
}

// ── Lockout helpers (pure) ──
function isLocked(admin) {
  return !!(admin?.locked_until && new Date(admin.locked_until) > new Date());
}
function lockoutState(failedAttempts) {
  // Returns the new locked_until (or null) after a failed attempt.
  if (failedAttempts >= MAX_FAILED) return new Date(Date.now() + LOCK_MINUTES * 60000);
  return null;
}

module.exports = {
  MAX_FAILED, LOCK_MINUTES, RECOVERY_TTL_MIN,
  hashPassword, verifyPassword,
  issueAdminToken, verifyAdminToken,
  generateTotpSecret, verifyTotp, totpUri,
  hashCode, generateNumericCode,
  isLocked, lockoutState,
};
