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
  const {
    experienceIds, method = 'card', recipient = null, buyerEmail, buyerName,
    voucherType = 'bearer', cardLast4, amount: amountHint, locale,
    acceptTerms, marketingOptIn = false,
  } = req.body || {};
  if (!Array.isArray(experienceIds) || experienceIds.length === 0 || experienceIds.length > 5) {
    return res.status(400).json({ error: 'Invalid experience selection (1-5 required)' });
  }
  if (!SUPPORTED_METHODS.includes(method)) return res.status(400).json({ error: 'Unsupported payment method' });
  if (voucherType === 'personalized' && !recipient?.email) {
    return res.status(400).json({ error: 'Personalized voucher requires a recipient email' });
  }
  const deliverTo = buyerEmail || recipient?.email;
  if (!deliverTo) return res.status(400).json({ error: 'An email is required to deliver the voucher' });
  // A purchase requires accepting the Terms of Use & Privacy Policy (recorded
  // with a full audit trail below). This is both a business and legal gate.
  if (acceptTerms !== true) return res.status(400).json({ error: 'terms_not_accepted' });

  try {
    // Fetch catalog rows once: used for the amount, the email title and the
    // order line-item snapshot stored on the CRM order record.
    const rows = await dbSafe(async () => {
      const r = await db.query('SELECT id, title_he, price FROM experiences WHERE id = ANY($1)', [experienceIds]);
      return r.rows;
    }, null);
    let amount = rows ? rows.reduce((s, r) => s + Number(r.price), 0) : 0;
    if (!amount) amount = Number(amountHint) || 0;
    if (amount <= 0) return res.status(400).json({ error: 'Could not determine order amount' });
    const items = (rows || []).map((r) => ({ id: r.id, title: r.title_he, price: Number(r.price) }));
    const title = rows?.[0]?.title_he || null;

    // 1) Charge via the gateway. Only proceed on a real success.
    const gateway = getGateway();
    const payment = await gateway.createPayment({ amount, method, metadata: { cardLast4, buyerEmail: deliverTo } });
    if (payment.status !== 'succeeded') {
      return res.status(402).json({ error: 'Payment not completed', status: payment.status, clientSecret: payment.clientSecret });
    }

    // 2) Issue the voucher (codes, signature, QR, barcode).
    const voucher = await vouchers.issue({ type: voucherType, recipient });

    // 3) Persist payment + voucher (best-effort; the voucher is self-verifiable via its signature).
    let paymentDbId = null;
    await dbSafe(async () => {
      const p = await db.query(
        'INSERT INTO payments (provider,provider_ref,amount,currency,method,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [gateway.name, payment.id, amount, config.payments.currency, method, 'succeeded']);
      paymentDbId = p.rows[0].id;
      await db.query(
        `INSERT INTO vouchers (code,token,signature,type,status,recipient_ref,recipient_email,recipient_name,buyer_email,buyer_user_id,payment_id,option_ids,face_value,expires_at)
         VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [voucher.code, voucher.token, voucher.signature, voucher.type, voucher.recipientRef,
         recipient?.email || null, recipient?.name || null, deliverTo, req.user?.sub || null,
         paymentDbId, experienceIds, amount, voucher.expiresAt]);
    });

    // 3b) Record the customer, consent (terms + marketing) and the order — the
    // built-in CRM. Then mirror the customer & purchase into the external CRM/ESP.
    const buyer = { email: deliverTo, name: buyerName || req.user?.name || recipient?.name, locale };
    await dbSafe(() => customers.recordPurchase(db, {
      user: req.user, email: deliverTo, name: buyer.name, locale,
      ip: clientIp(req), userAgent: req.headers['user-agent'],
      acceptTerms: true, marketingOptIn: !!marketingOptIn,
      order: {
        voucherCode: voucher.code, paymentId: paymentDbId, amount,
        currency: config.payments.currency, method, voucherType, items,
      },
    }));
    crm.identify({ email: deliverTo, name: buyer.name, locale, marketingOptIn: !!marketingOptIn });
    crm.trackPurchase({ email: deliverTo, buyerName: buyer.name, locale, amount, currency: config.payments.currency, voucherCode: voucher.code, items });

    // 4) Email the e-voucher.
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
  // Monetary value the voucher can be exchanged against.
  const faceValue = Number(row.face_value) || Math.max(0, ...options.map((o) => Number(o.price)));
  res.json({ ok: true, type: row.type, options, faceValue });
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

// ─────────────────────────── VOUCHER EXCHANGE (swap / upgrade with top-up) ───────────────────────────
// The recipient swaps their gifted experience for a different one. If the new
// experience costs more, they pay the difference; the voucher is then re-pointed
// to the new experience. Pass quoteOnly:true to preview the top-up without charging.
app.post('/api/vouchers/exchange', async (req, res) => {
  const { code, experienceId, token, signature, recipient, method = 'card', cardLast4, quoteOnly } = req.body || {};
  const ip = clientIp(req);
  if (fraud.tooManyAttempts(`exchange:${ip}`)) return res.status(429).json({ error: 'Too many attempts. Try later.' });

  const row = await dbSafe(() => db.query('SELECT * FROM vouchers WHERE code = $1', [code]).then((r) => r.rows[0]), undefined);
  if (row === undefined) return res.status(503).json({ error: 'DB unavailable' });

  const check = fraud.validateRedemption(row, { token, signature, recipient });
  if (!check.ok) return res.status(check.reason === 'not_found' ? 404 : 400).json({ error: check.reason });

  const target = await dbSafe(() => db.query('SELECT id, price FROM experiences WHERE id = $1', [experienceId]).then((r) => r.rows[0]), undefined);
  if (target === undefined) return res.status(503).json({ error: 'DB unavailable' });
  if (!target) return res.status(400).json({ error: 'experience_not_found' });

  // Face value = what the voucher is worth today; top-up covers any upgrade gap.
  let faceValue = Number(row.face_value);
  if (!faceValue) {
    faceValue = await dbSafe(() => db.query('SELECT COALESCE(MAX(price),0) AS v FROM experiences WHERE id = ANY($1)', [row.option_ids]).then((r) => Number(r.rows[0].v)), 0);
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

  // Atomically re-point the voucher to the new experience (only while still active).
  const newFace = Math.max(faceValue, newPrice);
  const done = await dbSafe(() => db.query(
    `UPDATE vouchers SET option_ids = ARRAY[$2]::int[], face_value = $3 WHERE code = $1 AND status = 'active' RETURNING id`,
    [code, experienceId, newFace]).then((r) => r.rows[0]), undefined);
  if (done === undefined) return res.status(503).json({ error: 'DB unavailable' });
  if (!done) return res.status(409).json({ error: 'not_exchangeable' });

  if (payment) await dbSafe(() => db.query(
    'INSERT INTO payments (provider,provider_ref,amount,currency,method,status) VALUES ($1,$2,$3,$4,$5,$6)',
    [getGateway().name, payment.id, topUp, config.payments.currency, method, 'succeeded']));
  await dbSafe(() => db.query('INSERT INTO redemption_attempts (code,ip,result) VALUES ($1,$2,$3)', [code, ip, 'exchanged']));

  res.json({ ok: true, charged: topUp, faceValue: newFace, newExperienceId: experienceId });
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

// ─────────────────────────── ADMIN (CRM back-office) ───────────────────────────
// Protected by a shared admin token. Disabled entirely when ADMIN_TOKEN is unset.
function requireAdmin(req, res, next) {
  if (!config.adminToken) return res.status(403).json({ error: 'admin_disabled' });
  const t = req.headers['x-admin-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (t !== config.adminToken) return res.status(401).json({ error: 'unauthorized' });
  next();
}

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

app.listen(port, () => {
  console.log(`VAU API on :${port}  (payments=${getGateway().name}, assistant=${config.isDemo.assistant ? 'rules' : 'claude'}, email=${config.email.transport}, crm=${crm.getCrm().name})`);
});
