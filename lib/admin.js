import { pool as pgPool } from '@/lib/db';
import { getUserIdFromAuth } from '@/lib/auth';

/**
 * The admin gate.
 *
 * THE TOKEN CANNOT ANSWER THIS ON ITS OWN. Access tokens are signed with
 * `{ sub, email }` and nothing else — see lib/auth.js signJWT — so there is no
 * role claim to read, and adding one would be worse than this lookup: a role
 * baked into a 30-day token keeps saying "admin" for 30 days after the role is
 * taken away. The database is asked every time, which costs one indexed query
 * and means a revoked admin loses access on their next request.
 *
 * Returns the user row on success, or null. Callers must treat null as 403 and
 * must not leak which of the three reasons it was — no token, no user, not an
 * admin are the same answer to anyone probing.
 */
export async function requireAdmin(request) {
    const userId = getUserIdFromAuth(request);
    if (!userId) return null;
    try {
        const { rows: [u] } = await pgPool.query(
            `SELECT id, email, name, role FROM kj_users WHERE id = $1`, [userId]);
        if (!u) return null;
        return String(u.role || '').toLowerCase() === 'admin' ? u : null;
    } catch (e) {
        // A database that cannot answer is not permission to proceed.
        console.error('[admin] role lookup failed:', e.message);
        return null;
    }
}
