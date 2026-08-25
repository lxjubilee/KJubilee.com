'use strict';

// ─────────────────────────────────────────────────────────────────────────
// kJubilee Postgres pool. Dedicated database (NOT the shared multi-tenant
// JubileeVerse DB). Configured via env (.env / .env.example).
// ─────────────────────────────────────────────────────────────────────────

const { Pool } = require('pg');

const pool = new Pool({
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

pool.on('connect', () => console.log('✓ Connected to PostgreSQL database'));
pool.on('error', (err) => console.error('PostgreSQL pool error:', err.message));

module.exports = { pool };
