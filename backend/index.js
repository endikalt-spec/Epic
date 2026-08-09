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

const app = express();
const port = config.port;

app.use(cors());
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan('dev'));

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

const clientIp = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const dbSafe = async (fn, fallback) => { try { return await fn(); } catch (e) { console.error('[db]', e.message); return fallback; } };

app.get('/health', (_req, res) => res.send('OK'));

// ─────────────────────────── CATALOG ───────────────────────────
app.get('/api/categories', async (_req, res) => {
  const rows = await dbSafe(() => db.query('SELECT * FROM categories').then((r) => r.rows), null);
  if (rows == null) return res.status(503).json({ error: 'DB unavailable' });
  res.json(rows);
});

app.get('/api/experiences', async (req, res) => {
  const { category } = req.query;
  const rows = await dbSafe(async () => {
    let q = 'SELECT e.*, c.slug AS category_slug FROM experiences e LEFT JOIN categories c ON e.category_id = c.id';
    const params = [];
    if (category && category !== 'all') { q += ' WHERE c.slug = $1'; params.push(category); }
    q += ' ORDER BY e.is_best_seller DESC, e.id ASC';
    return (await db.query(q, params)).rows;
  }, null);
  if (rows == null) return res.status(503).json({ error: 'DB unavailable' });
  res.json(rows);
});

// ─────────────────────────── AUTH (Google / Apple) ───────────────────────────
app.get('/api/auth/providers', (_req, res) => res.json(auth.providerStatus()));

app.get('/api/auth/:provider/start', (req, res) => {
  const { provider } = req.params;
  if (provider === 'google' && !config.isDemo.google) return res.redirect(auth.googleAuthUrl());
  if (provider === 'apple' && !config.isDemo.apple) return res.redirect(auth.appleAuthUrl());
  // Demo: no real provider configured.
  res.status(200).json({ demo: true, message: `${provider} is in demo mode; use POST /api/auth/demo` });
});

app.get('/api/auth/google/callback', async (req, res) => {
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
  try {
    const user = auth.decodeAppleIdToken(req.body.id_token);
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
  const { experienceIds, method = 'card', recipient = null, buyerEmail, voucherType = 'bearer', cardLast4, amount: amountHint } = req.body || {};
  if (!Array.isArray(experienceIds) || experienceIds.length === 0 || experienceIds.length > 5) {
    return res.status(400).json({ error: 'Invalid experience selection (1-5 required)' });
  }
  if (!SUPPORTED_METHODS.includes(method)) return res.status(400).json({ error: 'Unsupported payment method' });
  if (voucherType === 'personalized' && !recipient?.email) {
    return res.status(400).json({ error: 'Personalized voucher requires a recipient email' });
  }
  const deliverTo = buyerEmail || recipient?.email;
  if (!deliverTo) return res.status(400).json({ error: 'An email is required to deliver the voucher' });

  try {
    // Amount: sum experience prices from the DB, or trust the client hint if DB is down.
    let amount = await dbSafe(async () => {
      const r = await db.query('SELECT COALESCE(SUM(price),0) AS total FROM experiences WHERE id = ANY($1)', [experienceIds]);
      return Number(r.rows[0].total);
    }, null);
    if (!amount) amount = Number(amountHint) || 0;
    if (amount <= 0) return res.status(400).json({ error: 'Could not determine order amount' });

    // 1) Charge via the gateway. Only proceed on a real success.
    const gateway = getGateway();
    const payment = await gateway.createPayment({ amount, method, metadata: { cardLast4, buyerEmail: deliverTo } });
    if (payment.status !== 'succeeded') {
      return res.status(402).json({ error: 'Payment not completed', status: payment.status, clientSecret: payment.clientSecret });
    }

    // 2) Issue the voucher (codes, signature, QR, barcode).
    const voucher = await vouchers.issue({ type: voucherType, recipient });

    // 3) Persist payment + voucher (best-effort; the voucher is self-verifiable via its signature).
    await dbSafe(async () => {
      const p = await db.query(
        'INSERT INTO payments (provider,provider_ref,amount,currency,method,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [gateway.name, payment.id, amount, config.payments.currency, method, 'succeeded']);
      await db.query(
        `INSERT INTO vouchers (code,token,signature,type,status,recipient_ref,recipient_email,recipient_name,buyer_email,buyer_user_id,payment_id,option_ids,expires_at)
         VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11,$12)`,
        [voucher.code, voucher.token, voucher.signature, voucher.type, voucher.recipientRef,
         recipient?.email || null, recipient?.name || null, deliverTo, req.user?.sub || null,
         p.rows[0].id, experienceIds, voucher.expiresAt]);
    });

    // 4) Email the e-voucher.
    const title = await dbSafe(async () => {
      const r = await db.query('SELECT title_he FROM experiences WHERE id = ANY($1) LIMIT 1', [experienceIds]);
      return r.rows[0]?.title_he;
    }, null);
    const email = await sendVoucherEmail({ to: deliverTo, voucher, experienceTitle: title, buyerName: req.user?.name });

    res.json({
      success: true,
      code: voucher.code,
      voucher: { code: voucher.code, type: voucher.type, qr: voucher.qr, barcode: voucher.barcode, url: voucher.url, expiresAt: voucher.expiresAt },
      payment: { status: 'succeeded', method, amount },
      email,
    });
  } catch (err) {
    console.error('[checkout]', err);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// ─────────────────────────── VOUCHER ACTIVATION (verify) ───────────────────────────
app.post('/api/vouchers/activate', async (req, res) => {
  const { code, token, signature, recipient } = req.body || {};
  const ip = clientIp(req);
  if (fraud.tooManyAttempts(`activate:${ip}`)) return res.status(429).json({ error: 'Too many attempts. Try later.' });

  const row = await dbSafe(() => db.query('SELECT * FROM vouchers WHERE code = $1', [code]).then((r) => r.rows[0]), undefined);
  if (row === undefined) return res.status(503).json({ error: 'DB unavailable' });

  const check = fraud.validateRedemption(row, { token, signature, recipient });
  await dbSafe(() => db.query('INSERT INTO redemption_attempts (code,ip,result) VALUES ($1,$2,$3)', [code, ip, check.ok ? 'ok' : check.reason]));
  if (!check.ok) return res.status(check.reason === 'not_found' ? 404 : 400).json({ error: check.reason });

  const options = await dbSafe(() => db.query(
    'SELECT e.*, c.slug AS category_slug FROM experiences e LEFT JOIN categories c ON e.category_id=c.id WHERE e.id = ANY($1)',
    [row.option_ids]).then((r) => r.rows), []);
  res.json({ ok: true, type: row.type, options });
});

// ─────────────────────────── VOUCHER REDEEM (single-use, atomic) ───────────────────────────
app.post('/api/vouchers/redeem', async (req, res) => {
  const { code, experienceId, token, signature, recipient } = req.body || {};
  const ip = clientIp(req);
  if (fraud.tooManyAttempts(`redeem:${ip}`)) return res.status(429).json({ error: 'Too many attempts. Try later.' });

  const row = await dbSafe(() => db.query('SELECT * FROM vouchers WHERE code = $1', [code]).then((r) => r.rows[0]), undefined);
  if (row === undefined) return res.status(503).json({ error: 'DB unavailable' });

  const check = fraud.validateRedemption(row, { token, signature, recipient });
  if (!check.ok) {
    await dbSafe(() => db.query('INSERT INTO redemption_attempts (code,ip,result) VALUES ($1,$2,$3)', [code, ip, check.reason]));
    return res.status(check.reason === 'not_found' ? 404 : 400).json({ error: check.reason });
  }
  if (!row.option_ids.includes(Number(experienceId))) {
    return res.status(400).json({ error: 'experience_not_in_voucher' });
  }

  // Atomic single-use transition: only one request can flip active -> redeemed.
  const done = await dbSafe(() => db.query(
    `UPDATE vouchers SET status='redeemed', selected_experience_id=$2, redeemed_at=CURRENT_TIMESTAMP
     WHERE code=$1 AND status='active' RETURNING id`, [code, experienceId]).then((r) => r.rows[0]), undefined);
  if (done === undefined) return res.status(503).json({ error: 'DB unavailable' });
  await dbSafe(() => db.query('INSERT INTO redemption_attempts (code,ip,result) VALUES ($1,$2,$3)', [code, ip, done ? 'ok' : 'already_redeemed']));
  if (!done) return res.status(409).json({ error: 'already_redeemed' });
  res.json({ success: true });
});

// ─────────────────────────── AI GIFT ASSISTANT ───────────────────────────
app.post('/api/assistant', async (req, res) => {
  const { messages = [], recipient = null, catalog = [], lang = 'he' } = req.body || {};
  try {
    const out = await assistant.recommend({ messages, recipient, catalog, lang });
    res.json(out);
  } catch (err) {
    console.error('[assistant]', err);
    res.status(500).json({ error: 'Assistant unavailable' });
  }
});

app.listen(port, () => {
  console.log(`VAU API on :${port}  (payments=${getGateway().name}, assistant=${config.isDemo.assistant ? 'rules' : 'claude'}, email=${config.email.transport})`);
});
