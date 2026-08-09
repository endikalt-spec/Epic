// Built-in lightweight CRM: customer, consent and order persistence, plus the
// read queries that power the /api/admin/* endpoints. Our Postgres is the
// system of record; crm.js mirrors the same facts into an external CRM/ESP.
const { emailHash } = require('./fraud');
const config = require('./config');

// A logged-in buyer is keyed by their auth id (google:.. / apple:..). A guest
// checkout still becomes a stable customer keyed by a hash of their email, so
// repeat purchases from the same address aggregate into one CRM record.
function resolveCustomerId(user, email) {
  if (user?.sub) return user.sub;
  return 'guest:' + emailHash(email);
}

async function upsertCustomer(db, { id, email, name, phone, provider, locale }) {
  await db.query(
    `INSERT INTO users (id, email, name, phone, provider, locale)
       VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       email   = COALESCE(EXCLUDED.email, users.email),
       name    = COALESCE(EXCLUDED.name, users.name),
       phone   = COALESCE(EXCLUDED.phone, users.phone),
       locale  = COALESCE(EXCLUDED.locale, users.locale)`,
    [id, email || null, name || null, phone || null, provider || 'guest', locale || null]
  );
}

async function recordConsent(db, { userId, email, kind, granted, version, source, ip, userAgent }) {
  await db.query(
    `INSERT INTO consents (user_id, email, kind, granted, policy_version, source, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, email || null, kind, granted, version || null, source || null, ip || null, userAgent || null]
  );
}

// Records everything that happens when a customer buys a voucher:
//  - upsert the customer,
//  - stamp their current terms/privacy/marketing consent state,
//  - append a full consent audit trail,
//  - insert the order and bump lifetime totals.
// Runs in a single transaction so a customer is never left half-recorded.
async function recordPurchase(db, {
  user, email, name, locale, ip, userAgent,
  acceptTerms, marketingOptIn,
  order, // { voucherCode, paymentId, amount, currency, method, voucherType, items }
}) {
  const id = resolveCustomerId(user, email);
  const version = config.policyVersion;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    await upsertCustomer(client, {
      id, email, name, provider: user?.provider || 'guest', locale,
    });

    // Terms & Privacy are accepted together at checkout (a purchase requires it).
    if (acceptTerms) {
      await client.query(
        `UPDATE users SET terms_accepted_at = CURRENT_TIMESTAMP, terms_version = $2, privacy_version = $2 WHERE id = $1`,
        [id, version]
      );
      await recordConsent(client, { userId: id, email, kind: 'terms', granted: true, version, source: 'checkout', ip, userAgent });
      await recordConsent(client, { userId: id, email, kind: 'privacy', granted: true, version, source: 'checkout', ip, userAgent });
    }

    // Marketing opt-in is optional and explicit; always audit the choice made.
    await client.query(
      `UPDATE users SET marketing_opt_in = $2, marketing_opt_in_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE marketing_opt_in_at END WHERE id = $1`,
      [id, !!marketingOptIn]
    );
    await recordConsent(client, { userId: id, email, kind: 'marketing', granted: !!marketingOptIn, version, source: 'checkout', ip, userAgent });

    // The order record + lifetime totals.
    const o = await client.query(
      `INSERT INTO orders (user_id, email, voucher_code, payment_id, amount, currency, method, voucher_type, items, discount, loyalty_reward, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'paid') RETURNING id, created_at`,
      [id, email || null, order.voucherCode || null, order.paymentId || null, order.amount,
       order.currency, order.method || null, order.voucherType || null, JSON.stringify(order.items || []),
       order.discount || 0, !!order.loyaltyReward]
    );
    await client.query(
      `UPDATE users SET orders_count = orders_count + 1, total_spent = total_spent + $2,
         currency = $3, last_order_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id, order.amount, order.currency]
    );

    await client.query('COMMIT');
    return { customerId: id, orderId: o.rows[0].id };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ── Admin read queries (CRM back-office) ──
async function listCustomers(db, { limit = 50, offset = 0, q = '' } = {}) {
  const params = [];
  let where = '';
  if (q) { params.push('%' + q + '%'); where = `WHERE (email ILIKE $1 OR name ILIKE $1)`; }
  params.push(limit, offset);
  const rows = (await db.query(
    `SELECT id, email, name, provider, locale, marketing_opt_in, orders_count, total_spent,
            currency, terms_accepted_at, last_order_at, first_seen_at
       FROM users ${where}
      ORDER BY last_order_at DESC NULLS LAST, first_seen_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )).rows;
  return rows;
}

async function getCustomer(db, id) {
  const customer = (await db.query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
  if (!customer) return null;
  const orders = (await db.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [id])).rows;
  const consents = (await db.query('SELECT kind, granted, policy_version, source, ip, created_at FROM consents WHERE user_id = $1 ORDER BY created_at DESC', [id])).rows;
  return { customer, orders, consents };
}

async function listOrders(db, { limit = 50, offset = 0 } = {}) {
  return (await db.query(
    `SELECT o.*, u.name AS customer_name FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  )).rows;
}

// ── Loyalty program ("VAU Club") ──
// Rolling-12-month repeat-purchase reward: every 4th gift is 50% off. Purchases
// 1-3 are full price; the 4th is discounted; then the cycle repeats. Computed
// purely from the orders table so it can't be gamed from the client.
const LOYALTY = { windowMonths: 12, threshold: 4, discountPct: 50 };

async function getLoyalty(db, userId) {
  const r = await db.query(
    `SELECT COUNT(*)::int AS c FROM orders
      WHERE user_id = $1 AND status = 'paid'
        AND created_at > NOW() - INTERVAL '12 months'`,
    [userId]
  );
  const purchases = r.rows[0].c;                 // qualifying purchases in the window
  const cycle = purchases % LOYALTY.threshold;   // 0..3 position within the current cycle
  const rewardReady = cycle === LOYALTY.threshold - 1; // 3 done → the next gift is 50% off
  const remaining = rewardReady ? 0 : LOYALTY.threshold - 1 - cycle; // full-price gifts left until the reward
  return {
    windowMonths: LOYALTY.windowMonths,
    threshold: LOYALTY.threshold,
    discountPct: LOYALTY.discountPct,
    purchases, cycle, remaining, rewardReady,
  };
}

async function stats(db) {
  const r = (await db.query(
    `SELECT
       (SELECT COUNT(*) FROM users) AS customers,
       (SELECT COUNT(*) FROM users WHERE marketing_opt_in) AS marketing_opt_ins,
       (SELECT COUNT(*) FROM orders) AS orders,
       (SELECT COALESCE(SUM(amount),0) FROM orders WHERE status = 'paid') AS revenue`
  )).rows[0];
  return {
    customers: Number(r.customers),
    marketingOptIns: Number(r.marketing_opt_ins),
    orders: Number(r.orders),
    revenue: Number(r.revenue),
    currency: config.payments.currency,
  };
}

module.exports = {
  resolveCustomerId, upsertCustomer, recordConsent, recordPurchase,
  listCustomers, getCustomer, listOrders, stats, getLoyalty, LOYALTY,
};
