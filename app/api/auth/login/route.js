import { pool as pgPool } from '@/lib/db';
import { hashPassword, signJWT } from '@/lib/auth';
import { json, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
    const { email, password } = await readJson(request);
    if (!email || !password) return json({ error: 'Email and password required' }, 400);
    try {
        const { rows: [u] } = await pgPool.query(
            `SELECT id, email, name, password_hash, password_salt FROM kj_users WHERE email=$1`,
            [email.toLowerCase().trim()]
        );
        if (!u) return json({ error: 'Invalid credentials' }, 401);
        if (hashPassword(password, u.password_salt) !== u.password_hash) return json({ error: 'Invalid credentials' }, 401);
        const token = signJWT({ sub: u.id, email: u.email });
        return json({ ok: true, token, user: { id: u.id, email: u.email, name: u.name } });
    } catch (e) {
        console.error('[login]', e.message);
        return json({ error: 'Login failed' }, 500);
    }
}
