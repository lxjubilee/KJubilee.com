import { pool as pgPool } from '@/lib/db';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    let db = 'unknown';
    try { await pgPool.query('SELECT 1'); db = 'ok'; } catch (e) { db = 'down: ' + e.message; }
    return json({ ok: true, env: process.env.NODE_ENV || 'development', db, time: new Date().toISOString() });
}
