const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
const dbSchema = process.env.DB_SCHEMA || 'public';

if (!databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn('DATABASE_URL is not set. Please configure it in your .env');
}

const pool = new Pool({
  connectionString: databaseUrl,
});

async function ensurePortalUsersTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${dbSchema}.portal_users (
        id SERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        company TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } finally {
    client.release();
  }
}

async function query(sql, params) {
  const res = await pool.query(sql, params);
  return res;
}

module.exports = {
  pool,
  query,
  ensurePortalUsersTable,
  dbSchema,
};


