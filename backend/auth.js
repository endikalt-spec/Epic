// Authentication: Sign in with Google and Sign in with Apple, issuing a VAU JWT
// session. Real OAuth runs when provider keys are configured; otherwise a demo
// login path issues a session so the UI is fully testable.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('./config');

// ── JWT session ──
function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, provider: user.provider },
    config.jwtSecret,
    { expiresIn: '30d' }
  );
}
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}
// Express middleware — attaches req.user when a valid Bearer token is present.
function authOptional(req, _res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  req.user = m ? verifyToken(m[1]) : null;
  next();
}

// ── Provider availability (frontend uses this to render real vs demo buttons) ──
function providerStatus() {
  return {
    google: { enabled: true, demo: config.isDemo.google },
    apple: { enabled: true, demo: config.isDemo.apple },
  };
}

// ── Google ──
function googleAuthUrl(state = crypto.randomBytes(8).toString('hex')) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', config.google.clientId);
  u.searchParams.set('redirect_uri', config.google.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  return u.toString();
}
async function exchangeGoogleCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error('Google token exchange failed');
  const { access_token } = await res.json();
  const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  }).then((r) => r.json());
  return { id: 'google:' + info.sub, email: info.email, name: info.name, provider: 'google', avatar: info.picture };
}

// ── Apple ──
function appleAuthUrl(state = crypto.randomBytes(8).toString('hex')) {
  const u = new URL('https://appleid.apple.com/auth/authorize');
  u.searchParams.set('client_id', config.apple.clientId);
  u.searchParams.set('redirect_uri', config.apple.redirectUri);
  u.searchParams.set('response_type', 'code id_token');
  u.searchParams.set('response_mode', 'form_post');
  u.searchParams.set('scope', 'name email');
  u.searchParams.set('state', state);
  return u.toString();
}
// Apple returns an id_token (JWT). We MUST verify its signature against Apple's
// public keys and check issuer/audience/expiry — decoding alone would let anyone
// submit a self-signed token for any identity. Keys are cached for an hour.
let appleKeysCache = { keys: null, at: 0 };
async function appleJwks() {
  if (appleKeysCache.keys && Date.now() - appleKeysCache.at < 3600000) return appleKeysCache.keys;
  const res = await fetch('https://appleid.apple.com/auth/keys');
  if (!res.ok) throw new Error('Failed to fetch Apple JWKS');
  const { keys } = await res.json();
  appleKeysCache = { keys, at: Date.now() };
  return keys;
}

async function verifyAppleIdToken(idToken) {
  const header = jwt.decode(idToken, { complete: true })?.header;
  if (!header?.kid) throw new Error('Invalid Apple id_token');
  const jwk = (await appleJwks()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Apple signing key not found');
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const payload = jwt.verify(idToken, publicKey, {
    algorithms: ['RS256'],
    issuer: 'https://appleid.apple.com',
    audience: config.apple.clientId,
  });
  if (!payload?.sub) throw new Error('Invalid Apple id_token');
  return { id: 'apple:' + payload.sub, email: payload.email, name: payload.email?.split('@')[0], provider: 'apple' };
}

// ── Demo login (no provider keys) ──
function demoLogin({ provider = 'google', name, email } = {}) {
  const handle = (name || 'Guest').replace(/\s+/g, '.').toLowerCase();
  const user = {
    id: `${provider}:demo:` + crypto.randomBytes(4).toString('hex'),
    email: email || `${handle}@example.com`,
    name: name || 'אורח / Guest',
    provider,
  };
  return { user, token: issueToken(user) };
}

module.exports = {
  issueToken, verifyToken, authOptional, providerStatus,
  googleAuthUrl, exchangeGoogleCode, appleAuthUrl, verifyAppleIdToken, demoLogin,
};
