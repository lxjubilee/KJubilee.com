'use strict';

// ─────────────────────────────────────────────────────────────────────────
// The kJubilee LOCAL account — the site's own row for a person, in kj_users.
//
// A Jubilee ID is family-wide identity; this table is this site's membership.
// The two are deliberately separate: a person can own a Jubilee ID and still
// have no account here, which is Outcome B in the sign-in flow and is why
// account creation on kJubilee is an explicit, visible step rather than a
// silent link.
//
// Rows created through the Jubilee ID door are PASSWORDLESS — password_hash and
// password_salt stay NULL and the authority is the sole credential store.
// Legacy rows created by /api/auth/register still carry a local hash and keep
// working, and are what has_local_password reports on.
//
// Mirrors src/lib/server/jiBackend.ts on JubileeInspire.com, but talks to
// Postgres directly because on kJubilee this server IS the backend.
// ─────────────────────────────────────────────────────────────────────────

const { pool } = require('./db');
const { signJWT } = require('./auth');

// "Keep me signed in on this device" off → a short session that dies with the
// browser tab (the door stores it in sessionStorage). On → the normal 30-day token.
const SESSION_HOURS = parseInt(process.env.SESSION_HOURS || '12', 10);

const USER_COLS = `id, email, first_name, last_name, name, role, jubilee_id,
                   is_active, is_locked, email_verified, date_of_birth,
                   (password_hash IS NOT NULL) AS has_local_password`;

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function displayName(first, last, fallback) {
    const joined = [first, last].filter(Boolean).join(' ').trim();
    return joined || fallback || '';
}

// The user object handed to the browser. Deliberately narrow — no hashes, no
// internal flags beyond what the UI needs.
function toAuthUser(u) {
    if (!u) return null;
    return {
        id: u.id,
        email: u.email,
        name: displayName(u.first_name, u.last_name, u.name),
        first_name: u.first_name || null,
        last_name: u.last_name || null,
        role: u.role || 'user',
        jubilee_id: u.jubilee_id || null,
        email_verified: u.email_verified !== false,
    };
}

// Normalize the authority's date_of_birth to YYYY-MM-DD for an <input type="date">
// prefill.
//
// node-pg turns a Postgres DATE into a JS Date at LOCAL midnight, which JSON
// serializes as a UTC instant; reading LOCAL parts back recovers the calendar
// day the person actually entered instead of shifting it by the box's offset.
//
// A value that is ALREADY a bare calendar date is returned untouched. Feeding
// it through Date() would parse it as UTC midnight and then read local parts
// off it, moving every birthday one day earlier west of Greenwich.
function toYmdLocal(v) {
    if (!v) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Does this email already have a kJubilee account? Outcome A hinges on it.
async function checkLocalEmail(email) {
    const addr = normalizeEmail(email);
    if (!addr) return { success: false, exists: false, user: null };
    try {
        const { rows: [u] } = await pool.query(
            `SELECT ${USER_COLS} FROM kj_users WHERE email = $1`, [addr]
        );
        return { success: true, exists: Boolean(u), user: u || null };
    } catch (e) {
        console.error('[local-account.checkLocalEmail]', e.message);
        return { success: false, exists: false, user: null };
    }
}

// Create (or return) the passwordless kJubilee account linked to a Jubilee ID.
// `created` tells the caller whether this call is what brought the row into
// existence — that is the visible "Create Account" moment the flow promises.
//
// email_verified defaults to TRUE because every caller but one reaches here
// having already proved the address by answering the Jubilee ID password.
// signup/register passes false: nothing in that path proved anything yet.
// It is only honoured on CREATE — it never downgrades an existing account.
async function linkLocalAccount({ email, first_name, last_name, date_of_birth, jubilee_id, email_verified }) {
    const addr = normalizeEmail(email);
    if (!addr) return { success: false, created: false, user: null };

    const first = (first_name || '').trim() || null;
    const last  = (last_name || '').trim() || null;
    const dob   = (date_of_birth || '').trim() || null;
    const verified = email_verified === false ? false : true;

    try {
        const existing = await checkLocalEmail(addr);
        if (!existing.success) return { success: false, created: false, user: null };

        if (existing.exists) {
            // Already a member here — refresh the identity fields from the
            // authority (a name changed on any family site lands here) and
            // adopt the jubilee_id if this row predates the link.
            const { rows: [u] } = await pool.query(
                `UPDATE kj_users
                    SET first_name    = COALESCE($2, first_name),
                        last_name     = COALESCE($3, last_name),
                        name          = COALESCE(NULLIF(TRIM(COALESCE($2,'') || ' ' || COALESCE($3,'')), ''), name),
                        date_of_birth = COALESCE($4::date, date_of_birth),
                        jubilee_id    = COALESCE(jubilee_id, $5::uuid)
                  WHERE email = $1
              RETURNING ${USER_COLS}`,
                [addr, first, last, dob, jubilee_id || null]
            );
            return { success: true, created: false, user: u };
        }

        const { rows: [u] } = await pool.query(
            `INSERT INTO kj_users (email, first_name, last_name, name, date_of_birth,
                                   jubilee_id, email_verified)
             VALUES ($1, $2, $3, NULLIF(TRIM(COALESCE($2,'') || ' ' || COALESCE($3,'')), ''), $4::date, $5::uuid, $6)
             RETURNING ${USER_COLS}`,
            [addr, first, last, dob, jubilee_id || null, verified]
        );
        return { success: true, created: true, user: u };
    } catch (e) {
        // A racing request may have inserted the row between the check and the
        // insert. That is a success for this caller, not a failure.
        if (e.code === '23505') {
            const again = await checkLocalEmail(addr);
            if (again.success && again.exists) return { success: true, created: false, user: again.user };
        }
        console.error('[local-account.linkLocalAccount]', e.message);
        return { success: false, created: false, user: null };
    }
}

// Best-effort refresh of the local mirror's name from the authority. Never
// blocks a sign-in — a failure here just means the name is stale for a while.
async function updateLocalAccount({ email, first_name, last_name }) {
    const addr = normalizeEmail(email);
    if (!addr) return { success: false, updated: 0 };
    const first = (first_name || '').trim() || null;
    const last  = (last_name || '').trim() || null;
    if (!first && !last) return { success: true, updated: 0 };
    try {
        const { rowCount } = await pool.query(
            `UPDATE kj_users
                SET first_name = COALESCE($2, first_name),
                    last_name  = COALESCE($3, last_name),
                    name       = COALESCE(NULLIF(TRIM(COALESCE($2,'') || ' ' || COALESCE($3,'')), ''), name)
              WHERE email = $1`,
            [addr, first, last]
        );
        return { success: true, updated: rowCount };
    } catch (e) {
        console.error('[local-account.updateLocalAccount]', e.message);
        return { success: false, updated: 0 };
    }
}

// Mint the kJubilee-native session the browser holds for every later API call.
// The SSO's own token cannot be verified by this server, so sign-in always ends
// with a token of ours.
//
// rememberMe is the "Keep me signed in on this device" toggle and it is the only
// thing that decides the lifetime: off gives a short token the door keeps in
// sessionStorage, so closing the browser really does sign the person out.
async function issueSession(user, rememberMe = true) {
    if (!user || !user.email) return { success: false };
    const seconds = rememberMe ? undefined : SESSION_HOURS * 3600;
    try {
        // signJWT's default lifetime (JWT_EXPIRES_IN) applies when seconds is undefined.
        const token = signJWT({ sub: user.id, email: user.email }, seconds);
        // Best-effort — a failed timestamp write must not cost someone their session.
        await pool.query(`UPDATE kj_users SET last_login_at = NOW() WHERE id = $1`, [user.id])
            .catch(() => {});
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        return {
            success: true,
            token,
            expiresAt: new Date(payload.exp * 1000).toISOString(),
        };
    } catch (e) {
        console.error('[local-account.issueSession]', e.message);
        return { success: false };
    }
}

// A person can only be signed in if the account is usable. Kept separate so the
// three sign-in paths all apply the same rule.
function accountBlockedReason(u) {
    if (!u) return null;
    if (u.is_locked) return 'This account is locked. Please contact support.';
    if (u.is_active === false) return 'This account is no longer active.';
    return null;
}

module.exports = {
    normalizeEmail, toAuthUser, toYmdLocal, displayName,
    checkLocalEmail, linkLocalAccount, updateLocalAccount,
    issueSession, accountBlockedReason,
};
