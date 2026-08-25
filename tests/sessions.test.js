#!/usr/bin/env node
/**
 * Tests the access/refresh split.
 *
 *   node tests/sessions.test.js
 *
 * What this replaced: one stateless HS256 token good for 30 days, which nothing
 * recorded and nothing could withdraw. Signing out cleared the browser; the
 * token kept working for the rest of the month in anyone else's hands.
 *
 * The split has to earn that complexity, so what is under test is the three
 * things it buys, each of which fails silently if wrong:
 *
 *   1. The access token is SHORT. If it is not, a stolen one is still good for
 *      a month and the refresh token is decoration.
 *   2. Sign-out actually ENDS the session. That is the whole reason there is a
 *      table rather than a signature.
 *   3. A refresh token is SINGLE USE. Presenting one twice means a race or a
 *      copy in someone else's hands, and the second attempt must get nothing.
 *
 * The pool is faked; lib/sessions.js runs for real, including the JWT.
 */
'use strict';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (d ? '  — ' + d : '')); } };
const eq = (n, a, b) => ok(n, a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-for-the-guard';
process.env.ACCESS_TOKEN_MINUTES = '15';
process.env.REFRESH_TOKEN_DAYS = '30';
process.env.SESSION_HOURS = '12';

// ── A fake kj_sessions ───────────────────────────────────────────────────
const USERS = { 1: { id: 1, email: 'ada@example.com', is_active: true, is_locked: false } };
let ROWS = [];
let nextId = 1;

const interval = (spec) => {
    const [n, unit] = String(spec).split(' ');
    const ms = /day/.test(unit) ? 86400_000 : /hour/.test(unit) ? 3600_000 : 60_000;
    return Date.now() + parseInt(n, 10) * ms;
};

const fakePool = {
    async query(sql, args = []) {
        const q = String(sql).replace(/\s+/g, ' ').trim();

        if (/^INSERT INTO kj_sessions .* NOW\(\) \+ \$4::interval/i.test(q)) {
            const row = { id: nextId++, user_id: args[0], email: args[1], refresh_hash: args[2],
                          expires_at: new Date(interval(args[3])), revoked_at: null, rotated_to: null,
                          user_agent: args[4], ip: args[5] };
            ROWS.push(row);
            return { rows: [{ expires_at: row.expires_at }], rowCount: 1 };
        }
        if (/^INSERT INTO kj_sessions/i.test(q)) {   // the rotation insert, explicit expiry
            ROWS.push({ id: nextId++, user_id: args[0], email: args[1], refresh_hash: args[2],
                        expires_at: new Date(args[3]), revoked_at: null, rotated_to: null,
                        user_agent: args[4], ip: args[5] });
            return { rows: [], rowCount: 1 };
        }
        if (/^SELECT s.id, s.user_id/i.test(q)) {
            const r = ROWS.find((x) => x.refresh_hash === args[0]);
            if (!r) return { rows: [], rowCount: 0 };
            const u = USERS[r.user_id];
            return { rows: [{ ...r, is_active: u.is_active, is_locked: u.is_locked }], rowCount: 1 };
        }
        if (/^UPDATE kj_sessions SET revoked_at = NOW\(\), rotated_to/i.test(q)) {
            const r = ROWS.find((x) => x.id === args[0]);
            if (r) { r.revoked_at = new Date(); r.rotated_to = args[1]; }
            return { rows: [], rowCount: r ? 1 : 0 };
        }
        if (/^UPDATE kj_sessions SET revoked_at = NOW\(\) WHERE refresh_hash/i.test(q)) {
            const r = ROWS.find((x) => x.refresh_hash === args[0] && !x.revoked_at);
            if (r) r.revoked_at = new Date();
            return { rows: [], rowCount: r ? 1 : 0 };
        }
        if (/^UPDATE kj_sessions SET revoked_at = NOW\(\) WHERE user_id/i.test(q)) {
            let n = 0;
            for (const r of ROWS) if (r.user_id === args[0] && !r.revoked_at) { r.revoked_at = new Date(); n++; }
            return { rows: [], rowCount: n };
        }
        if (/^UPDATE kj_users SET last_login_at/i.test(q)) return { rows: [], rowCount: 1 };
        throw new Error('fake pool: unhandled — ' + q.slice(0, 90));
    },
};
const dbPath = require.resolve('../lib/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: fakePool } };

const S = require('../lib/sessions');
const { verifyJWT } = require('../lib/auth');
const ada = USERS[1];
const minutes = (iso) => Math.round((Date.parse(iso) - Date.now()) / 60000);
const days = (iso) => Math.round((Date.parse(iso) - Date.now()) / 86400000);
const hours = (iso) => Math.round((Date.parse(iso) - Date.now()) / 3600000);

(async () => {
    console.log('\nStarting a session gives a short token and a long one');
    {
        ROWS = [];
        const s = await S.createSession(ada, { rememberMe: true, userAgent: 'test', ip: '203.0.113.1' });
        eq('it succeeds', s.success, true);
        ok('the access token is a real JWT for this user', verifyJWT(s.token).sub === 1);
        ok('and it is SHORT — the point of the split', minutes(s.expiresAt) >= 13 && minutes(s.expiresAt) <= 16,
            `${minutes(s.expiresAt)} minutes`);
        ok('the refresh token is long and not guessable', s.refreshToken.length >= 40);
        ok('and it is the one that lasts', days(s.refreshExpiresAt) >= 29);
        ok('the refresh token is NOT stored in the clear',
            !ROWS.some((r) => JSON.stringify(r).includes(s.refreshToken)));
        eq('what is stored is its SHA-256', ROWS[0].refresh_hash, S.hashToken(s.refreshToken));
    }

    console.log('\n"Keep me signed in" decides how long the session lives');
    {
        ROWS = [];
        const on = await S.createSession(ada, { rememberMe: true });
        const off = await S.createSession(ada, { rememberMe: false });
        ok('on  -> 30 days', days(on.refreshExpiresAt) >= 29, `${days(on.refreshExpiresAt)}d`);
        // Measured in hours: 12h through Math.round(/86400000) is "1 day",
        // which would pass a day-based check for the wrong reason.
        ok('off -> hours, not days', hours(off.refreshExpiresAt) >= 11 && hours(off.refreshExpiresAt) <= 13,
            `${hours(off.refreshExpiresAt)}h`);
        ok('but the access token is short either way',
            minutes(on.expiresAt) <= 16 && minutes(off.expiresAt) <= 16);
    }

    console.log('\nRefreshing gives a new pair and retires the old one');
    {
        ROWS = [];
        const first = await S.createSession(ada, { rememberMe: true });
        const second = await S.refreshSession(first.refreshToken, {});
        eq('the refresh succeeds', second.success, true);
        ok('a new access token comes back', verifyJWT(second.token).sub === 1);
        ok('and a DIFFERENT refresh token', second.refreshToken !== first.refreshToken);
        // Otherwise refreshing every 15 minutes would keep a session alive forever.
        ok('the expiry is inherited, not extended',
            Math.abs(Date.parse(second.refreshExpiresAt) - Date.parse(first.refreshExpiresAt)) < 2000);
        eq('the old token is retired', ROWS.find((r) => r.refresh_hash === S.hashToken(first.refreshToken)).revoked_at !== null, true);
    }

    console.log('\nA refresh token is single use');
    {
        ROWS = [];
        const first = await S.createSession(ada, { rememberMe: true });
        const second = await S.refreshSession(first.refreshToken, {});
        eq('the first use works', second.success, true);

        const replay = await S.refreshSession(first.refreshToken, {});
        eq('the second does not', replay.success, false);
        eq('and is named as a reuse', replay.reason, 'reused');

        // A replayed token means a race or a copy in someone else's hands.
        // Guessing which is worse than assuming the worse of the two.
        const stillLive = await S.refreshSession(second.refreshToken, {});
        eq('the whole chain is revoked, not just the replayed token', stillLive.success, false);
    }

    console.log('\nSigning out ends the session — the part that did not exist before');
    {
        ROWS = [];
        const s = await S.createSession(ada, { rememberMe: true });
        const out = await S.revokeSession(s.refreshToken);
        eq('one session revoked', out.revoked, 1);
        const after = await S.refreshSession(s.refreshToken, {});
        eq('and it can no longer be refreshed', after.success, false);
        // The access token it already handed out stays valid until it expires —
        // that is the trade the 15 minutes pays for.
        ok('the access token already issued is still briefly valid, by design',
            verifyJWT(s.token) !== null);
    }

    console.log('\nWhat a dead session is told');
    {
        ROWS = [];
        eq('an unknown token', (await S.refreshSession('never-issued', {})).reason, 'unknown');
        eq('no token at all', (await S.refreshSession('', {})).reason, 'missing');

        const s = await S.createSession(ada, { rememberMe: true });
        ROWS[0].expires_at = new Date(Date.now() - 1000);
        eq('an expired token', (await S.refreshSession(s.refreshToken, {})).reason, 'expired');
    }

    console.log('\nA locked account cannot refresh its way back in');
    {
        ROWS = [];
        const s = await S.createSession(ada, { rememberMe: true });
        USERS[1].is_locked = true;
        const r = await S.refreshSession(s.refreshToken, {});
        eq('refused', r.success, false);
        eq('for the right reason', r.reason, 'account_blocked');
        USERS[1].is_locked = false;
    }

    console.log('\nSigning out everywhere');
    {
        ROWS = [];
        await S.createSession(ada, { rememberMe: true });
        await S.createSession(ada, { rememberMe: true });
        const all = await S.revokeAllForUser(1);
        eq('both sessions revoked', all.revoked, 2);
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
})();
