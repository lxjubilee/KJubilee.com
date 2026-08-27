import { pool as pgPool } from '@/lib/db';
import { json, readJson, NO_STORE } from '@/lib/api';
import { requireAdmin } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// /api/admin/users — who has an account, and who is an administrator.
//
// THIS IS THE ONLY ROUTE ON THE SITE THAT GRANTS PRIVILEGE. Everything else
// under /api/admin/ reads or edits content; this hands somebody the ability to
// reach all of it. It is therefore the one place where the guards matter more
// than the feature, and there are three:
//
//   1. requireAdmin, like every sibling — but re-read below, because the role
//      is looked up per request and the caller's own row is what decides.
//   2. YOU CANNOT CHANGE YOUR OWN ROLE. A console whose operator can demote
//      themselves is a console that can be locked with one misplaced click,
//      and the recovery is a psql session on the production box.
//   3. THE LAST ADMINISTRATOR CANNOT BE DEMOTED. Guard 2 alone still allows
//      two admins to demote each other down to none. This one counts first.
//
// Guards 2 and 3 are enforced in the same transaction as the write, not by the
// browser. The button being disabled is a courtesy; this is the rule.
//
// PASSWORDS ARE NEVER SELECTED. `password_hash` and `password_salt` are not in
// any column list here. An admin listing has no use for them, and a route that
// never reads them cannot leak them through a log line or an error body.
// ─────────────────────────────────────────────────────────────────────────

const ROLES = new Set(['user', 'admin']);
const MAX_LIMIT = 500;

const COLUMNS = `id, email, name, first_name, last_name, role,
                 is_active, is_locked, email_verified, jubilee_id,
                 created_at, last_login_at`;

/** GET — the account list, filtered. */
export async function GET(request) {
    const admin = await requireAdmin(request);
    if (!admin) return json({ error: 'Forbidden' }, 403, NO_STORE);

    const q = new URL(request.url).searchParams;
    const where = [];
    const params = [];

    const role = String(q.get('role') || '').trim().toLowerCase();
    if (role) {
        if (!ROLES.has(role)) return json({ error: 'unknown role' }, 400, NO_STORE);
        params.push(role);
        where.push(`LOWER(COALESCE(role, 'user')) = $${params.length}`);
    }

    const search = String(q.get('q') || '').trim();
    if (search) {
        // Parameterised and escaped, so % and _ typed into the search box are
        // matched literally rather than becoming wildcards nobody asked for.
        params.push('%' + search.replace(/[%_\\]/g, '\\$&') + '%');
        const n = params.length;
        where.push(`(email ILIKE $${n} ESCAPE '\\' OR name ILIKE $${n} ESCAPE '\\'
                     OR first_name ILIKE $${n} ESCAPE '\\' OR last_name ILIKE $${n} ESCAPE '\\'
                     OR COALESCE(jubilee_id, '') ILIKE $${n} ESCAPE '\\')`);
    }

    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(q.get('limit'), 10) || 100));

    try {
        const [rows, counts] = await Promise.all([
            pgPool.query(
                `SELECT ${COLUMNS} FROM kj_users
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY (LOWER(COALESCE(role,'user')) = 'admin') DESC, created_at DESC
                 LIMIT ${limit}`, params),
            pgPool.query(
                `SELECT LOWER(COALESCE(role,'user')) AS role, COUNT(*)::int AS n
                 FROM kj_users GROUP BY 1`),
        ]);

        const by_role = {};
        let total = 0;
        for (const r of counts.rows) { by_role[r.role] = r.n; total += r.n; }

        return json({
            users: rows.rows,
            total,
            by_role,
            limit,
            truncated: rows.rows.length === limit,
            // Who is asking. The console greys out the caller's own row with
            // this rather than comparing email strings, which differ in case
            // between the token and the column often enough to matter.
            me: { id: admin.id, email: admin.email },
        }, 200, NO_STORE);
    } catch (err) {
        console.error('[admin/users] list:', err.message);
        return json({ error: 'Failed to fetch users' }, 500, NO_STORE);
    }
}

/**
 * PATCH { id, role } — make someone an administrator, or stop them being one.
 *
 * The read, both guards and the write are one transaction with the target row
 * locked. Without the lock, two admins demoting the last two admins at the same
 * moment would each count two and each be allowed, and the site would end with
 * none — the exact outcome guard 3 exists to prevent.
 */
export async function PATCH(request) {
    const admin = await requireAdmin(request);
    if (!admin) return json({ error: 'Forbidden' }, 403, NO_STORE);

    const body = await readJson(request);
    const id = parseInt(body.id, 10);
    if (!Number.isFinite(id)) return json({ error: 'id is required' }, 400, NO_STORE);

    const role = String(body.role || '').trim().toLowerCase();
    if (!ROLES.has(role)) return json({ error: "role must be 'user' or 'admin'" }, 400, NO_STORE);

    // Guard 2. Checked before the database is touched because it needs nothing
    // from it — and because the clearest error is the one that names the rule.
    if (id === admin.id) {
        return json({
            error: 'You cannot change your own role. Ask another administrator.',
        }, 409, NO_STORE);
    }

    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [target] } = await client.query(
            `SELECT id, email, name, LOWER(COALESCE(role,'user')) AS role
             FROM kj_users WHERE id = $1 FOR UPDATE`, [id]);
        if (!target) {
            await client.query('ROLLBACK');
            return json({ error: 'No account with that id.' }, 404, NO_STORE);
        }

        if (target.role === role) {
            await client.query('ROLLBACK');
            return json({ error: 'That account is already ' + role + '.' }, 409, NO_STORE);
        }

        // Guard 3, counted inside the transaction.
        if (target.role === 'admin' && role !== 'admin') {
            const { rows: [{ n }] } = await client.query(
                `SELECT COUNT(*)::int AS n FROM kj_users
                 WHERE LOWER(COALESCE(role,'user')) = 'admin'`);
            if (n <= 1) {
                await client.query('ROLLBACK');
                return json({
                    error: 'This is the only administrator. Promote someone else first.',
                }, 409, NO_STORE);
            }
        }

        const { rows: [updated] } = await client.query(
            `UPDATE kj_users SET role = $1 WHERE id = $2 RETURNING ${COLUMNS}`, [role, id]);
        await client.query('COMMIT');

        // The grant is the thing worth being able to ask about later, and this
        // route writes to no audit table — so the log line is the record.
        console.warn('[admin/users] role change: ' + target.email + ' ' + target.role
            + ' -> ' + role + ' by ' + (admin.email || admin.id));

        return json({ success: true, user: updated, was: target.role }, 200, NO_STORE);
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) { /* connection already gone */ }
        console.error('[admin/users] role change:', err.message);
        return json({ error: 'Failed to change the role' }, 500, NO_STORE);
    } finally {
        client.release();
    }
}
