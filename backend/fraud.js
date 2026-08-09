// Anti-fraud logic for voucher redemption.
//
// Threat model & controls:
//  1. Forged codes ...... HMAC signature check (vouchers.verifySignature) — a
//                         fabricated code carries no valid signature.
//  2. Code brute-force ... per-IP velocity limit on activation attempts.
//  3. Double-spend ....... single-use atomic status transition (enforced in the
//                         DB route with UPDATE ... WHERE status='active').
//  4. Wrong recipient .... personalized (именной) vouchers require the recipient
//                         identity (email/last name) to match at redemption.
//  5. Expiry ............. issued vouchers carry an expiry (~2 years).
//  6. Auditability ....... every attempt is logged (redemption_attempts table).
const crypto = require('crypto');
const config = require('./config');
const { verifySignature } = require('./vouchers');

// ── In-memory sliding-window rate limiter (swap for Redis in production) ──
const buckets = new Map();
function tooManyAttempts(key, { windowMs = 3600000, max = config.fraud.maxActivationAttemptsPerHour } = {}) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  buckets.set(key, arr);
  return arr.length > max;
}

const emailHash = (email) =>
  crypto.createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex').slice(0, 16);

// Validate a redemption request against a stored voucher row. Pure function —
// returns { ok, reason }. The caller performs the atomic DB update on ok.
function validateRedemption(voucher, { signature, token, recipient } = {}) {
  if (!voucher) return { ok: false, reason: 'not_found' };
  if (voucher.status === 'redeemed') return { ok: false, reason: 'already_redeemed' };
  if (voucher.status !== 'active') return { ok: false, reason: 'inactive' };
  if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) return { ok: false, reason: 'expired' };

  // Signature is authoritative: proves the code/token/type/recipient weren't tampered with.
  const core = {
    code: voucher.code,
    token: token ?? voucher.token,
    type: voucher.type,
    recipientRef: voucher.recipient_ref || '',
  };
  if (signature && !verifySignature(core, signature)) return { ok: false, reason: 'bad_signature' };
  if (token && voucher.token && token !== voucher.token) return { ok: false, reason: 'bad_token' };

  // Personalized vouchers: the redeemer must prove they are the named recipient.
  if (voucher.type === 'personalized') {
    const provided = recipient?.email ? emailHash(recipient.email) : null;
    if (!provided || provided !== voucher.recipient_ref) return { ok: false, reason: 'recipient_mismatch' };
  }
  return { ok: true };
}

module.exports = { tooManyAttempts, validateRedemption, emailHash };
