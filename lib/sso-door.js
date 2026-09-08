'use strict';

// ─────────────────────────────────────────────────────────────────────────
// The pieces of the Jubilee ID door that more than one route needs.
//
// In server.js these were module-level functions shared by the four /api/sso/*
// handlers. Route handlers are separate modules, so they live here instead —
// same logic, returning a Response rather than writing to `res`.
// ─────────────────────────────────────────────────────────────────────────

const { pool: pgPool } = require('./db');
const { hashPassword } = require('./auth');
const { toAuthUser, issueSession, accountBlockedReason } = require('./local-account');
const { json } = require('./api');
const { ssoOpenSession } = require('./sso');
const { familyCookie } = require('./family-session');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors the client-side rule so a hand-crafted request cannot skip it.
function validateDob(dob) {
    if (!dob) return null; // optional — see the data-minimization note in the door
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return 'Date of birth must be a valid date.';
    const d = new Date(dob + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return 'Date of birth is not a valid date.';
    const now = new Date();
    if (d > now) return 'Date of birth cannot be in the future.';
    const thirteen = new Date(Date.UTC(now.getUTCFullYear() - 13, now.getUTCMonth(), now.getUTCDate()));
    if (d > thirteen) return 'Accounts require a minimum age of 13.';
    return null;
}

// Sign a local user in: mint the kJubilee session and answer in the shape the
// browser stores (see public/js/jubilee-id.js).
//
// This is also where a locked or deactivated account is turned away. The check
// lives HERE, past the password, so that an unauthenticated caller cannot use
// the door to probe which addresses are locked.
async function respondSignedIn(user, rememberMe) {
    const blocked = accountBlockedReason(user);
    if (blocked) return json({ success: false, error: blocked }, 403);

    const sess = await issueSession(user, rememberMe);
    if (!sess.success) {
        return json({ success: false, error: 'Signed in, but the session could not be created. Please try again.' }, 503);
    }

    // AND OPEN THE FAMILY SESSION. Signing in here is proof of identity for the
    // whole family, so the Jubilee ID authority is told about it and the
    // resulting 90-day session is sealed into an httpOnly cookie. That cookie is
    // what lets a plain link — the rail's "Bible Talks" row — hand the reader to
    // a sibling site already signed in, instead of dropping them on its login
    // form for an account they already have.
    const headers = {};
    const cookie = await openFamilySession(user.email);
    if (cookie) headers['Set-Cookie'] = cookie;

    return json({
        success: true,
        token: sess.token,
        expiresAt: sess.expiresAt,
        // The browser needs this to get the next access token — without it the
        // session simply ends in fifteen minutes (app/_session-keeper.js).
        refreshToken: sess.refreshToken,
        refreshExpiresAt: sess.refreshExpiresAt,
        user: toAuthUser(user),
    }, 200, headers);
}

/**
 * Open a Jubilee ID family session and return the Set-Cookie that carries it.
 *
 * BEST-EFFORT, ALWAYS. Every failure here — no service credentials on this box,
 * the authority unreachable, an identity that exists locally but not centrally —
 * returns null, and the reader is simply signed in to kJubilee alone, exactly as
 * they were before this existed. A sign-in that already succeeded must never be
 * turned into an error by the part that is a convenience.
 */
async function openFamilySession(email) {
    if (!email) return null;
    try {
        const opened = await ssoOpenSession(email);
        const token = opened.ok && opened.data && opened.data.sessionToken;
        if (!token) return null;
        return familyCookie(token, email);
    } catch (e) {
        console.error('[sso-door] family session', e.message);
        return null;
    }
}

// Verify a legacy local password (accounts that predate the Jubilee ID door).
function localPasswordMatches(password, row) {
    if (!row || !row.password_hash || !row.password_salt) return false;
    return hashPassword(password, row.password_salt) === row.password_hash;
}

async function loadPasswordRow(email) {
    const { rows: [r] } = await pgPool.query(
        `SELECT password_hash, password_salt FROM kj_users WHERE email = $1`, [email]
    );
    return r || null;
}

module.exports = { EMAIL_RE, validateDob, respondSignedIn, localPasswordMatches, loadPasswordRow, openFamilySession };
