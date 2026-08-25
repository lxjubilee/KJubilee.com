import { pool as pgPool } from '@/lib/db';
import { getUserIdFromAuth } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const userId = getUserIdFromAuth(request);
    if (!userId) return json({ error: 'Not authenticated' }, 401);
    try {
        const { rows: [u] } = await pgPool.query(`SELECT id, email, name FROM kj_users WHERE id=$1`, [userId]);
        if (!u) return json({ error: 'User not found' }, 404);
        return json({ user: u });
    } catch (e) { return json({ error: e.message }, 500); }
}
