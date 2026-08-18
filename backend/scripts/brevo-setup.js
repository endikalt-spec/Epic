// One-time Brevo provisioning: validates the API key, creates the custom
// contact attributes the CRM adapter uses, and (optionally) a marketing list.
// Run from an environment that can reach api.brevo.com:  npm run crm:setup
//
// Requires BREVO_API_KEY in the environment (backend/.env). Safe to re-run —
// attributes/lists that already exist are treated as OK.
const config = require('../config');

const KEY = config.crm.brevo.apiKey;
const api = (path, method = 'GET', body) =>
  fetch('https://api.brevo.com/v3' + path, {
    method,
    headers: { 'api-key': KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

async function main() {
  if (!KEY) {
    console.error('✗ BREVO_API_KEY is not set. Add it to backend/.env and retry.');
    process.exit(1);
  }

  // 1) Validate the key.
  const acc = await api('/account');
  if (!acc.ok) {
    console.error('✗ Key validation failed:', acc.status, await acc.text().catch(() => ''));
    process.exit(1);
  }
  const account = await acc.json();
  console.log(`✓ Connected to Brevo as ${account.email} (${account.companyName || 'no company'})`);

  // 2) Create the custom contact attributes the adapter writes.
  const attrs = [
    ['LOCALE', 'text'],
    ['LAST_ORDER_AMOUNT', 'float'],
    ['LAST_ORDER_AT', 'date'],
  ];
  for (const [name, type] of attrs) {
    const res = await api(`/contacts/attributes/normal/${name}`, 'POST', { type });
    if (res.ok) console.log(`✓ Attribute ${name} (${type}) created`);
    else {
      const txt = await res.text().catch(() => '');
      if (/already exist/i.test(txt) || res.status === 400) console.log(`• Attribute ${name} already exists`);
      else console.error(`✗ Attribute ${name} failed:`, res.status, txt);
    }
  }

  // 3) Optionally create a marketing list if none is configured.
  if (config.crm.brevo.listId) {
    console.log(`• Using existing BREVO_LIST_ID=${config.crm.brevo.listId}`);
  } else {
    const fr = await api('/contacts/folders', 'POST', { name: 'VAU' });
    let folderId = null;
    if (fr.ok) folderId = (await fr.json()).id;
    else {
      // Folder may already exist — find it.
      const list = await api('/contacts/folders?limit=50');
      if (list.ok) folderId = ((await list.json()).folders || []).find((f) => f.name === 'VAU')?.id;
    }
    if (folderId) {
      const lr = await api('/contacts/lists', 'POST', { name: 'VAU Marketing', folderId });
      if (lr.ok) {
        const id = (await lr.json()).id;
        console.log(`✓ Created list "VAU Marketing" (id ${id}).`);
        console.log(`  → Add to backend/.env:  BREVO_LIST_ID=${id}`);
      } else {
        console.log('• Could not auto-create a list; create one in the Brevo UI and set BREVO_LIST_ID.');
      }
    }
  }

  console.log('\nDone. Set CRM_PROVIDER=brevo and BREVO_API_KEY (and BREVO_LIST_ID) in your env, then run `npm run crm:test`.');
}

main().catch((e) => { console.error('✗ Setup error:', e.message); process.exit(1); });
