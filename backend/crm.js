// CRM / marketing connector abstraction.
//
// Architecture: our own Postgres is the system of record for customers, orders
// and consent (see schema.sql) — required for legal audit trails and data
// ownership. This module is the *engagement* layer: it mirrors customers and
// purchases into a ready-made CRM / email marketing platform so the business
// can run campaigns and segments without us reinventing a CRM UI.
//
// Provider-agnostic interface (all methods are best-effort and must never throw
// into the checkout path — a CRM outage must not block a real purchase):
//
//   identify(customer)            -> upsert a contact (email, name, locale, consent)
//   trackPurchase(order)          -> record a purchase / order event
//   updateConsent(customer, opt)  -> push a marketing opt-in/opt-out change
//
// Adapters:
//   - log   (default): prints what *would* be synced. No keys, safe for demo.
//   - brevo (real):    Brevo (ex-Sendinblue) contacts API. Good free tier,
//                      strong email marketing, popular in Israel.
//   - hubspot (real):  HubSpot CRM contacts API. Generous free CRM.
//
// Selection is by CRM_PROVIDER; each real adapter only activates when its API
// key is present, otherwise we fall back to the log adapter.
const config = require('./config');

// ─────────────────────────── LOG ADAPTER (demo) ───────────────────────────
const logAdapter = {
  name: 'log',
  async identify(customer) {
    console.log('[crm:log] identify', {
      email: customer.email, name: customer.name, locale: customer.locale,
      marketingOptIn: customer.marketingOptIn,
    });
  },
  async trackPurchase(order) {
    console.log('[crm:log] purchase', {
      email: order.email, amount: order.amount, currency: order.currency,
      voucherCode: order.voucherCode, items: order.items?.length,
    });
  },
  async updateConsent(customer, { marketingOptIn }) {
    console.log('[crm:log] consent', { email: customer.email, marketingOptIn });
  },
};

// ─────────────────────────── BREVO ADAPTER ───────────────────────────
// Docs: https://developers.brevo.com/reference/createcontact
function brevoAdapter() {
  const { apiKey, listId } = config.crm.brevo;
  const call = (path, method, body) =>
    fetch('https://api.brevo.com/v3' + path, {
      method,
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

  async function upsert(customer, extraAttributes = {}) {
    if (!customer.email) return;
    const body = {
      email: customer.email,
      updateEnabled: true,
      attributes: { FIRSTNAME: customer.name || '', SMS: customer.phone || '', LOCALE: customer.locale || '', ...extraAttributes },
      // Brevo models marketing consent via list membership + emailBlacklisted.
      emailBlacklisted: customer.marketingOptIn === false,
      ...(listId ? { listIds: [Number(listId)] } : {}),
    };
    const res = await call('/contacts', 'POST', body);
    if (!res.ok && res.status !== 204) {
      const txt = await res.text().catch(() => '');
      console.error('[crm:brevo] upsert failed', res.status, txt);
    }
  }

  return {
    name: 'brevo',
    identify: (customer) => upsert(customer),
    trackPurchase: (order) =>
      upsert(
        { email: order.email, name: order.buyerName, locale: order.locale, marketingOptIn: undefined },
        { LAST_ORDER_AMOUNT: order.amount, LAST_ORDER_AT: new Date().toISOString() }
      ),
    updateConsent: (customer, { marketingOptIn }) =>
      upsert({ ...customer, marketingOptIn }),
  };
}

// ─────────────────────────── HUBSPOT ADAPTER ───────────────────────────
// Docs: https://developers.hubspot.com/docs/api/crm/contacts
function hubspotAdapter() {
  const { token } = config.crm.hubspot;
  const call = (path, method, body) =>
    fetch('https://api.hubapi.com' + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

  async function upsert(customer, extra = {}) {
    if (!customer.email) return;
    const [firstname, ...rest] = String(customer.name || '').split(' ');
    const properties = {
      email: customer.email,
      firstname: firstname || '',
      lastname: rest.join(' ') || '',
      phone: customer.phone || '',
      hs_language: customer.locale || '',
      ...extra,
    };
    // HubSpot upsert-by-email: try create, fall back to update on 409.
    const res = await call('/crm/v3/objects/contacts', 'POST', { properties });
    if (res.status === 409) {
      const email = encodeURIComponent(customer.email);
      await call(`/crm/v3/objects/contacts/${email}?idProperty=email`, 'PATCH', { properties });
    } else if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[crm:hubspot] upsert failed', res.status, txt);
    }
  }

  return {
    name: 'hubspot',
    identify: (customer) => upsert(customer),
    trackPurchase: (order) => upsert({ email: order.email, name: order.buyerName, locale: order.locale }),
    updateConsent: (customer) => upsert(customer),
  };
}

function pickAdapter() {
  const p = config.crm.provider;
  if (p === 'brevo' && config.crm.brevo.apiKey) return brevoAdapter();
  if (p === 'hubspot' && config.crm.hubspot.token) return hubspotAdapter();
  return logAdapter;
}

let cached = null;
function getCrm() {
  if (!cached) cached = pickAdapter();
  return cached;
}

// Fire-and-forget wrappers: CRM sync must never break or slow down checkout.
function safe(fn) {
  return (...args) => {
    try {
      Promise.resolve(fn(...args)).catch((e) => console.error('[crm] async error', e.message));
    } catch (e) {
      console.error('[crm] sync error', e.message);
    }
  };
}

module.exports = {
  getCrm,
  identify: safe((...a) => getCrm().identify(...a)),
  trackPurchase: safe((...a) => getCrm().trackPurchase(...a)),
  updateConsent: safe((...a) => getCrm().updateConsent(...a)),
};
