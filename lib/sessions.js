'use strict';

// ─────────────────────────────────────────────────────────────────────────
// Sessions: a short access token, and a long refresh token that can be taken
// away again.
//
// ── Why the split ──────────────────────────────────────────────────────
// A single 30-day stateless token is convenient and unrevocable: sign-out
// clears the browser, and the token keeps working in anyone else's hands for
// the rest of the month. Checking a database on every request would fix that
// and cost a query per request.
//
// The split gets both. The ACCESS token stays stateless and is checked by
// signature alone — but it lives ~15 minutes, so a stolen one expires on its
// own. The REFRESH token is the long-lived half, it is stored here, and it is
// the thing sign-out deletes. The worst case for a stolen access token is
// fifteen minutes rather than thirty days.
//
// ── Rotation ───────────────────────────────────────────────────────────
// Every refresh issues a new refresh token and retires the one presented. So a
// refresh token is single-use, and presenting one twice means either a race or
// a copy in someone else's hands — either way the second attempt finds a
// revoked row and gets nothing.
//
// Only the SHA-256 is stored, as with password resets: this table is useless
// to whoever reads it.
// ─────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const { pool } = require('./db');
const { signJWT } = require('./auth');

// Short enough that a stolen access token is worth little, long enough that a
// normal page does not refresh mid-visit.
const ACCESS_MINUTES = parseInt(process.env.ACCESS_TOKEN_MINUTES || '15', 10);

// How long the refresh token — and therefore the session — lasts.
// "Keep me signed in on this device" is the difference between the two.
const REFRESH_DAYS = parseInt(process.env.REFRESH_TOKEN_DAYS || '30', 10);
const SESSION_HOURS = parseInt(process.env.SESSION_HOURS || '12', 10);

function newRefreshToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function mintAccessToken(user) {
    const token = signJWT({ sub: user.id, email: user.email }, ACCESS_MINUTES * 60);
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return { token, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

/**
 * Start a session: one access token to use now, one refresh token to get the
 * next one with.
 */
async function createSession(user, { rememberMe = true, userAgent, ip } = {}) {
    if (!user || !user.id || !user.email) return { success: false };

    const refreshToken = newRefreshToken();
    const lifetime = rememberMe ? `${REFRESH_DAYS} days` : `${SESSION_HOURS} hours`;

    try {
        const { rows: [row] } = await pool.query(
            `INSERT INTO kj_sessions (user_id, email, refresh_hash, expires_at, user_agent, ip)
             VALUES ($1, $2, $3, NOW() + $4::interval, $5, $6)
             RETURNING expires_at`,
            [user.id, user.email, hashToken(refreshToken), lifetime,
             (userAgent || '').slice(0, 400) || null, ip && ip !== 'unknown' ? ip : null]
        );
        const access = mintAccessToken(user);
        await pool.query(`UPDATE kj_users SET last_login_at = NOW() WHERE id = $1`, [user.id]).catch(() => {});
        return {
            success: true,
            token: access.token,
            expiresAt: access.expiresAt,
            refreshToken,
            refreshExpiresAt: new Date(row.expires_at).toISOString(),
        };
    } catch (e) {
        console.error('[sessions.createSession]', e.message);
        return { success: false };
    }
}

/**
 * Spend a refresh token for a fresh pair.
 *
 * Returns { success, token, expiresAt, refreshToken, refreshExpiresAt } or
 * { success: false, reason }. `reason` is for OUR log — the route says only
 * that the session ended, because telling a caller which of expired / revoked
 * / never-existed applies is telling them how close they got.
 */
async function refreshSession(refreshToken, { userAgent, ip } = {}) {
    if (!refreshToken) return { success: false, reason: 'missing' };
    const hash = hashToken(refreshToken);

    let row;
    try {
        const { rows } = await pool.query(
            `SELECT s.id, s.user_id, s.email, s.revoked_at, s.expires_at,
                    u.is_active, u.is_locked
               FROM kj_sessions s
               JOIN kj_users u ON u.id = s.user_id
              WHERE s.refresh_hash = $1`,
            [hash]
        );
        row = rows[0];
    } catch (e) {
        console.error('[sessions.refreshSession]', e.message);
        return { success: false, reason: 'lookup_failed' };
    }

    if (!row) return { success: false, reason: 'unknown' };

    if (row.revoked_at) {
        // Rotation makes a refresh token single-use, so a second presentation
        // is a race at best and a copy of someone's session at worst. Retire
        // the whole chain rather than guess which it was.
        console.warn(`[sessions] a retired refresh token was presented for ${row.email} — revoking every session for that account`);
        await revokeAllForUser(row.user_id).catch(() => {});
        return { success: false, reason: 'reused' };
    }
    if (new Date(row.expires_at) <= new Date()) return { success: false, reason: 'expired' };
    if (row.is_locked || row.is_active === false) return { success: false, reason: 'account_blocked' };

    // Rotate: the new token inherits the original expiry, so refreshing does not
    // quietly extend a session forever.
    const next = newRefreshToken();
    const nextHash = hashToken(next);
    try {
        await pool.query(
            `INSERT INTO kj_sessions (user_id, email, refresh_hash, expires_at, user_agent, ip)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [row.user_id, row.email, nextHash, row.expires_at,
             (userAgent || '').slice(0, 400) || null, ip && ip !== 'unknown' ? ip : null]
        );
        await pool.query(
            `UPDATE kj_sessions SET revoked_at = NOW(), rotated_to = $2, last_used_at = NOW() WHERE id = $1`,
            [row.id, nextHash]
        );
    } catch (e) {
        console.error('[sessions.refreshSession] rotate', e.message);
        return { success: false, reason: 'rotate_failed' };
    }

    const access = mintAccessToken({ id: row.user_id, email: row.email });
    return {
        success: true,
        token: access.token,
        expiresAt: access.expiresAt,
        refreshToken: next,
        refreshExpiresAt: new Date(row.expires_at).toISOString(),
        user_id: row.user_id,
        email: row.email,
    };
}

/** Sign out: the refresh token stops working immediately. */
async function revokeSession(refreshToken) {
    if (!refreshToken) return { success: true, revoked: 0 };
    try {
        const { rowCount } = await pool.query(
            `UPDATE kj_sessions SET revoked_at = NOW()
              WHERE refresh_hash = $1 AND revoked_at IS NULL`,
            [hashToken(refreshToken)]
        );
        return { success: true, revoked: rowCount };
    } catch (e) {
        console.error('[sessions.revokeSession]', e.message);
        return { success: false, revoked: 0 };
    }
}

/** Everything, everywhere — used after a password reset and on a reused token. */
async function revokeAllForUser(userId) {
    try {
        const { rowCount } = await pool.query(
            `UPDATE kj_sessions SET revoked_at = NOW()
              WHERE user_id = $1 AND revoked_at IS NULL`,
            [userId]
        );
        return { success: true, revoked: rowCount };
    } catch (e) {
        console.error('[sessions.revokeAllForUser]', e.message);
        return { success: false, revoked: 0 };
    }
}

async function revokeAllForEmail(email) {
    try {
        const { rowCount } = await pool.query(
            `UPDATE kj_sessions SET revoked_at = NOW()
              WHERE lower(email) = lower($1) AND revoked_at IS NULL`,
            [email]
        );
        return { success: true, revoked: rowCount };
    } catch (e) {
        console.error('[sessions.revokeAllForEmail]', e.message);
        return { success: false, revoked: 0 };
    }
}

module.exports = {
    ACCESS_MINUTES, REFRESH_DAYS,
    createSession, refreshSession, revokeSession, revokeAllForUser, revokeAllForEmail,
    hashToken, mintAccessToken,
};
