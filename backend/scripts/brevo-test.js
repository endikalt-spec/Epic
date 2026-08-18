// Smoke-tests the live Brevo integration end-to-end using the real adapter:
// validates the key, upserts a test contact (opted-in), reads it back, then
// upserts an opt-out to confirm consent maps to emailBlacklisted.
// Run from an environment that can reach api.brevo.com:  npm run crm:test
//
// Uses TEST_EMAIL from the env, or a unique example.com address otherwise.
const config = require('../config');
const crm = require('../crm');

const KEY = config.crm.brevo.apiKey;
const api = (path) =>
  fetch('https://api.brevo.com/v3' + path, {
    headers: { 'api-key': KEY, accept: 'application/json' },
  });

async function main() {
  if (config.crm.provider !== 'brevo' || !KEY) {
    console.error('✗ Set CRM_PROVIDER=brevo and BREVO_API_KEY in backend/.env first.');
    process.exit(1);
  }

  const acc = await api('/account');
  if (!acc.ok) { console.error('✗ Key invalid:', acc.status); process.exit(1); }
  const account = await acc.json();
  console.log(`✓ Key valid — Brevo account: ${account.email}`);

  const email = process.env.TEST_EMAIL || `vau-test+${Date.now()}@example.com`;
  const adapter = crm.getCrm();
  if (adapter.name !== 'brevo') { console.error('✗ Active CRM adapter is', adapter.name, '— expected brevo.'); process.exit(1); }

  // 1) Opted-in identify + a purchase event.
  console.log(`→ Upserting ${email} (opted-in) ...`);
  const r1 = await adapter.identify({ email, name: 'VAU Test', locale: 'he', marketingOptIn: true });
  const r2 = await adapter.trackPurchase({ email, buyerName: 'VAU Test', locale: 'he', amount: 690 });
  console.log('  identify:', r1, '| trackPurchase:', r2);

  // 2) Read the contact back.
  const got = await api(`/contacts/${encodeURIComponent(email)}`);
  if (got.ok) {
    const c = await got.json();
    console.log('✓ Contact stored:', {
      email: c.email, blacklisted: c.emailBlacklisted, lists: c.listIds,
      FIRSTNAME: c.attributes?.FIRSTNAME, LOCALE: c.attributes?.LOCALE, LAST_ORDER_AMOUNT: c.attributes?.LAST_ORDER_AMOUNT,
    });
  } else {
    console.error('✗ Read-back failed:', got.status, await got.text().catch(() => ''));
  }

  // 3) Opt-out → should set emailBlacklisted true.
  console.log('→ Applying opt-out ...');
  await adapter.updateConsent({ email, name: 'VAU Test' }, { marketingOptIn: false });
  const got2 = await api(`/contacts/${encodeURIComponent(email)}`);
  if (got2.ok) console.log('✓ After opt-out, emailBlacklisted =', (await got2.json()).emailBlacklisted);

  console.log('\nBrevo integration OK.');
}

main().catch((e) => { console.error('✗ Test error:', e.message); process.exit(1); });
