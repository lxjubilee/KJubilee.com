'use strict';

// ─────────────────────────────────────────────────────────────────────────
// kJubilee Postgres pool. Dedicated database (NOT the shared multi-tenant
// JubileeVerse DB). Configured via env (.env / .env.example).
// ─────────────────────────────────────────────────────────────────────────

const { Pool } = require('pg');

// Next dev re-evaluates modules on hot reload; without this the process would
// accumulate a new pool (and its 10 sockets) on every save. Express only ever
// loads this once, so the cache is a no-op there.
const globalForDb = globalThis;

const pool = globalForDb.__kjPgPool || new Pool({
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'kjubilee',
    user:     process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: false,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis:      30_000,
    query_timeout:          15_000,
    statement_timeout:      15_000,
    max: 10,
});

if (!globalForDb.__kjPgPool) {
    pool.on('connect', () => console.log('✓ Connected to PostgreSQL database'));
    pool.on('error', (err) => console.error('PostgreSQL pool error:', err.message));
    globalForDb.__kjPgPool = pool;
}
module.exports = { pool };
