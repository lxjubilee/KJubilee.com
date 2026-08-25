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
    return json({
        success: true,
        token: sess.token,
        expiresAt: sess.expiresAt,
        user: toAuthUser(user),
    });
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

module.exports = { EMAIL_RE, validateDob, respondSignedIn, localPasswordMatches, loadPasswordRow };
