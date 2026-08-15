const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const db = require('./db');
const config = require('./config');
const auth = require('./auth');
const vouchers = require('./vouchers');
const fraud = require('./fraud');
const { getGateway, SUPPORTED_METHODS } = require('./payments');
const { sendVoucherEmail } = require('./email');
const assistant = require('./assistant');
const customers = require('./customers');
const crm = require('./crm');
const reviews = require('./reviews');
const admin = require('./admin');
const { sendSms } = require('./sms');
const QRCode = require('qrcode');

const app = express();
const port = config.port;

// Only honor X-Forwarded-For from trusted proxy hops, so clients can't spoof
// their IP to bypass rate limits or poison the audit log. Directly-exposed:
// trustProxy=false → req.ip is the socket address.
app.set('trust proxy', config.trustProxy);

// Restrict CORS to the configured origins in production; allow all when none
// are set (local dev). Auth is Bearer-token, so this limits which browser
// origins can call the API with a stolen token.
app.use(cors(config.corsOrigins.length ? { origin: config.corsOrigins } : {}));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

// Stripe webhooks need the raw body for signature verification — mount before json().
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const event = await getGateway().verifyWebhook(req.body, req.headers['stripe-signature']);
    console.log('[payments] webhook', event.type);
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: 'Webhook verification failed' });
  }
});

app.use(express.json());
app.use(auth.authOptional);

const clientIp = (req) => req.ip || req.socket.remoteAddress || '';
const getCookie = (req, name) => {
  const raw = req.headers.cookie || '';
  const m = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
};
const OAUTH_STATE_COOKIE = 'vau_oauth_state';
const setStateCookie = (res, state) => res.cookie(OAUTH_STATE_COOKIE, state, {
  httpOnly: true, sameSite: 'lax', secure: config.env === 'production', maxAge: 600000, path: '/',
});
const dbSafe = async (fn, fallback) => { try { return await fn(); } catch (e) { console.error('[db]', e.message); return fallback; } };
// Distinct sentinel for a DB error, so callers can tell "the query threw"
// (→ 503) apart from "the query ran and found nothing" (→ 404/409). Never
// confuse the two: reusing `undefined` for both masks not-found as unavailable.
const DB_ERROR = Symbol('db_error');
const dbTry = async (fn) => { try { return await fn(); } catch (e) { console.error('[db]', e.message); return DB_ERROR; } };

// Per-user serialization for checkout, so two concurrent purchases by the same
// customer can't both read "next gift is the reward" and both get the 50% off
// (check-then-act race). In-process only — a multi-instance deployment needs a
// distributed lock (same caveat as the in-memory rate limiter).
const userLocks = new Map();
function withUserLock(key, fn) {
  const prev = userLocks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);           // run fn after the previous holder settles
  const tail = next.catch(() => {});         // tail never rejects, so the chain continues
  userLocks.set(key, tail);
  tail.then(() => { if (userLocks.get(key) === tail) userLocks.delete(key); });
  return next;
}

// A human landing on the bare API domain (e.g. checking api.vaugift.com in a
// browser) would otherwise hit Express's default "Cannot GET /" — replace it
// with a small, honest status page instead.
app.get('/', (_req, res) => {
  res.json({ name: 'VAU API', status: 'ok', docs: 'https://vaugift.com', health: '/health' });
});

// Liveness: process is up. Readiness: also verifies DB connectivity so a
// load balancer / uptime check doesn't route traffic to an instance whose DB
// is down.
app.get('/health', (_req, res) => res.send('OK'));
app.get('/health/ready', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'db_unavailable' });
  }
});

// ─────────────────────────── CATALOG ───────────────────────────
app.get('/api/categories', async (_req, res) => {
  const rows = await dbSafe(() => db.query('SELECT * FROM categories').then((r) => r.rows), null);
  if (rows == null) return res.status(503).json({ error: 'DB unavailable' });
  res.json(rows);
});

app.get('/api/experiences', async (req, res) => {
  const { category } = req.query;
  const rows = await dbSafe(async () => {
    let q = `SELECT e.*, c.slug AS category_slug,
                    b.slug AS business_slug, b.name_he AS business_name_he, b.name_ru AS business_name_ru,
                    b.description_he AS business_description_he, b.description_ru AS business_description_ru,
                    b.location_he AS business_location_he, b.location_ru AS business_location_ru,
                    b.emoji AS business_emoji, b.logo AS business_logo, b.since AS business_since, b.rating AS business_rating
               FROM experiences e
               LEFT JOIN categories c ON e.category_id = c.id
               LEFT JOIN businesses b ON e.business_id = b.id`;
    const params = [];
    if (category && category !== 'all') { q += ' WHERE c.slug = $1'; params.push(category); }
    q += ' ORDER BY e.is_best_seller DESC, e.id ASC';
    return (await db.query(q, params)).rows;
  }, null);
  if (rows == null) return res.status(503).json({ error: 'DB unavailable' });
  // Fold the flat business_* columns into a nested object (or null).
  const out = rows.map((r) => {
    const business = r.business_slug ? {
      slug: r.business_slug, name_he: r.business_name_he, name_ru: r.business_name_ru,
      description_he: r.business_description_he, description_ru: r.business_description_ru,
      location_he: r.business_location_he, location_ru: r.business_location_ru,
      emoji: r.business_emoji, logo: r.business_logo, since: r.business_since, rating: r.business_rating,
    } : null;
    return { ...r, business };
  });
  res.json(out);
});

// ─────────────────────────── AUTH (Google / Apple) ───────────────────────────
app.get('/api/auth/providers', (_req, res) => res.json(auth.providerStatus()));

app.get('/api/auth/:provider/start', (req, res) => {
  const { provider } = req.params;
  // Generate an anti-CSRF state, remember it in an httpOnly cookie, and require
  // the callback to echo it — so a callback can't be replayed in a victim's
  // browser to log them into the attacker's account (login CSRF).
  const state = crypto.randomBytes(16).toString('hex');
  if (provider === 'google' && !config.isDemo.google) { setStateCookie(res, state); return res.redirect(auth.googleAuthUrl(state)); }
  if (provider === 'apple' && !config.isDemo.apple) { setStateCookie(res, state); return res.redirect(auth.appleAuthUrl(state)); }
  // Demo: no real provider configured.
  res.status(200).json({ demo: true, message: `${provider} is in demo mode; use POST /api/auth/demo` });
});

app.get('/api/auth/google/callback', async (req, res) => {
  const expected = getCookie(req, OAUTH_STATE_COOKIE);
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
  if (!expected || req.query.state !== expected) return res.status(400).json({ error: 'invalid_state' });
  try {
    const user = await auth.exchangeGoogleCode(req.query.code);
    await dbSafe(() => db.query(
      'INSERT INTO users (id,email,name,provider) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email,name=EXCLUDED.name',
      [user.id, user.email, user.name, user.provider]));
    const token = auth.issueToken(user);
    res.redirect(`${config.publicUrl}/?token=${token}`);
  } catch (e) {
    res.status(400).json({ error: 'Google sign-in failed' });
  }
});

app.post('/api/auth/apple/callback', express.urlencoded({ extended: true }), async (req, res) => {
  // Only accept Apple callbacks when Apple is actually configured — otherwise the
  // route is a forged-token entry point. When unconfigured it stays disabled.
  if (config.isDemo.apple) return res.status(404).json({ error: 'Apple sign-in not enabled' });
  const expected = getCookie(req, OAUTH_STATE_COOKIE);
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
  if (!expected || req.body.state !== expected) return res.status(400).json({ error: 'invalid_state' });
  try {
    const user = await auth.verifyAppleIdToken(req.body.id_token);
    await dbSafe(() => db.query(
      'INSERT INTO users (id,email,name,provider) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
      [user.id, user.email, user.name, user.provider]));
    const token = auth.issueToken(user);
    res.redirect(`${config.publicUrl}/?token=${token}`);
  } catch (e) {
    res.status(400).json({ error: 'Apple sign-in failed' });
  }
});

// Demo login for local development (no provider keys required).
app.post('/api/auth/demo', (req, res) => {
  if (fraud.tooManyAttempts(`demo-login:${clientIp(req)}`, { max: 20 })) return res.status(429).json({ error: 'Too many attempts. Try later.' });
  const { provider, name, email } = req.body || {};
  const { user, token } = auth.demoLogin({ provider, name, email });
  dbSafe(() => db.query(
    'INSERT INTO users (id,email,name,provider) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
    [user.id, user.email, user.name, user.provider]));
  res.json({ token, user });
});

app.get('/api/auth/me', (req, res) => res.json({ user: req.user || null }));

// ─────────────────────────── PAYMENTS ───────────────────────────
app.get('/api/payments/config', (_req, res) => {
  res.json({
    provider: getGateway().name,
    currency: config.payments.currency,
    methods: SUPPORTED_METHODS,
    demo: config.isDemo.payments,
    publishableKey: config.payments.stripe.publishableKey || null,
  });
});

// ─────────────────────────── CHECKOUT → VOUCHER ───────────────────────────
app.post('/api/checkout', async (req, res) => {
  const {
    experienceIds, method = 'card', recipient = null, buyerEmail, buyerName,
    voucherType = 'bearer', cardLast4, locale,
    acceptTerms, marketingOptIn = false,
  } = req.body || {};
  if (fraud.tooManyAttempts(`checkout:${clientIp(req)}`, { max: 20 })) return res.status(429).json({ error: 'Too many attempts. Try later.' });
  if (!Array.isArray(experienceIds) || experienceIds.length === 0 || experienceIds.length > 5) {
    return res.status(400).json({ error: 'Invalid experience selection (1-5 required)' });
  }
  // Normalize to distinct positive integers — reject anything that isn't a valid id.
  const ids = [...new Set(experienceIds.map((n) => Number(n)))];
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    return res.status(400).json({ error: 'Invalid experience id' });
  }
  if (!SUPPORTED_METHODS.includes(method)) return res.status(400).json({ error: 'Unsupported payment method' });
  if (!['bearer', 'personalized'].includes(voucherType)) return res.status(400).json({ error: 'Invalid voucher type' });
  const emailOk = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  if (voucherType === 'personalized' && !emailOk(recipient?.email)) {
    return res.status(400).json({ error: 'Personalized voucher requires a valid recipient email' });
  }
  const deliverTo = buyerEmail || recipient?.email;
  if (!emailOk(deliverTo)) return res.status(400).json({ error: 'A valid email is required to deliver the voucher' });
  // A purchase requires accepting the Terms of Use & Privacy Policy (recorded
  // with a full audit trail below). This is both a business and legal gate.
  if (acceptTerms !== true) return res.status(400).json({ error: 'terms_not_accepted' });

  // Serialize per-user so the loyalty reward can't be double-applied by two
  // concurrent checkouts (see withUserLock). Guests aren't loyalty-eligible.
  const run = async () => {
    // Price the order ONLY from the catalog in the DB — the client never supplies
    // an amount. Every requested id must resolve to a real experience, otherwise
    // we refuse (a caller can't invent ids to mint a cheap/bogus voucher).
    const rows = await dbSafe(async () => {
      const r = await db.query('SELECT id, title_he, price FROM experiences WHERE id = ANY($1)', [ids]);
      return r.rows;
    }, null);
    if (rows == null) return res.status(503).json({ error: 'DB unavailable' });
    if (rows.length !== ids.length) return res.status(400).json({ error: 'Unknown experience in selection' });
    const amount = rows.reduce((s, r) => s + Number(r.price), 0);
    if (amount <= 0) return res.status(400).json({ error: 'Could not determine order amount' });
    const items = rows.map((r) => ({ id: r.id, title: r.title_he, price: Number(r.price) }));
    const title = rows[0]?.title_he || null;

    // Loyalty ("VAU Club"): every 4th gift within a rolling year is 50% off.
    // Computed server-side from the order history — never trusted from the client.
    // The recipient still receives the full-value experience; only the buyer's
    // charge is reduced, so the voucher's face value stays the gross amount.
    const grossAmount = amount;
    let discount = 0;
    let loyaltyReward = false;
    if (req.user?.sub) {
      const loy = await dbSafe(() => customers.getLoyalty(db, req.user.sub), null);
      if (loy?.rewardReady) {
        discount = Math.round(grossAmount * loy.discountPct / 100);
        loyaltyReward = true;
      }
    }
    const chargeAmount = grossAmount - discount;

    // 1) Charge via the gateway. Only proceed on a real success.
    const gateway = getGateway();
    const payment = await gateway.createPayment({ amount: chargeAmount, method, metadata: { cardLast4, buyerEmail: deliverTo } });
    if (payment.status !== 'succeeded') {
      return res.status(402).json({ error: 'Payment not completed', status: payment.status, clientSecret: payment.clientSecret });
    }

    // 2) Issue the voucher (codes, signature, QR, barcode).
    const voucher = await vouchers.issue({ type: voucherType, recipient });

    // 3) Persist payment + voucher in ONE transaction. The card is already
    //    charged, so if this fails we must NOT report success — we return a
    //    distinct error carrying the gateway payment ref so the charge can be
    //    reconciled / the voucher re-issued by support, and we don't double-issue.
    let paymentDbId = null;
    try {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        const p = await client.query(
          'INSERT INTO payments (provider,provider_ref,amount,currency,method,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          [gateway.name, payment.id, chargeAmount, config.payments.currency, method, 'succeeded']);
        paymentDbId = p.rows[0].id;
        await client.query(
          `INSERT INTO vouchers (code,token,signature,type,status,recipient_ref,recipient_email,recipient_name,buyer_email,buyer_user_id,payment_id,option_ids,face_value,expires_at)
           VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [voucher.code, voucher.token, voucher.signature, voucher.type, voucher.recipientRef,
           recipient?.email || null, recipient?.name || null, deliverTo, req.user?.sub || null,
           paymentDbId, ids, grossAmount, voucher.expiresAt]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      // ALERT-worthy: money was taken but we have no voucher record.
      console.error('[checkout] PERSIST FAILED AFTER CHARGE — paymentRef=%s: %s', payment.id, e.message);
      return res.status(500).json({
        error: 'voucher_persist_failed',
        paymentRef: payment.id,
        message: 'Payment succeeded but the voucher could not be saved. Please contact support with this reference.',
      });
    }

    // 3b) Record the customer, consent (terms + marketing) and the order — the
    // built-in CRM. Then mirror the customer & purchase into the external CRM/ESP.
    const buyer = { email: deliverTo, name: buyerName || req.user?.name || recipient?.name, locale };
    await dbSafe(() => customers.recordPurchase(db, {
      user: req.user, email: deliverTo, name: buyer.name, locale,
      ip: clientIp(req), userAgent: req.headers['user-agent'],
      acceptTerms: true, marketingOptIn: !!marketingOptIn,
      order: {
        voucherCode: voucher.code, paymentId: paymentDbId, amount: chargeAmount,
        currency: config.payments.currency, method, voucherType, items,
        discount, loyaltyReward,
      },
    }));
    crm.identify({ email: deliverTo, name: buyer.name, locale, marketingOptIn: !!marketingOptIn });
    crm.trackPurchase({ email: deliverTo, buyerName: buyer.name, locale, amount: chargeAmount, currency: config.payments.currency, voucherCode: voucher.code, items });

    // 4) Email the e-voucher.
    const email = await sendVoucherEmail({ to: deliverTo, voucher, experienceTitle: title, buyerName: req.user?.name });

    res.json({
      success: true,
      code: voucher.code,
      voucher: { code: voucher.code, type: voucher.type, qr: voucher.qr, barcode: voucher.barcode, url: voucher.url, expiresAt: voucher.expiresAt },
      payment: { status: 'succeeded', method, amount: chargeAmount, gross: grossAmount, discount, loyaltyReward },
      email,
    });
  };

  try {
    if (req.user?.sub) await withUserLock(`checkout:${req.user.sub}`, run);
    else await run();
  } catch (err) {
    console.error('[checkout]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Checkout failed' });
  }
});

// ─────────────────────────── VOUCHER ACTIVATION (verify) ───────────────────────────
app.post('/api/vouchers/activate', async (req, res) => {
  const { code, token, signature, recipient } = req.body || {};
  const ip = clientIp(req);
  if (fraud.tooManyAttempts(`activate:${ip}`)) return res.status(429).json({ error: 'Too many attempts. Try later.' });

  const row = await dbTry(() => db.query('SELECT * FROM vouchers WHERE code = $1', [code]).then((r) => r.rows[0]));
  if (row === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });

  const check = fraud.validateRedemption(row, { token, signature, recipient });
  await dbSafe(() => db.query('INSERT INTO redemption_attempts (code,ip,result) VALUES ($1,$2,$3)', [code, ip, check.ok ? 'ok' : check.reason]));
  if (!check.ok) return res.status(check.reason === 'not_found' ? 404 : 400).json({ error: check.reason });

  const options = await dbSafe(() => db.query(
    'SELECT e.*, c.slug AS category_slug FROM experiences e LEFT JOIN categories c ON e.category_id=c.id WHERE e.id = ANY($1)',
    [row.option_ids]).then((r) => r.rows), []);
  // Monetary value the voucher can be exchanged against.
  const faceValue = Number(row.face_value) || Math.max(0, ...options.map((o) => Number(o.price)));
  res.json({ ok: true, type: row.type, options, faceValue });
});

// ─────────────────────────── VOUCHER REDEEM (single-use, atomic) ───────────────────────────
app.post('/api/vouchers/redeem', async (req, res) => {
  const { code, experienceId, token, signature, recipient } = req.body || {};
  const ip = clientIp(req);
  if (fraud.tooManyAttempts(`redeem:${ip}`)) return res.status(429).json({ error: 'Too many attempts. Try later.' });

  const row = await dbTry(() => db.query('SELECT * FROM vouchers WHERE code = $1', [code]).then((r) => r.rows[0]));
  if (row === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });

  const check = fraud.validateRedemption(row, { token, signature, recipient });
  if (!check.ok) {
    await dbSafe(() => db.query('INSERT INTO redemption_attempts (code,ip,result) VALUES ($1,$2,$3)', [code, ip, check.reason]));
    return res.status(check.reason === 'not_found' ? 404 : 400).json({ error: check.reason });
  }
  if (!row.option_ids.includes(Number(experienceId))) {
    return res.status(400).json({ error: 'experience_not_in_voucher' });
  }

  // Atomic single-use transition: only one request can flip active -> redeemed.
  const done = await dbTry(() => db.query(
    `UPDATE vouchers SET status='redeemed', selected_experience_id=$2, redeemed_at=CURRENT_TIMESTAMP
     WHERE code=$1 AND status='active' RETURNING id`, [code, experienceId]).then((r) => r.rows[0]));
  if (done === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });
  await dbSafe(() => db.query('INSERT INTO redemption_attempts (code,ip,result) VALUES ($1,$2,$3)', [code, ip, done ? 'ok' : 'already_redeemed']));
  if (!done) return res.status(409).json({ error: 'already_redeemed' });
  res.json({ success: true });
});

// ─────────────────────────── VOUCHER EXCHANGE (swap / upgrade with top-up) ───────────────────────────
// The recipient swaps their gifted experience for a different one. If the new
// experience costs more, they pay the difference; the voucher is then re-pointed
// to the new experience. Pass quoteOnly:true to preview the top-up without charging.
app.post('/api/vouchers/exchange', async (req, res) => {
  const { code, experienceId, token, signature, recipient, method = 'card', cardLast4, quoteOnly } = req.body || {};
  const ip = clientIp(req);
  if (fraud.tooManyAttempts(`exchange:${ip}`)) return res.status(429).json({ error: 'Too many attempts. Try later.' });

  const row = await dbTry(() => db.query('SELECT * FROM vouchers WHERE code = $1', [code]).then((r) => r.rows[0]));
  if (row === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });

  const check = fraud.validateRedemption(row, { token, signature, recipient });
  if (!check.ok) return res.status(check.reason === 'not_found' ? 404 : 400).json({ error: check.reason });

  const target = await dbTry(() => db.query('SELECT id, price FROM experiences WHERE id = $1', [experienceId]).then((r) => r.rows[0]));
  if (target === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });
  if (!target) return res.status(400).json({ error: 'experience_not_found' });

  // Face value = what the voucher is worth today; top-up covers any upgrade gap.
  // Remember the stored column value for an optimistic-concurrency guard below.
  const storedFace = row.face_value;
  let faceValue = Number(row.face_value);
  if (!faceValue) {
    const v = await dbTry(() => db.query('SELECT COALESCE(MAX(price),0) AS v FROM experiences WHERE id = ANY($1)', [row.option_ids]).then((r) => Number(r.rows[0].v)));
    if (v === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });
    faceValue = v;
  }
  const newPrice = Number(target.price);
  const topUp = Math.max(0, newPrice - faceValue);

  // Quote only — no charge, no mutation.
  if (quoteOnly) return res.json({ ok: true, faceValue, newPrice, topUp, currency: config.payments.currency });

  // Charge the difference (if any). Honest: only proceed on a real success.
  let payment = null;
  if (topUp > 0) {
    if (!SUPPORTED_METHODS.includes(method)) return res.status(400).json({ error: 'Unsupported payment method' });
    payment = await getGateway().createPayment({ amount: topUp, method, metadata: { cardLast4, exchange: code } });
    if (payment.status !== 'succeeded') return res.status(402).json({ error: 'Payment not completed', status: payment.status });
  }

  // Atomically re-point the voucher to the new experience — but only while it's
  // still active AND its face_value is unchanged since we read it. The CAS on
  // face_value prevents two concurrent exchanges from lost-updating each other
  // (last-write-wins); the loser gets 409 and can re-quote.
  const newFace = Math.max(faceValue, newPrice);
  const done = await dbTry(() => db.query(
    `UPDATE vouchers SET option_ids = ARRAY[$2]::int[], face_value = $3
       WHERE code = $1 AND status = 'active' AND face_value IS NOT DISTINCT FROM $4 RETURNING id`,
    [code, experienceId, newFace, storedFace]).then((r) => r.rows[0]));
  if (done === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });
  if (!done) return res.status(409).json({ error: 'not_exchangeable' });

  if (payment) await dbSafe(() => db.query(
    'INSERT INTO payments (provider,provider_ref,amount,currency,method,status) VALUES ($1,$2,$3,$4,$5,$6)',
    [getGateway().name, payment.id, topUp, config.payments.currency, method, 'succeeded']));
  await dbSafe(() => db.query('INSERT INTO redemption_attempts (code,ip,result) VALUES ($1,$2,$3)', [code, ip, 'exchanged']));

  res.json({ ok: true, charged: topUp, faceValue: newFace, newExperienceId: experienceId });
});

// ─────────────────────────── AI GIFT ASSISTANT ───────────────────────────
app.post('/api/assistant', async (req, res) => {
  // Rate-limit: the assistant can call the billed Anthropic API — cap per IP.
  if (fraud.tooManyAttempts(`assistant:${clientIp(req)}`, { max: 30 })) return res.status(429).json({ error: 'Too many requests. Try later.' });
  const { messages = [], recipient = null, catalog = [], lang = 'he' } = req.body || {};
  try {
    const out = await assistant.recommend({ messages, recipient, catalog, lang });
    res.json(out);
  } catch (err) {
    console.error('[assistant]', err);
    res.status(500).json({ error: 'Assistant unavailable' });
  }
});

// ─────────────────────────── CUSTOMER SELF-SERVICE ───────────────────────────
// The signed-in customer can see their own purchases and change their marketing
// consent (easy opt-out is legally required for marketing email in Israel).
app.get('/api/me/orders', async (req, res) => {
  if (!req.user?.sub) return res.status(401).json({ error: 'auth_required' });
  const data = await dbSafe(() => customers.getCustomer(db, req.user.sub), undefined);
  if (data === undefined) return res.status(503).json({ error: 'DB unavailable' });
  if (!data) return res.json({ customer: null, orders: [], consents: [] });
  res.json(data);
});

app.post('/api/me/consent', async (req, res) => {
  if (!req.user?.sub) return res.status(401).json({ error: 'auth_required' });
  const { marketingOptIn } = req.body || {};
  if (typeof marketingOptIn !== 'boolean') return res.status(400).json({ error: 'marketingOptIn (boolean) required' });
  const ok = await dbSafe(async () => {
    await db.query(
      `UPDATE users SET marketing_opt_in = $2, marketing_opt_in_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE marketing_opt_in_at END WHERE id = $1`,
      [req.user.sub, marketingOptIn]);
    await customers.recordConsent(db, {
      userId: req.user.sub, email: req.user.email, kind: 'marketing', granted: marketingOptIn,
      version: config.policyVersion, source: 'account_settings', ip: clientIp(req), userAgent: req.headers['user-agent'],
    });
    return true;
  }, null);
  if (!ok) return res.status(503).json({ error: 'DB unavailable' });
  crm.updateConsent({ email: req.user.email, name: req.user.name }, { marketingOptIn });
  res.json({ ok: true, marketingOptIn });
});

// ─────────────────────────── LOYALTY (VAU Club) ───────────────────────────
app.get('/api/me/loyalty', async (req, res) => {
  if (!req.user?.sub) return res.status(401).json({ error: 'auth_required' });
  const data = await dbSafe(() => customers.getLoyalty(db, req.user.sub), undefined);
  if (data === undefined) return res.status(503).json({ error: 'DB unavailable' });
  res.json(data);
});

// ─────────────────────────── REVIEWS ───────────────────────────
app.get('/api/reviews', async (req, res) => {
  const { experienceId, limit } = req.query;
  const rows = await dbSafe(() => reviews.listReviews(db, { experienceId, limit }), null);
  if (rows == null) return res.status(503).json({ error: 'DB unavailable' });
  if (rows.error) return res.status(400).json({ error: rows.error });
  res.json(rows);
});

app.post('/api/reviews', async (req, res) => {
  const ip = clientIp(req);
  if (fraud.tooManyAttempts(`review:${ip}`, { max: 8 })) return res.status(429).json({ error: 'Too many reviews. Try later.' });
  const { experienceId = null, authorName, rating, body } = req.body || {};
  const name = authorName || req.user?.name;
  const result = await dbSafe(() => reviews.createReview(db, {
    experienceId, userId: req.user?.sub || null, authorName: name, rating, body,
  }), undefined);
  if (result === undefined) return res.status(503).json({ error: 'DB unavailable' });
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result.review);
});

// ─────────────────────────── ADMIN AUTH & BACK-OFFICE ───────────────────────────
const crypto = require('crypto');
function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
// Accept a logged-in admin session (Bearer JWT with adm:true) OR the break-glass
// X-Admin-Token. Attaches req.admin when a session token is used.
function requireAdmin(req, res, next) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = bearer && admin.verifyAdminToken(bearer);
  if (session) { req.admin = session; return next(); }
  const tok = req.headers['x-admin-token'] || bearer;
  if (config.adminToken && timingSafeEqual(tok, config.adminToken)) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// Ensure at least one admin exists (bootstrap). Called at startup.
async function ensureBootstrapAdmin() {
  const { email, password, phone } = config.adminBootstrap;
  if (!email || !password) return;
  try {
    const exists = (await db.query('SELECT 1 FROM admin_users LIMIT 1')).rowCount;
    if (exists) return;
    await db.query(
      'INSERT INTO admin_users (email,name,password_hash,phone,role) VALUES ($1,$2,$3,$4,$5)',
      [email.toLowerCase(), 'Owner', admin.hashPassword(password), phone || null, 'superadmin']);
    console.log(`[admin] bootstrapped first admin: ${email}`);
  } catch (e) { console.error('[admin] bootstrap failed:', e.message); }
}

const adminAudit = (email, ip, result) =>
  dbSafe(() => db.query('INSERT INTO admin_login_attempts (email,ip,result) VALUES ($1,$2,$3)', [email || null, ip, result]));

// ── Admin login (password + optional TOTP; account lockout after 3 fails) ──
app.post('/api/admin/auth/login', async (req, res) => {
  const ip = clientIp(req);
  if (fraud.tooManyAttempts(`admin-login:${ip}`, { max: 15 })) return res.status(429).json({ error: 'too_many_attempts' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const { password, totp } = req.body || {};

  const row = await dbTry(() => db.query('SELECT * FROM admin_users WHERE email=$1', [email]).then((r) => r.rows[0]));
  if (row === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });
  // Generic response for unknown user (no account enumeration).
  if (!row) { await adminAudit(email, ip, 'unknown_user'); return res.status(401).json({ error: 'invalid_credentials' }); }

  if (admin.isLocked(row)) {
    await adminAudit(email, ip, 'locked');
    return res.status(423).json({ error: 'locked', until: row.locked_until });
  }

  if (!admin.verifyPassword(password, row.password_hash)) {
    const failed = (row.failed_attempts || 0) + 1;
    const locked = admin.lockoutState(failed);
    await dbSafe(() => db.query('UPDATE admin_users SET failed_attempts=$2, locked_until=$3 WHERE id=$1', [row.id, failed, locked]));
    await adminAudit(email, ip, 'bad_password');
    if (locked) return res.status(423).json({ error: 'locked', until: locked, message: `Too many attempts. Locked for ${admin.LOCK_MINUTES} minutes.` });
    return res.status(401).json({ error: 'invalid_credentials', attemptsLeft: admin.MAX_FAILED - failed });
  }

  // Password OK — enforce 2FA if enrolled.
  if (row.totp_enabled) {
    if (!totp) return res.json({ needs2fa: true });
    if (!admin.verifyTotp(row.totp_secret, totp)) {
      const failed = (row.failed_attempts || 0) + 1;
      const locked = admin.lockoutState(failed);
      await dbSafe(() => db.query('UPDATE admin_users SET failed_attempts=$2, locked_until=$3 WHERE id=$1', [row.id, failed, locked]));
      await adminAudit(email, ip, 'bad_2fa');
      if (locked) return res.status(423).json({ error: 'locked', until: locked });
      return res.status(401).json({ error: 'invalid_2fa', attemptsLeft: admin.MAX_FAILED - failed });
    }
  }

  await dbSafe(() => db.query('UPDATE admin_users SET failed_attempts=0, locked_until=NULL, last_login_at=CURRENT_TIMESTAMP WHERE id=$1', [row.id]));
  await adminAudit(email, ip, 'ok');
  const token = admin.issueAdminToken(row);
  res.json({ token, admin: { id: row.id, email: row.email, name: row.name, role: row.role, twoFactorEnabled: !!row.totp_enabled } });
});

app.get('/api/admin/auth/me', requireAdmin, async (req, res) => {
  if (!req.admin) return res.json({ admin: { tokenAuth: true } }); // break-glass token
  const row = await dbTry(() => db.query('SELECT id,email,name,role,phone,totp_enabled,last_login_at FROM admin_users WHERE id=$1', [req.admin.sub]).then((r) => r.rows[0]));
  if (row === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });
  if (!row) return res.status(401).json({ error: 'unauthorized' });
  res.json({ admin: { ...row, twoFactorEnabled: row.totp_enabled } });
});

// ── 2FA enrollment ──
app.post('/api/admin/auth/2fa/setup', requireAdmin, async (req, res) => {
  if (!req.admin) return res.status(400).json({ error: 'session_required' });
  const secret = admin.generateTotpSecret();
  const row = await dbTry(() => db.query('SELECT email FROM admin_users WHERE id=$1', [req.admin.sub]).then((r) => r.rows[0]));
  if (row === DB_ERROR || !row) return res.status(503).json({ error: 'DB unavailable' });
  await dbSafe(() => db.query('UPDATE admin_users SET totp_secret=$2 WHERE id=$1', [req.admin.sub, secret]));
  const uri = admin.totpUri(row.email, secret);
  const qr = await QRCode.toDataURL(uri).catch(() => null);
  res.json({ secret, uri, qr });
});

app.post('/api/admin/auth/2fa/enable', requireAdmin, async (req, res) => {
  if (!req.admin) return res.status(400).json({ error: 'session_required' });
  const row = await dbTry(() => db.query('SELECT totp_secret FROM admin_users WHERE id=$1', [req.admin.sub]).then((r) => r.rows[0]));
  if (row === DB_ERROR || !row) return res.status(503).json({ error: 'DB unavailable' });
  if (!admin.verifyTotp(row.totp_secret, req.body?.totp)) return res.status(400).json({ error: 'invalid_2fa' });
  await dbSafe(() => db.query('UPDATE admin_users SET totp_enabled=TRUE WHERE id=$1', [req.admin.sub]));
  res.json({ ok: true });
});

app.post('/api/admin/auth/2fa/disable', requireAdmin, async (req, res) => {
  if (!req.admin) return res.status(400).json({ error: 'session_required' });
  const row = await dbTry(() => db.query('SELECT password_hash FROM admin_users WHERE id=$1', [req.admin.sub]).then((r) => r.rows[0]));
  if (row === DB_ERROR || !row) return res.status(503).json({ error: 'DB unavailable' });
  if (!admin.verifyPassword(req.body?.password, row.password_hash)) return res.status(401).json({ error: 'invalid_credentials' });
  await dbSafe(() => db.query('UPDATE admin_users SET totp_enabled=FALSE, totp_secret=NULL WHERE id=$1', [req.admin.sub]));
  res.json({ ok: true });
});

// ── Account recovery via SMS one-time code ──
app.post('/api/admin/auth/recover/start', async (req, res) => {
  const ip = clientIp(req);
  if (fraud.tooManyAttempts(`admin-recover:${ip}`, { max: 5 })) return res.status(429).json({ error: 'too_many_attempts' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const row = await dbTry(() => db.query('SELECT id,phone FROM admin_users WHERE email=$1', [email]).then((r) => r.rows[0]));
  if (row === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });
  // Always respond the same way (no enumeration). Only send if the account+phone exist.
  if (row?.phone) {
    const code = admin.generateNumericCode(6);
    const expires = new Date(Date.now() + admin.RECOVERY_TTL_MIN * 60000);
    await dbSafe(() => db.query('INSERT INTO admin_recovery (admin_id,code_hash,expires_at) VALUES ($1,$2,$3)', [row.id, admin.hashCode(code), expires]));
    await sendSms(row.phone, `VAU admin recovery code: ${code} (valid ${admin.RECOVERY_TTL_MIN} min)`);
  }
  res.json({ ok: true, message: 'If the account exists and has a phone on file, a code was sent.' });
});

app.post('/api/admin/auth/recover/verify', async (req, res) => {
  const ip = clientIp(req);
  if (fraud.tooManyAttempts(`admin-recover:${ip}`, { max: 10 })) return res.status(429).json({ error: 'too_many_attempts' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const { code, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) return res.status(400).json({ error: 'weak_password' });
  const row = await dbTry(() => db.query('SELECT id FROM admin_users WHERE email=$1', [email]).then((r) => r.rows[0]));
  if (row === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });
  if (!row) return res.status(400).json({ error: 'invalid_code' });
  const rec = await dbTry(() => db.query(
    'SELECT * FROM admin_recovery WHERE admin_id=$1 AND used=FALSE AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1',
    [row.id]).then((r) => r.rows[0]));
  if (rec === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });
  if (!rec || rec.code_hash !== admin.hashCode(code)) return res.status(400).json({ error: 'invalid_code' });
  await dbSafe(async () => {
    await db.query('UPDATE admin_recovery SET used=TRUE WHERE id=$1', [rec.id]);
    await db.query('UPDATE admin_users SET password_hash=$2, failed_attempts=0, locked_until=NULL WHERE id=$1', [row.id, admin.hashPassword(newPassword)]);
  });
  res.json({ ok: true });
});

// ── Business management (media + description) ──
const adminJson = express.json({ limit: '8mb' }); // media data URIs can be large
app.get('/api/admin/businesses', requireAdmin, async (_req, res) => {
  const rows = await dbTry(() => db.query('SELECT * FROM businesses ORDER BY id ASC').then((r) => r.rows));
  if (rows === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });
  res.json(rows);
});

const BIZ_FIELDS = ['slug', 'name_he', 'name_ru', 'description_he', 'description_ru', 'location_he', 'location_ru', 'emoji', 'img', 'logo', 'video_url', 'since', 'rating'];
app.post('/api/admin/businesses', requireAdmin, adminJson, async (req, res) => {
  const b = req.body || {};
  if (!b.slug || !b.name_he || !b.name_ru) return res.status(400).json({ error: 'slug, name_he, name_ru required' });
  const vals = BIZ_FIELDS.map((f) => b[f] ?? null);
  const cols = BIZ_FIELDS.join(',');
  const ph = BIZ_FIELDS.map((_, i) => `$${i + 1}`).join(',');
  const row = await dbTry(() => db.query(`INSERT INTO businesses (${cols}) VALUES (${ph}) RETURNING *`, vals).then((r) => r.rows[0]));
  if (row === DB_ERROR) return res.status(400).json({ error: 'insert_failed' });
  res.status(201).json(row);
});

app.put('/api/admin/businesses/:id', requireAdmin, adminJson, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });
  const b = req.body || {};
  const fields = BIZ_FIELDS.filter((f) => f in b);
  if (!fields.length) return res.status(400).json({ error: 'no_fields' });
  const set = fields.map((f, i) => `${f}=$${i + 2}`).join(',');
  const vals = [id, ...fields.map((f) => b[f])];
  const row = await dbTry(() => db.query(`UPDATE businesses SET ${set} WHERE id=$1 RETURNING *`, vals).then((r) => r.rows[0]));
  if (row === DB_ERROR) return res.status(400).json({ error: 'update_failed' });
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
});

app.delete('/api/admin/businesses/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });
  const done = await dbTry(() => db.query('DELETE FROM businesses WHERE id=$1 RETURNING id', [id]).then((r) => r.rows[0]));
  if (done === DB_ERROR) return res.status(503).json({ error: 'DB unavailable' });
  res.json({ ok: !!done });
});

app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
  const data = await dbSafe(() => customers.stats(db), undefined);
  if (data === undefined) return res.status(503).json({ error: 'DB unavailable' });
  res.json(data);
});

app.get('/api/admin/customers', requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const q = (req.query.q || '').toString().slice(0, 100);
  const data = await dbSafe(() => customers.listCustomers(db, { limit, offset, q }), undefined);
  if (data === undefined) return res.status(503).json({ error: 'DB unavailable' });
  res.json(data);
});

app.get('/api/admin/customers/:id', requireAdmin, async (req, res) => {
  const data = await dbSafe(() => customers.getCustomer(db, req.params.id), undefined);
  if (data === undefined) return res.status(503).json({ error: 'DB unavailable' });
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.json(data);
});

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const data = await dbSafe(() => customers.listOrders(db, { limit, offset }), undefined);
  if (data === undefined) return res.status(503).json({ error: 'DB unavailable' });
  res.json(data);
});

const server = app.listen(port, () => {
  ensureBootstrapAdmin();
  console.log(`VAU API on :${port}  (payments=${getGateway().name}, assistant=${config.isDemo.assistant ? 'rules' : 'claude'}, email=${config.email.transport}, crm=${crm.getCrm().name})`);
});

// Graceful shutdown: stop accepting connections, drain in-flight requests, then
// close the DB pool so redeploys/SIGTERM don't drop live requests or leak conns.
function shutdown(signal) {
  console.log(`[shutdown] ${signal} received, closing server...`);
  server.close(async () => {
    try { await db.close?.(); } catch { /* ignore */ }
    console.log('[shutdown] done');
    process.exit(0);
  });
  // Hard-exit if draining takes too long.
  setTimeout(() => process.exit(1), 10000).unref();
}
['SIGTERM', 'SIGINT'].forEach((s) => process.on(s, () => shutdown(s)));
