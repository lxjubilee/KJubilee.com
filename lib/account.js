'use strict';

// ─────────────────────────────────────────────────────────────────────────
// What a person can do to their OWN account: read it, rename it, change its
// password, and end it.
//
// ── Why this is not simply four route handlers ──
// Every one of the four has to answer the same awkward question first: where
// does this account's password actually live? A row created through the Jubilee
// ID door keeps none here — password_hash is NULL and the authority at
// sso.jubileeinspire.com is the sole credential store (see lib/local-account.js).
// A row that predates the door keeps a scrypt hash in kj_users. Getting that
// branch wrong is silent in both directions: a local write for a Jubilee ID
// account reports success and changes nothing, and an authority write for a
// legacy account changes a credential nothing here reads.
//
// lib/password-reset.js already makes this decision once, for the signed-OUT
// flow. This is the same decision for the signed-in flow, and the two are
// deliberately written to look alike.
//
// ── What is deliberately NOT here ──
// Changing the email. The address is the join between this row and the Jubilee
// ID, it is what every session, reset token and lookup is keyed on, and it
// belongs to the identity rather than to this site. A person changes it there.
// ─────────────────────────────────────────────────────────────────────────

const { pool } = require('./db');
const { hashPassword, createSalt, getUserIdFromAuth } = require('./auth');
const { accountBlockedReason } = require('./local-account');
const sso = require('./sso');
const sessions = require('./sessions');

const MIN_PASSWORD = 8;

// created_at and last_login_at are here and not in local-account's USER_COLS
// because this is the only screen that shows them: "member since" is the sort
// of thing a settings page owes someone, and a sign-in has no use for it.
const ACCOUNT_COLS = `id, email, first_name, last_name, name, role, jubilee_id,
                      is_active, is_locked, email_verified, created_at, last_login_at,
                      (password_hash IS NOT NULL) AS has_local_password`;

/**
 * Does this account's password live at the Jubilee ID authority?
 *
 * Two ways to be true, and both matter. A linked row obviously does. So does a
 * row with no local hash at all — an account can be linked before jubilee_id
 * was ever recorded, and writing a hash into that row would quietly create a
 * SECOND credential for one identity.
 */
function usesJubileeId(u) {
    return Boolean(u.jubilee_id) || !u.has_local_password;
}

/** The account, or null. Nothing sensitive: no hash, no salt. */
async function loadAccount(userId) {
    if (!userId) return null;
    try {
        const { rows: [u] } = await pool.query(
            `SELECT ${ACCOUNT_COLS} FROM kj_users WHERE id = $1`, [userId]
        );
        return u || null;
    } catch (e) {
        console.error('[account.loadAccount]', e.message);
        return null;
    }
}

/**
 * The gate all four routes share: who is calling, and may they still act?
 *
 * The token cannot answer the second half. It carries `{ sub, email }` and
 * nothing more (lib/auth.js signJWT), so an account locked or deactivated one
 * minute ago still holds a signature that verifies for the rest of its fifteen
 * minutes. lib/admin.js asks the database for the same reason.
 *
 * Returns `{ user }` or `{ error, status }`.
 */
async function requireAccount(request) {
    const userId = getUserIdFromAuth(request);
    if (!userId) return { error: 'Not signed in.', status: 401 };

    const u = await loadAccount(userId);
    if (!u) return { error: 'Not signed in.', status: 401 };

    const blocked = accountBlockedReason(u);
    if (blocked) return { error: blocked, status: 403 };

    return { user: u };
}

/**
 * What the settings screen is told. `password_kind` is the whole reason that
 * screen can be honest — "this changes your Jubilee ID password, on every
 * Jubilee site" is a materially different sentence from "this changes your
 * kJubilee password", and only the server knows which one applies.
 */
function toSettingsAccount(u) {
    if (!u) return null;
    return {
        id: u.id,
        email: u.email,
        name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.name || '',
        first_name: u.first_name || '',
        last_name: u.last_name || '',
        role: u.role || 'user',
        email_verified: u.email_verified !== false,
        linked_to_jubilee_id: Boolean(u.jubilee_id),
        password_kind: usesJubileeId(u) ? 'jubilee-id' : 'local',
        created_at: u.created_at ? new Date(u.created_at).toISOString() : null,
        last_login_at: u.last_login_at ? new Date(u.last_login_at).toISOString() : null,
    };
}

/**
 * What disappears with the account.
 *
 * Shown on the delete screen for one reason: "this cannot be undone" is a
 * warning about nothing in particular, and "17 favourites and 4 followed
 * stations" is a warning about something. All three tables are ON DELETE
 * CASCADE (migrations/001-initial-schema.sql), so this counts exactly what the
 * DELETE will take with it.
 */
async function libraryCounts(userId) {
    const empty = { stations_favorited: 0, stations_followed: 0, albums_followed: 0 };
    try {
        const { rows: [c] } = await pool.query(
            `SELECT (SELECT COUNT(*)::int FROM kj_radio_favorites WHERE user_id = $1) AS stations_favorited,
                    (SELECT COUNT(*)::int FROM kj_radio_follows   WHERE user_id = $1) AS stations_followed,
                    (SELECT COUNT(*)::int FROM kj_album_follows   WHERE user_id = $1) AS albums_followed`,
            [userId]
        );
        return c || empty;
    } catch (e) {
        // A count that cannot be taken must not stop someone reaching their own
        // settings. The screen simply says nothing about the library.
        console.error('[account.libraryCounts]', e.message);
        return empty;
    }
}

/**
 * Prove the person at the keyboard is the one who owns this account.
 *
 * Asked before a deletion — the one act on this screen that a stolen
 * fifteen-minute access token would otherwise be enough to commit for good. A
 * password change no longer asks, because it can be undone by changing it back
 * and it kills every other session on the way through; a deletion can do
 * neither.
 *
 * Note what a wrong password returns versus an unreachable authority: 401 with
 * a message about the password, 503 with a message that promises nothing about
 * it. Collapsing those two would either lock people out during an outage or
 * tell an attacker that a wrong password is being treated as an outage.
 */
async function verifyPassword(u, password) {
    if (!password) return { ok: false, status: 400, error: 'Enter your current password.' };

    if (usesJubileeId(u)) {
        if (!sso.isConfigured()) {
            return { ok: false, status: 503, error: 'That is temporarily unavailable. Please try again in a moment.' };
        }
        const r = await sso.ssoLogin({ email: u.email, password });
        if (r.ok) return { ok: true };
        if (r.status === 401) return { ok: false, status: 401, error: "That password doesn't match. Try again." };
        console.error('[account.verifyPassword] authority', r.status, r.error);
        return { ok: false, status: 503, error: 'That is temporarily unavailable. Please try again in a moment.' };
    }

    let row;
    try {
        const { rows: [r] } = await pool.query(
            `SELECT password_hash, password_salt FROM kj_users WHERE id = $1`, [u.id]
        );
        row = r;
    } catch (e) {
        console.error('[account.verifyPassword] local', e.message);
        return { ok: false, status: 503, error: 'That is temporarily unavailable. Please try again in a moment.' };
    }
    if (!row || !row.password_hash || !row.password_salt) {
        return { ok: false, status: 401, error: "That password doesn't match. Try again." };
    }
    if (hashPassword(password, row.password_salt) !== row.password_hash) {
        return { ok: false, status: 401, error: "That password doesn't match. Try again." };
    }
    return { ok: true };
}

/**
 * Is this already the password on a local account?
 *
 * Only meaningful for accounts whose credential lives in kj_users. A Jubilee ID
 * password is held at the authority, which offers no way to ask "is this it?"
 * without attempting a sign-in — so callers check usesJubileeId first and skip.
 *
 * A missing row or an unreachable database answers false: this guards against a
 * typo, and failing it closed would block a legitimate change over an outage.
 */
async function isCurrentLocalPassword(userId, password) {
    try {
        const { rows: [row] } = await pool.query(
            `SELECT password_hash, password_salt FROM kj_users WHERE id = $1`, [userId]
        );
        if (!row || !row.password_hash || !row.password_salt) return false;
        return hashPassword(password, row.password_salt) === row.password_hash;
    } catch (e) {
        console.error('[account.isCurrentLocalPassword]', e.message);
        return false;
    }
}

/**
 * Change the name on the account.
 *
 * ── Why the authority is written FIRST, and why a failure there stops this ──
 * linkLocalAccount refreshes first_name and last_name FROM the authority on
 * every single sign-in. So a name written only into kj_users survives until the
 * next sign-in and is then silently replaced by the old one — a setting that
 * appears to work and un-does itself overnight. The authority is the copy that
 * decides, so it is the copy that must take the change; kj_users follows.
 *
 * A site with no SSO_CLIENT_SECRET (development), or an account that was never
 * linked, has no authority to write to — and there the local row IS the name.
 */
async function changeName(userId, { first_name, last_name }) {
    const u = await loadAccount(userId);
    if (!u) return { success: false, status: 401, error: 'Not signed in.' };

    const first = String(first_name || '').trim();
    const last  = String(last_name  || '').trim();
    if (!first) return { success: false, status: 400, error: 'Enter your first name.' };
    if (first.length > 80 || last.length > 80) {
        return { success: false, status: 400, error: 'That name is too long.' };
    }

    if (u.jubilee_id && sso.isConfigured()) {
        const r = await sso.ssoUpdateProfileByEmail(u.email, { first_name: first, last_name: last || null });
        if (!r.ok) {
            console.error('[account.changeName] authority refused', r.status, r.error);
            return { success: false, status: 503, error: 'Your name could not be saved just now. Please try again in a moment.' };
        }
    }

    try {
        const { rows: [row] } = await pool.query(
            `UPDATE kj_users
                SET first_name = $2,
                    last_name  = $3,
                    name       = NULLIF(TRIM(COALESCE($2,'') || ' ' || COALESCE($3,'')), '')
              WHERE id = $1
          RETURNING ${ACCOUNT_COLS}`,
            [userId, first, last || null]
        );
        return { success: true, user: toSettingsAccount(row) };
    } catch (e) {
        console.error('[account.changeName] local', e.message);
        return { success: false, status: 500, error: 'Your name could not be saved. Please try again.' };
    }
}

/**
 * Change the password.
 *
 * ── Why this does NOT ask for the current password ──
 * The person is already signed in, and this screen is behind that session. Being
 * asked to type the password you just used to get here reads as the site not
 * believing you, and the people it inconveniences most are the ones who signed
 * in weeks ago and no longer have it to hand. Someone who has genuinely lost it
 * uses /forgot-password, which is the door built for that. What still holds the
 * line is the session itself: requireAccount, the rate limiter on the route, and
 * the fact that every OTHER session dies the moment this succeeds.
 *
 * Deleting the account still asks — that one cannot be undone.
 *
 * Ends with a brand-new session on purpose. Every other session for this
 * account is revoked — that is the point of changing a password, and the reset
 * flow does the same — but revoking without re-issuing would sign the person
 * out of the very tab they are standing in, one second after they succeeded.
 * So this caller is handed a fresh pair to store, and everyone else is out.
 */
async function changePassword(userId, { newPassword, rememberMe = true, userAgent, ip } = {}) {
    const u = await loadAccount(userId);
    if (!u) return { success: false, status: 401, error: 'Not signed in.' };

    if (!newPassword || newPassword.length < MIN_PASSWORD) {
        return { success: false, status: 400, error: `Your new password must be at least ${MIN_PASSWORD} characters.` };
    }
    // Re-typing the password already in use is a mistake worth catching, and for
    // a local account the stored hash is enough to catch it without asking for
    // anything. A Jubilee ID password lives at the authority and cannot be
    // compared from here, so that case goes through unremarked.
    if (!usesJubileeId(u)) {
        const already = await isCurrentLocalPassword(userId, newPassword);
        if (already) {
            return { success: false, status: 400, error: 'Your new password must be different from your current one.' };
        }
    }

    if (usesJubileeId(u)) {
        const r = await sso.ssoChangePasswordByEmail(u.email, newPassword);
        if (!r.ok) {
            console.error('[account.changePassword] authority refused', r.status, r.error);
            return { success: false, status: 503, error: 'Your password could not be changed just now. Please try again in a moment.' };
        }
    } else {
        const salt = createSalt();
        try {
            await pool.query(
                `UPDATE kj_users SET password_hash = $2, password_salt = $3 WHERE id = $1`,
                [userId, hashPassword(newPassword, salt), salt]
            );
        } catch (e) {
            console.error('[account.changePassword] local', e.message);
            return { success: false, status: 500, error: 'Your password could not be changed. Please try again.' };
        }
    }

    // Any reset link still sitting in a mailbox was issued against the old
    // password, and is now a spare key to an account whose owner just changed
    // the lock. completeReset burns them for the same reason.
    await pool.query(
        `UPDATE kj_password_resets SET used_at = NOW() WHERE email = $1 AND used_at IS NULL`, [u.email]
    ).catch((e) => console.error('[account.changePassword] burn resets', e.message));

    await sessions.revokeAllForUser(userId);
    const fresh = await sessions.createSession(u, { rememberMe, userAgent, ip });

    console.log(`[account] password changed for ${u.email} (${usesJubileeId(u) ? 'jubilee id' : 'local'})`);

    // The change itself succeeded and only the new session did not. Saying so is
    // better than a 500, which would imply the password is still the old one.
    if (!fresh.success) return { success: true, scope: usesJubileeId(u) ? 'jubilee-id' : 'local', reauthenticate: true };

    return {
        success: true,
        scope: usesJubileeId(u) ? 'jubilee-id' : 'local',
        token: fresh.token,
        expiresAt: fresh.expiresAt,
        refreshToken: fresh.refreshToken,
        refreshExpiresAt: fresh.refreshExpiresAt,
    };
}

/**
 * End the membership.
 *
 * ── What this deletes, and what it does not ──
 * It deletes the kj_users row. Favourites, station follows, album follows and
 * every session go with it by ON DELETE CASCADE. It does NOT touch the Jubilee
 * ID: that identity is family-wide, other sites are built on it, and letting
 * one property close an account it does not own is not a setting — it is a
 * bug with a confirmation dialog. The screen has to say so, because "delete my
 * account" plainly reads as "delete all of it" to the person clicking it.
 *
 * The password is required. An access token lives fifteen minutes and can be
 * taken; an account should not be destroyable by anything that cheap.
 */
async function deleteAccount(userId, { password } = {}) {
    const u = await loadAccount(userId);
    if (!u) return { success: false, status: 401, error: 'Not signed in.' };

    const proof = await verifyPassword(u, password);
    if (!proof.ok) return { success: false, status: proof.status, error: proof.error };

    // Before the row goes: kj_password_resets is keyed by EMAIL and carries no
    // foreign key, so nothing cascades to it. A live link left behind would
    // outlive the account it was issued for.
    await pool.query(
        `UPDATE kj_password_resets SET used_at = NOW() WHERE email = $1 AND used_at IS NULL`, [u.email]
    ).catch((e) => console.error('[account.deleteAccount] burn resets', e.message));

    try {
        const { rowCount } = await pool.query(`DELETE FROM kj_users WHERE id = $1`, [userId]);
        if (!rowCount) return { success: false, status: 404, error: 'That account is already gone.' };
    } catch (e) {
        console.error('[account.deleteAccount]', e.message);
        return { success: false, status: 500, error: 'Your account could not be deleted. Please try again.' };
    }

    console.log(`[account] deleted the kJubilee account for ${u.email}${u.jubilee_id ? ' — the Jubilee ID was left alone' : ''}`);
    return { success: true, kept_jubilee_id: Boolean(u.jubilee_id) };
}

module.exports = {
    MIN_PASSWORD,
    usesJubileeId, loadAccount, requireAccount, toSettingsAccount, libraryCounts,
    verifyPassword, changeName, changePassword, deleteAccount,
};
