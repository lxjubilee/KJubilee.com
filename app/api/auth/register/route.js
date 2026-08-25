import { pool as pgPool } from '@/lib/db';
import { hashPassword, createSalt, signJWT } from '@/lib/auth';
import { json, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
    const { email, password, name } = await readJson(request);
    if (!email || !password) return json({ error: 'Email and password required' }, 400);
    const salt = createSalt();
    const hash = hashPassword(password, salt);
    try {
        const { rows: [u] } = await pgPool.query(
            `INSERT INTO kj_users (email, password_hash, password_salt, name) VALUES ($1,$2,$3,$4) RETURNING id`,
            [email.toLowerCase().trim(), hash, salt, name || '']
        );
        const token = signJWT({ sub: u.id, email: email.toLowerCase().trim() });
        return json({ ok: true, token, user: { id: u.id, email: email.toLowerCase().trim(), name: name || '' } });
    } catch (e) {
        if (e.code === '23505') return json({ error: 'Email already registered' }, 409);
        console.error('[register]', e.message);
        return json({ error: 'Registration failed' }, 500);
    }
}
