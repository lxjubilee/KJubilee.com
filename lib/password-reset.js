'use strict';

// ─────────────────────────────────────────────────────────────────────────
// Password reset — issuing and burning kJubilee's own one-time tokens.
//
// The route handlers are thin over this so that the two rules that matter are
// stated once:
//
//   1. Nothing here ever tells a caller whether an address has an account.
//      requestReset returns the same shape either way; only the mailbox learns
//      anything. Otherwise the reset form becomes an account enumerator that
//      does not even need a password guess.
//
//   2. The token is never stored. Only its SHA-256 is written, so the table is
//      useless to anyone who reads it — including us.
//
// See migrations/003-password-resets.sql for why kJubilee owns this rather
// than the Jubilee ID authority.
// ─────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const { pool } = require('./db');
const { normalizeEmail, checkLocalEmail } = require('./local-account');
const { hashPassword, createSalt } = require('./auth');
const email = require('./email');
const sso = require('./sso');

const TTL_MINUTES = parseInt(process.env.PASSWORD_RESET_TTL_MINUTES || '60', 10);

// How many live tokens one address may hold. Someone hammering "send me a link"
// should not be able to fill the table or the recipient's inbox on our budget.
const MAX_LIVE_PER_EMAIL = parseInt(process.env.PASSWORD_RESET_MAX_LIVE || '3', 10);

function newToken() {
    // 32 bytes — not guessable, and short enough to survive a mail client's
    // line wrapping inside a URL.
    return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Issue a reset link and email it — but only if the address actually has a
 * kJubilee account. The return value is deliberately the same either way.
 *
 * `delivered` is for the SERVER LOG and tests, never for the response body.
 */
async function requestReset(rawEmail, requestedIp) {
    const addr = normalizeEmail(rawEmail);
    const quiet = { success: true, delivered: false };
    if (!addr) return quiet;

    const local = await checkLocalEmail(addr);
    if (!local.success) return { success: false, delivered: false, error: 'lookup_failed' };

    if (local.exists) {
        if (local.user.is_locked || local.user.is_active === false) {
            console.warn(`[password-reset] ${addr} is locked or inactive — not issuing`);
            return quiet;
        }
    } else {
        // No account HERE — but that is not the question. The reset changes the
        // password on the JUBILEE ID, so what matters is whether one exists.
        //
        // This is the case the first version got wrong, and it got the most
        // important one wrong: "Forgot your password?" sits on the Confirm
        // it's you screen, which by definition is shown to someone who has a
        // Jubilee ID and NO account here yet. They asked for a link and were
        // silently sent nothing.
        if (!sso.isConfigured()) {
            console.warn(`[password-reset] ${addr} has no local account and there is no authority to ask`);
            return quiet;
        }
        const found = await sso.ssoLookup(addr);
        if (!found.ok) {
            console.error('[password-reset] authority lookup failed:', found.status, found.error);
            return { success: false, delivered: false, error: 'lookup_failed' };
        }
        if (!found.data.exists) {
            console.warn(`[password-reset] ${addr} is not known here or at the authority — nothing sent`);
            return quiet;
        }
        console.log(`[password-reset] ${addr} has a Jubilee ID but no kJubilee account — resetting the identity`);
    }

    // Too many outstanding links already? Do not issue another, and still say
    // nothing — a caller must not be able to tell this apart from success.
    try {
        const { rows: [{ live }] } = await pool.query(
            `SELECT COUNT(*)::int AS live FROM kj_password_resets
              WHERE email = $1 AND used_at IS NULL AND expires_at > NOW()`, [addr]
        );
        if (live >= MAX_LIVE_PER_EMAIL) {
            console.warn(`[password-reset] ${addr} already holds ${live} live tokens — not issuing another`);
            return quiet;
        }
    } catch (e) {
        console.error('[password-reset] could not count live tokens:', e.message);
        return { success: false, delivered: false, error: 'lookup_failed' };
    }

    const token = newToken();
    try {
        await pool.query(
            `INSERT INTO kj_password_resets (email, token_hash, expires_at, requested_ip)
             VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval, $4)`,
            [addr, hashToken(token), String(TTL_MINUTES), requestedIp || null]
        );
    } catch (e) {
        console.error('[password-reset] could not store the token:', e.message);
        return { success: false, delivered: false, error: 'store_failed' };
    }

    const sent = await email.sendPasswordResetEmail({ to: addr, token, minutes: TTL_MINUTES });
    if (!sent.success) {
        // The token exists but the mail did not go. Burn it rather than leaving
        // a live credential nobody can use.
        await pool.query(`UPDATE kj_password_resets SET used_at = NOW() WHERE token_hash = $1`, [hashToken(token)])
            .catch(() => {});
        console.error('[password-reset] send failed for', addr, '— token burned');
        return { success: false, delivered: false, error: 'send_failed' };
    }

    console.log(`[password-reset] link sent to ${addr} via ${sent.provider}`);
    return { success: true, delivered: true };
}

/** Look a token up without consuming it — the reset screen checks before it draws. */
async function peekToken(token) {
    if (!token) return { valid: false };
    try {
        const { rows: [row] } = await pool.query(
            `SELECT email FROM kj_password_resets
              WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
            [hashToken(token)]
        );
        if (!row) return { valid: false };
        return { valid: true, email: row.email };
    } catch (e) {
        console.error('[password-reset] peek failed:', e.message);
        return { valid: false, error: 'lookup_failed' };
    }
}

/**
 * Spend the token and set the new password.
 *
 * Where the password lands depends on what the account is. A Jubilee ID account
 * keeps no password here, so the change has to go to the authority or it would
 * change nothing at all. A legacy account that predates the door has its hash
 * in kj_users and is updated in place.
 */
async function completeReset(token, newPassword) {
    if (!newPassword || newPassword.length < 8) {
        return { success: false, error: 'Password must be at least 8 characters.' };
    }

    const peek = await peekToken(token);
    if (!peek.valid) {
        return { success: false, error: 'That reset link has expired or has already been used. Please request a new one.' };
    }
    const addr = peek.email;

    const local = await checkLocalEmail(addr);
    if (!local.success) {
        return { success: false, error: 'Password reset is temporarily unavailable. Please try again in a moment.' };
    }

    // A token can be held by someone with no account here at all (see
    // requestReset). Their password lives only on the Jubilee ID, so that is
    // where it is set — there is no local row to write to, and creating one
    // here would be inventing a membership out of a password reset.
    const usesJubileeId = !local.exists
        || Boolean(local.user.jubilee_id)
        || !local.user.has_local_password;

    if (usesJubileeId) {
        if (!sso.isConfigured()) {
            // Refusing is the honest answer: the credential lives at the
            // authority and we cannot reach it, so nothing we do here would let
            // this person sign in.
            return { success: false, error: 'Password reset is temporarily unavailable. Please try again in a moment.' };
        }
        const r = await sso.ssoChangePasswordByEmail(addr, newPassword);
        if (!r.ok) {
            console.error('[password-reset] authority refused the change:', r.status, r.error);
            return { success: false, error: 'Password reset is temporarily unavailable. Please try again in a moment.' };
        }
    } else {
        const salt = createSalt();
        try {
            await pool.query(
                `UPDATE kj_users SET password_hash = $2, password_salt = $3 WHERE email = $1`,
                [addr, hashPassword(newPassword, salt), salt]
            );
        } catch (e) {
            console.error('[password-reset] local update failed:', e.message);
            return { success: false, error: 'Could not set your new password. Please try again.' };
        }
    }

    // Burn this token AND every other outstanding one for the address: whoever
    // just proved they reach the mailbox has finished, and a second live link
    // is only useful to someone who should not have one.
    await pool.query(
        `UPDATE kj_password_resets SET used_at = NOW()
          WHERE email = $1 AND used_at IS NULL`, [addr]
    ).catch((e) => console.error('[password-reset] could not burn tokens:', e.message));

    console.log(`[password-reset] password changed for ${addr} (${usesJubileeId ? 'jubilee id' : 'local'})`);
    return { success: true, email: addr };
}

module.exports = { requestReset, peekToken, completeReset, hashToken, TTL_MINUTES };
