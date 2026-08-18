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
// Brevo (ex-Sendinblue) Contacts API. Docs: https://developers.brevo.com/reference/createcontact
// The custom attributes LOCALE / LAST_ORDER_AMOUNT / LAST_ORDER_AT must exist in
// the Brevo account first — run `npm run crm:setup` once to create them (and,
// optionally, a marketing list). Standard attributes FIRSTNAME/LASTNAME/SMS
// always exist. Consent maps to list membership + emailBlacklisted.
function brevoCall(path, method, body) {
  return fetch('https://api.brevo.com/v3' + path, {
    method,
    headers: { 'api-key': config.crm.brevo.apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Assemble a Brevo contact payload from our customer/order shape.
function brevoContactBody(customer, extraAttributes = {}) {
  const { listId } = config.crm.brevo;
  const [firstname, ...rest] = String(customer.name || '').trim().split(/\s+/);
  const attributes = { ...extraAttributes };
  if (firstname) attributes.FIRSTNAME = firstname;
  if (rest.length) attributes.LASTNAME = rest.join(' ');
  if (customer.locale) attributes.LOCALE = customer.locale;
  // Brevo's SMS attribute requires an international (E.164-ish) number; only
  // send it when it plausibly is one, otherwise Brevo rejects the whole upsert.
  if (customer.phone && /^\+?[0-9]{7,15}$/.test(String(customer.phone).replace(/[\s()-]/g, ''))) {
    attributes.SMS = String(customer.phone).replace(/[\s()-]/g, '');
  }
  const body = { email: customer.email, updateEnabled: true, attributes };
  // Only touch the marketing subscription when consent is explicitly known —
  // otherwise a later purchase sync would silently re-subscribe an opted-out
  // contact (emailBlacklisted must not be sent when marketingOptIn is unknown).
  if (typeof customer.marketingOptIn === 'boolean') {
    body.emailBlacklisted = !customer.marketingOptIn;
    if (customer.marketingOptIn && listId) body.listIds = [Number(listId)];
  }
  return body;
}

function brevoAdapter() {
  async function upsert(customer, extraAttributes = {}) {
    if (!customer.email) return { skipped: true };
    const res = await brevoCall('/contacts', 'POST', brevoContactBody(customer, extraAttributes));
    if (!res.ok && res.status !== 204) {
      const txt = await res.text().catch(() => '');
      console.error('[crm:brevo] upsert failed', res.status, txt);
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  }

  return {
    name: 'brevo',
    identify: (customer) => upsert(customer),
    trackPurchase: (order) =>
      upsert(
        { email: order.email, name: order.buyerName, locale: order.locale },
        { LAST_ORDER_AMOUNT: order.amount, LAST_ORDER_AT: new Date().toISOString().slice(0, 10) }
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

// ─────────────────────────── ACTIVETRAIL ADAPTER ───────────────────────────
// Israeli email/SMS marketing platform with native Hebrew/RTL. REST API base
// https://webapi.mymarketing.co.il/api ; the API token is passed verbatim in the
// Authorization header (ActiveTrail's scheme — no "Bearer" prefix).
// Docs: https://webapi.mymarketing.co.il/api/docs/Guides
// NOTE: the members-endpoint body shape can vary between API versions; if your
// account rejects it, check the current docs and adjust addToGroup() — the
// contact upsert itself follows the documented POST /contacts contract.
function activetrailAdapter() {
  const { token, groupId } = config.crm.activetrail;
  const call = (path, method, body) =>
    fetch('https://webapi.mymarketing.co.il/api' + path, {
      method,
      headers: { Authorization: token, 'Content-Type': 'application/json', accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

  async function upsert(customer) {
    if (!customer.email) return;
    const [first, ...rest] = String(customer.name || '').split(' ');
    // POST /contacts creates or updates the contact keyed by email.
    const res = await call('/contacts', 'POST', {
      email: customer.email,
      first_name: first || '',
      last_name: rest.join(' ') || '',
      phone_number: customer.phone || '',
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[crm:activetrail] upsert failed', res.status, txt);
      return;
    }
    // Marketing consent maps to membership of the marketing group/list: opt-in
    // adds them, opt-out simply skips (unsubscribe is a separate AT endpoint).
    if (groupId && customer.marketingOptIn) await addToGroup(customer.email);
  }

  async function addToGroup(email) {
    const res = await call(`/groups/${groupId}/members`, 'POST', { email });
    if (!res.ok && res.status !== 409) {
      const txt = await res.text().catch(() => '');
      console.error('[crm:activetrail] addToGroup failed', res.status, txt);
    }
  }

  return {
    name: 'activetrail',
    identify: (customer) => upsert(customer),
    trackPurchase: (order) => upsert({ email: order.email, name: order.buyerName, phone: order.phone }),
    updateConsent: (customer, { marketingOptIn }) => upsert({ ...customer, marketingOptIn }),
  };
}

function pickAdapter() {
  const p = config.crm.provider;
  if (p === 'brevo' && config.crm.brevo.apiKey) return brevoAdapter();
  if (p === 'hubspot' && config.crm.hubspot.token) return hubspotAdapter();
  if (p === 'activetrail' && config.crm.activetrail.token) return activetrailAdapter();
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
