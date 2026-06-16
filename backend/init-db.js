const db = require('./db');
const fs = require('fs');
const path = require('path');

async function init() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await db.query(schema);
    console.log('Schema applied');

    const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    await db.query(seed);
    console.log('Seed data applied');

    process.exit(0);
  } catch (err) {
    console.error('Initialization failed:', err);
    process.exit(1);
  }
}

init();
