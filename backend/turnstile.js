// Cloudflare Turnstile — server-side verification of the "prove you're human"
// token the widget produces on the checkout and admin-login forms.
//
// Rollout is safe by default: when TURNSTILE_SECRET_KEY is unset the gate is OFF
// and verify() passes everything through, so the site behaves exactly as before
// until the keys are configured in the dashboard.
//
// Failure policy when the gate IS on:
//   • missing / invalid / already-used token  → fail CLOSED (reject the request);
//     that is a bot, or a replay, and must not get through.
//   • Cloudflare's verify endpoint unreachable → fail OPEN (allow the request);
//     a transient siteverify outage must not take the whole store offline. The
//     event is logged so it is visible.
const config = require('./config');

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function verify(token, ip) {
  if (!config.turnstile.enabled) return { ok: true, skipped: true };
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing_token' };

  const form = new URLSearchParams();
  form.append('secret', config.turnstile.secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);

  try {
    const res = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      // Don't let a hung verify call stall checkout indefinitely.
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) return { ok: true, data };
    return { ok: false, reason: 'failed', codes: data['error-codes'] || [] };
  } catch (e) {
    // Network error / timeout reaching Cloudflare — fail open, but loudly.
    console.error('[turnstile] siteverify unreachable, allowing request:', e.message);
    return { ok: true, degraded: true };
  }
}

module.exports = { verify };
