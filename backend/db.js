const { Pool } = require('pg');
require('dotenv').config();

// Hosted Postgres (Neon/Supabase/RDS) requires SSL; a local instance usually
// doesn't and rejects it. Auto-disable SSL for localhost so local dev works
// without extra flags; override with DB_SSL=true/false when needed.
const cs = process.env.DATABASE_URL || '';
const isLocal = /@(localhost|127\.0\.0\.1)|host=\/|@\//.test(cs) || cs === '';
const ssl =
  process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } :
  process.env.DB_SSL === 'false' ? false :
  isLocal ? false : { rejectUnauthorized: false };

// Cap the pool so multiple instances don't exhaust the provider's connection
// limit (hosted Postgres tiers are often low). Override with DB_POOL_MAX.
const pool = new Pool({ connectionString: cs, ssl, max: Number(process.env.DB_POOL_MAX || 10) });

module.exports = {
  query: (text, params) => pool.query(text, params),
  // A dedicated client for multi-statement transactions (BEGIN/COMMIT).
  // The caller MUST release() it. The returned object exposes query() so the
  // same helper functions work with either the pool or a transaction client.
  getClient: () => pool.connect(),
  // Close the pool on graceful shutdown.
  close: () => pool.end(),
};
