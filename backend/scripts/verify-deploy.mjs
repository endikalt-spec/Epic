// VAU — live deployment verifier.
//
// Smoke-tests a running deployment (Render, or anywhere) end to end and prints a
// pass/fail checklist. Run it against your live API after deploying.
//
//   Read-only (safe, writes nothing):
//     API=https://api.vaugift.com WEB=https://vaugift.com node scripts/verify-deploy.mjs
//
//   Full lifecycle (also runs a real test checkout → voucher → redeem; only when
//   the payment gateway is 'mock'. Writes test rows and — if Brevo email/CRM are
//   live — may email a test address and upsert a test contact):
//     API=https://api.vaugift.com node scripts/verify-deploy.mjs --full
//
// From the Render Shell of vau-api you can omit API (it reads API_URL/PUBLIC_URL).

const API = (process.env.API || process.env.API_URL || 'http://localhost:3001').replace(/\/+$/, '');
const WEB = (process.env.WEB || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const FULL = process.argv.includes('--full');
const base = API.endsWith('/api') ? API : API + '/api';

let pass = 0, fail = 0, skip = 0;
const P = (ok, name, detail = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); return ok; };
const S = (name, why) => { skip++; console.log(`  ⏭️  ${name} — ${why}`); };
const head = (t) => console.log(`\n━━ ${t}`);

const j = async (r) => { let b = null; try { b = await r.json(); } catch { /* non-json */ } return { status: r.status, body: b }; };
const get = (p, h = {}) => fetch(base + p, { headers: h }).then(j).catch((e) => ({ status: 0, body: { error: e.message } }));
const post = (p, b, h = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) }).then(j).catch((e) => ({ status: 0, body: { error: e.message } }));

console.log(`\nVAU deploy check → ${API}${WEB ? '  (web: ' + WEB + ')' : ''}\n${'─'.repeat(52)}`);

// ── 1. Liveness & readiness ──────────────────────────────────────────────
head('1. Health');
const health = await fetch(API + '/health').then((r) => r.text()).catch((e) => 'ERR:' + e.message);
P(health.trim() === 'OK', 'GET /health', health.slice(0, 40));
// /health/ready lives at the API root (not under /api).
const ready = await fetch(API + '/health/ready').then(j).catch((e) => ({ status: 0, body: { error: e.message } }));
P(ready.status === 200 && ready.body?.status === 'ready', 'GET /health/ready (DB reachable)', JSON.stringify(ready.body));

// ── 2. Catalog (served from Postgres) ────────────────────────────────────
head('2. Catalog from database');
const exps = await get('/experiences');
const okExp = exps.status === 200 && Array.isArray(exps.body) && exps.body.length > 0;
P(okExp, 'GET /api/experiences', okExp ? `${exps.body.length} experiences` : `status ${exps.status}`);
const cats = await get('/categories');
P(cats.status === 200 && Array.isArray(cats.body) && cats.body.length > 0, 'GET /api/categories', cats.status === 200 ? `${cats.body?.length} categories` : `status ${cats.status}`);

// ── 3. Config surfaces ───────────────────────────────────────────────────
head('3. Configuration');
const pcfg = await get('/payments/config');
P(pcfg.status === 200 && !!pcfg.body?.provider, 'GET /api/payments/config',
  pcfg.status === 200 ? `provider=${pcfg.body.provider}, currency=${pcfg.body.currency}, demo=${pcfg.body.demo}` : `status ${pcfg.status}`);
const provider = pcfg.body?.provider;
const aprov = await get('/auth/providers');
P(aprov.status === 200, 'GET /api/auth/providers', aprov.status === 200 ? Object.keys(aprov.body || {}).join(', ') : `status ${aprov.status}`);

// ── 4. Admin API is protected ────────────────────────────────────────────
head('4. Admin authorization');
const noauth = await get('/admin/stats');
P(noauth.status === 401, 'GET /api/admin/stats without token → 401', `got ${noauth.status}`);
// NOTE: we deliberately do NOT attempt admin logins here — repeated wrong
// passwords would lock the real owner account (3-strike lockout).

// ── 5. Anti-forgery on redemption ────────────────────────────────────────
head('5. Anti-forgery');
const forged = await post('/vouchers/activate', { code: 'VAU-FAKE0000', token: 'x', signature: 'y' });
P(forged.status === 404 && forged.body?.error === 'not_found', 'Fabricated code rejected', `status ${forged.status}, ${forged.body?.error}`);

// ── 6. Frontend ──────────────────────────────────────────────────────────
if (WEB) {
  head('6. Frontend');
  const web = await fetch(WEB).then(async (r) => ({ status: r.status, text: await r.text() })).catch((e) => ({ status: 0, text: 'ERR:' + e.message }));
  const okHtml = web.status === 200 && /<div id="root"|<script/i.test(web.text);
  P(okHtml, 'GET / (SPA served)', `status ${web.status}`);
  const deep = await fetch(WEB + '/?v=terms').then((r) => r.status).catch(() => 0);
  P(deep === 200, 'Deep link /?v=terms served (SPA routing)', `status ${deep}`);
} else {
  head('6. Frontend');
  S('Frontend checks', 'set WEB=https://vaugift.com to include them');
}

// ── 7. Full purchase lifecycle (opt-in, mock gateway only) ────────────────
head('7. Purchase → voucher → redeem lifecycle');
if (!FULL) {
  S('Lifecycle', 'read-only mode; pass --full to run a real test checkout');
} else if (provider !== 'mock') {
  S('Lifecycle', `payment provider is '${provider}', not 'mock' — a real card is required, skipping to avoid a charge`);
} else if (!okExp) {
  S('Lifecycle', 'catalog empty, cannot build a test order');
} else {
  const e1 = exps.body[0], e2 = exps.body[1] || exps.body[0];
  const testEmail = `deploy-check+${Date.now()}@vaugift.com`;
  const co = await post('/checkout', {
    experienceIds: [e1.id, e2.id], method: 'card', cardLast4: '4242',
    voucherType: 'bearer', buyerEmail: testEmail, buyerName: 'Deploy Check',
    locale: 'ru', acceptTerms: true, marketingOptIn: false, // no marketing list add
  });
  const code = co.body?.code;
  P(co.status === 200 && co.body?.success && !!code, 'Checkout succeeds, voucher issued', code || `status ${co.status} ${co.body?.error || ''}`);
  console.log(`     ↳ test order email: ${testEmail}  (visible in admin → orders; safe to delete)`);
  console.log(`     ↳ email delivery: ${JSON.stringify(co.body?.email)}`);

  if (code) {
    const u = new URL(co.body.voucher.url);
    const t = u.searchParams.get('t'), s = u.searchParams.get('s');
    const act = await post('/vouchers/activate', { code, token: t, signature: s });
    P(act.status === 200 && act.body?.ok, 'Activate voucher (signature verified)', `options=${act.body?.options?.length}, face=₪${act.body?.faceValue}`);
    const rd = await post('/vouchers/redeem', { code, experienceId: e1.id, token: t, signature: s });
    P(rd.status === 200 && rd.body?.success, 'Redeem voucher (single-use)', `status ${rd.status}`);
    const rd2 = await post('/vouchers/redeem', { code, experienceId: e1.id, token: t, signature: s });
    P(rd2.status === 400 && rd2.body?.error === 'already_redeemed', 'Double-spend blocked', rd2.body?.error);
  }

  const dec = await post('/checkout', { experienceIds: [e1.id], method: 'card', cardLast4: '0002', voucherType: 'bearer', buyerEmail: testEmail, acceptTerms: true });
  P(dec.status === 402, 'Declined card → 402, no voucher', `status ${dec.status}`);
  const nt = await post('/checkout', { experienceIds: [e1.id], buyerEmail: testEmail, voucherType: 'bearer', acceptTerms: false });
  P(nt.status === 400 && nt.body?.error === 'terms_not_accepted', 'Terms gate enforced', nt.body?.error);
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(52)}\n  ${pass} passed · ${fail} failed · ${skip} skipped\n`);
process.exit(fail > 0 ? 1 : 0);
