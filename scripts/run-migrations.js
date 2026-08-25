'use strict';

// ─────────────────────────────────────────────────────────────────────────
// Lightweight migration runner — applies every SQL file in /migrations in
// lexical order. Each file is idempotent (CREATE TABLE IF NOT EXISTS …),
// so re-running is safe. Run via:  npm run migrate
// ─────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');

(async () => {
    const dir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    if (!files.length) { console.log('No migrations to apply.'); await pool.end(); return; }
    console.log(`Applying ${files.length} migration file(s) to ${process.env.DB_NAME || 'kjubilee'} …\n`);
    let applied = 0;
    for (const f of files) {
        const sql = fs.readFileSync(path.join(dir, f), 'utf8');
        try {
            await pool.query(sql);
            console.log(`✓ ${f}`);
            applied++;
        } catch (e) {
            console.error(`✗ ${f}: ${e.message}`);
            process.exitCode = 1;
            break;
        }
    }
    console.log(`\n${applied}/${files.length} applied.`);
    await pool.end();
})();
