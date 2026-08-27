import { pool as pgPool } from '@/lib/db';
import { getUserIdFromAuth } from '@/lib/auth';

/*
 * Who may open which section of /admin.
 *
 * lib/admin.js answers one question — "is this an administrator?" — and every
 * route used to ask only that. With a third role the question became "may this
 * person open THIS section", and the answer is per-role data an admin edits at
 * runtime. This file is that answer; requireAdmin stays for the few things
 * that are admin's alone no matter what the table says.
 *
 * THE ROLE IS READ FROM THE DATABASE ON EVERY REQUEST, and so are the
 * permissions. Access tokens carry {sub, email} and nothing else (lib/auth.js
 * signJWT), which is the property that makes a revoked role stop working on
 * the next request rather than in thirty days. Caching either here would give
 * that away for two indexed queries.
 *
 * ADMIN IS ANSWERED IN CODE, NOT LOOKED UP. See migrations/005: if admin's
 * access were data, an admin could untick admin's own access to the Roles &
 * permissions section and lock the console shut for everyone, with psql on the
 * production box as the only way back.
 */

/** The console's sections. The ids here are the ids in app/admin/client.js. */
export const SECTIONS = ['dashboard', 'stations', 'albums', 'feedback', 'users', 'roles'];

/** The roles a kj_users.role may hold. Enforced by the API, not the column. */
export const ROLES = ['user', 'admin', 'executive'];

/** Roles that may be granted sections. `user` never has console access, and
 *  `admin` always has all of it, so neither is configurable. */
export const CONFIGURABLE_ROLES = ['executive'];

export function isSection(s) { return SECTIONS.includes(String(s)); }
export function isRole(r) { return ROLES.includes(String(r).toLowerCase()); }

/**
 * What the caller may do.
 *
 * Returns null for anyone who may not open the console at all — no token, an
 * unknown user, or a plain member. Callers must treat null as 403 and must not
 * leak which of those it was: distinguishing them tells a prober which half of
 * the problem to work on.
 *
 * Otherwise: { id, email, name, role, sections } where `sections` is the list
 * this person may actually open. The console renders its rail from it, so the
 * server decides what the navigation says rather than the browser guessing.
 */
export async function getAccess(request) {
    const userId = getUserIdFromAuth(request);
    if (!userId) return null;

    try {
        const { rows: [u] } = await pgPool.query(
            'SELECT id, email, name, role FROM kj_users WHERE id = $1', [userId]);
        if (!u) return null;

        const role = String(u.role || 'user').toLowerCase();
        if (role === 'admin') return { ...u, role, sections: [...SECTIONS] };
        // A member is not a console user. Asked and answered before the second
        // query, which is the common case and the one worth not paying for.
        if (role === 'user' || !isRole(role)) return null;

        const { rows } = await pgPool.query(
            'SELECT section FROM kj_role_permissions WHERE role = $1', [role]);
        // A row means granted; the table holds no denials. Filtered against the
        // code's own list so a section deleted from the console cannot be
        // resurrected by a row nobody cleaned up.
        const sections = rows.map(r => r.section).filter(isSection);

        // A role with nothing granted may not open the console. Returning an
        // empty-sectioned user instead would put an operator inside a shell
        // with no sections and no explanation.
        if (!sections.length) return null;

        return { ...u, role, sections };
    } catch (e) {
        // A database that cannot answer is not permission to proceed.
        console.error('[access] lookup failed:', e.message);
        return null;
    }
}

/**
 * The gate for a section's route.
 *
 * `requireSection(request, 'albums')` returns the caller when they may open
 * Albums, and null otherwise — for a route handler, null is a flat 403.
 */
export async function requireSection(request, section) {
    if (!isSection(section)) {
        // A typo in a route's own section name must not become an open door.
        console.error('[access] unknown section requested:', section);
        return null;
    }
    const access = await getAccess(request);
    if (!access) return null;
    return access.sections.includes(section) ? access : null;
}
