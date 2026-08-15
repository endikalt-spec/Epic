const db = require('./db');
const fs = require('fs');
const path = require('path');

async function init() {
  try {
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
