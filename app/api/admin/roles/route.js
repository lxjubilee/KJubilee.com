import { pool as pgPool } from '@/lib/db';
import { json, readJson, NO_STORE } from '@/lib/api';
import { requireSection, SECTIONS, ROLES, CONFIGURABLE_ROLES, isSection } from '@/lib/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// /api/admin/roles — which sections of the console each role may open.
//
// ONLY `executive` IS EDITABLE. `admin` is answered in code as "everything"
// and `user` as "nothing"; neither is a row (migrations/005 explains why at
// length, and the short version is that an editable admin can lock the console
// shut for everyone). A request to change either is refused rather than
// silently ignored, so a caller is never told it worked when it did not.
//
// THIS ROUTE CAN WIDEN WHO REACHES THIS ROUTE. Granting `roles` to executive
// lets executives edit permissions, and granting `users` lets them set roles —
// including their own, up to admin. That was asked for deliberately: the admin
// decides in the panel. The console says so at the point of the tick rather
// than here, because the place to warn somebody is where they are about to act.
// ─────────────────────────────────────────────────────────────────────────

/** GET — the whole matrix, plus what is and is not editable. */
export async function GET(request) {
    const me = await requireSection(request, 'roles');
    if (!me) return json({ error: 'Forbidden' }, 403, NO_STORE);

    try {
        const [perms, counts] = await Promise.all([
            pgPool.query('SELECT role, section, granted_at, granted_by FROM kj_role_permissions'),
            pgPool.query(`SELECT LOWER(COALESCE(role,'user')) AS role, COUNT(*)::int AS n
                          FROM kj_users GROUP BY 1`),
        ]);

        const granted = {};
        for (const r of ROLES) granted[r] = [];
        for (const row of perms.rows) {
            if (!granted[row.role] || !isSection(row.section)) continue;
            granted[row.role].push(row.section);
        }
        // Answered in code, not read from the table — the matrix the console
        // draws must match the rule the gate actually applies.
        granted.admin = [...SECTIONS];
        granted.user = [];

        const holders = {};
        for (const r of counts.rows) holders[r.role] = r.n;

        return json({
            sections: SECTIONS,
            roles: ROLES,
            editable: CONFIGURABLE_ROLES,
            granted,
            holders,
            me: { id: me.id, role: me.role },
        }, 200, NO_STORE);
    } catch (err) {
        console.error('[admin/roles] read:', err.message);
        return json({ error: 'Failed to read permissions' }, 500, NO_STORE);
    }
}

/**
 * PATCH { role, section, granted }
 *
 * One tick at a time. A whole-matrix PUT would let a stale console — one
 * opened before somebody else changed something — write its old view back over
 * the change, and permissions are exactly the thing that should not be quietly
 * reverted by a tab left open.
 */
export async function PATCH(request) {
    const me = await requireSection(request, 'roles');
    if (!me) return json({ error: 'Forbidden' }, 403, NO_STORE);

    const body = await readJson(request);
    const role = String(body.role || '').trim().toLowerCase();
    const section = String(body.section || '').trim();
    const granted = body.granted === true || body.granted === 'true';

    if (!CONFIGURABLE_ROLES.includes(role)) {
        return json({
            error: ROLES.includes(role)
                ? 'The ' + role + ' role is fixed and cannot be edited.'
                : 'Unknown role.',
        }, 409, NO_STORE);
    }
    if (!isSection(section)) return json({ error: 'Unknown section.' }, 400, NO_STORE);

    try {
        if (granted) {
            await pgPool.query(
                `INSERT INTO kj_role_permissions (role, section, granted_by)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (role, section) DO NOTHING`,
                [role, section, me.email || String(me.id)]);
        } else {
            await pgPool.query(
                'DELETE FROM kj_role_permissions WHERE role = $1 AND section = $2', [role, section]);
        }

        // Widening or narrowing who reaches the console is worth being able to
        // ask about later, and this route writes to no audit table.
        console.warn('[admin/roles] ' + (granted ? 'GRANT ' : 'REVOKE ')
            + role + '.' + section + ' by ' + (me.email || me.id));

        const { rows } = await pgPool.query(
            'SELECT section FROM kj_role_permissions WHERE role = $1', [role]);
        return json({
            success: true,
            role,
            sections: rows.map(r => r.section).filter(isSection),
        }, 200, NO_STORE);
    } catch (err) {
        console.error('[admin/roles] write:', err.message);
        return json({ error: 'Failed to save the permission' }, 500, NO_STORE);
    }
}
