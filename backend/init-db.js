const db = require('./db');
const fs = require('fs');
const path = require('path');

// On a fresh deploy the database may still be starting when this runs (e.g. the
// first blueprint deploy provisions Postgres and the API together). Wait for it
// to accept connections instead of failing the deploy on the first refusal.
async function waitForDb({ attempts = 30, delayMs = 3000 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await db.query('SELECT 1');
      if (i > 1) console.log(`Database reachable after ${i} attempt(s)`);
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`Database not ready (attempt ${i}/${attempts}: ${err.code || err.message}) — retrying in ${delayMs / 1000}s`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function init() {
  try {
    // Block until Postgres is actually accepting connections (up to ~90s).
    await waitForDb();

    // Schema is fully idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT
    // EXISTS), so it is always safe to (re-)apply on deploy.
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await db.query(schema);
    console.log('Schema applied');

    // The seed is NOT idempotent (plain INSERTs, no natural unique key on
    // experiences), so only load it into an empty catalog. This makes
    // `npm run init-db` safe to run on every deploy without duplicating data.
    const seeded = Number((await db.query('SELECT COUNT(*)::int AS c FROM experiences')).rows[0].c);
    if (seeded > 0) {
      console.log(`Seed skipped — catalog already has ${seeded} experience(s)`);
    } else {
      const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
      await db.query(seed);
      console.log('Seed data applied');
    }

    process.exit(0);
  } catch (err) {
    console.error('Initialization failed:', err);
    process.exit(1);
  }
}

init();
