import { pool as pgPool } from '@/lib/db';
import { getUserIdFromAuth } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const userId = getUserIdFromAuth(request);
    if (!userId) return json({ error: 'Not authenticated' }, 401);
    try {
        // `role` comes back so the header can decide whether to offer the admin
        // link. It is one more column on a query already being made, and it is
        // read from the database rather than from the token — a role baked into
        // a 30-day token keeps saying "admin" long after the role is taken away.
        //
        // THIS IS NOT A PERMISSION. It only decides what a menu shows. Every
        // /api/admin/* route asks the database again for itself (lib/admin.js),
        // so a browser that lies about this to itself gains a link and a 403.
        const { rows: [u] } = await pgPool.query(
            `SELECT id, email, name, role FROM kj_users WHERE id=$1`, [userId]);
        if (!u) return json({ error: 'User not found' }, 404);
        return json({ user: u });
    } catch (e) { return json({ error: e.message }, 500); }
}
