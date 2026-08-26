#!/usr/bin/env node
/**
 * Tests what a person may do to their own account.
 *
 *   node tests/account-settings.test.js
 *
 * All four operations in lib/account.js hinge on one branch — does this
 * account's password live HERE, or at the Jubilee ID authority? — and both ways
 * of getting it wrong are silent:
 *
 *   1. A local write for a Jubilee ID account reports success and changes
 *      nothing. The person is told their password changed; the old one still
 *      works, and the new one never will.
 *   2. A name written only into kj_users survives until the next sign-in, at
 *      which point linkLocalAccount refreshes it FROM the authority and puts
 *      the old one back. A setting that un-does itself overnight.
 *
 * The other two properties under test are about consequence: a password change
 * must revoke every OTHER session while leaving this browser signed in, and a
 * deletion must take the kJubilee row and NOT the family-wide identity.
 *
 * The pool and the authority are faked; lib/account.js and lib/sessions.js run
 * for real, including the exact requests they send to the authority.
 */
'use strict';

let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? '  — ' + detail : '')); }
}
const eq = (name, a, b) => ok(name, a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

// ── Environment, set before anything reads it ────────────────────────────
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-for-the-guard';
process.env.SSO_BASE = 'http://sso.test.invalid';
process.env.SSO_CLIENT_ID = 'kjubilee';
process.env.SSO_CLIENT_SECRET = 'test-secret';

const { hashPassword, createSalt, signJWT } = require('../lib/auth');

// ── Fake tables ──────────────────────────────────────────────────────────
const veraSalt = createSalt();
let USERS, SESSIONS, RESETS, sessionId;

function resetTables() {
    USERS = [
        // A Jubilee ID account: no password here at all.
        { id: 1, email: 'ada@example.com', first_name: 'Ada', last_name: 'Lovelace', name: 'Ada Lovelace',
          role: 'user', jubilee_id: 'jid-ada', is_active: true, is_locked: false, email_verified: true,
          created_at: '2026-01-04T10:00:00Z', last_login_at: '2026-08-20T08:00:00Z',
          password_hash: null, password_salt: null },
        // An account that predates the door: its hash is in kj_users.
        { id: 2, email: 'vera@example.com', first_name: 'Vera', last_name: 'Rubin', name: 'Vera Rubin',
          role: 'user', jubilee_id: null, is_active: true, is_locked: false, email_verified: true,
          created_at: '2025-11-01T10:00:00Z', last_login_at: null,
          password_hash: hashPassword('old-password', veraSalt), password_salt: veraSalt },
        // Locked: holds a token that still verifies, and may not act on it.
        { id: 3, email: 'lock@example.com', first_name: 'L', last_name: 'K', name: 'L K',
          role: 'user', jubilee_id: 'jid-lock', is_active: true, is_locked: true, email_verified: true,
          created_at: '2026-02-02T10:00:00Z', last_login_at: null,
          password_hash: null, password_salt: null },
    ];
    SESSIONS = [];
    RESETS = [];
    sessionId = 1;
}
resetTables();

const findUser = (id) => USERS.find((u) => u.id === id) || null;
const project = (u) => u && ({
    id: u.id, email: u.email, first_name: u.first_name, last_name: u.last_name, name: u.name,
    role: u.role, jubilee_id: u.jubilee_id, is_active: u.is_active, is_locked: u.is_locked,
    email_verified: u.email_verified, created_at: u.created_at, last_login_at: u.last_login_at,
    has_local_password: u.password_hash != null,
});

// The library a deletion would take with it. Fixed numbers: what is under test
// is that the screen is told them, not that COUNT(*) works.
const LIBRARY = { stations_favorited: 7, stations_followed: 2, albums_followed: 1 };

const fakePool = {
    async query(sql, args = []) {
        const q = String(sql).replace(/\s+/g, ' ').trim();

        if (/^SELECT id, email, first_name/i.test(q) && /FROM kj_users WHERE id = \$1/i.test(q)) {
            const u = project(findUser(args[0]));
            return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
        }
        if (/^SELECT password_hash, password_salt FROM kj_users WHERE id/i.test(q)) {
            const u = findUser(args[0]);
            return { rows: u ? [{ password_hash: u.password_hash, password_salt: u.password_salt }] : [], rowCount: u ? 1 : 0 };
        }
        if (/^SELECT \(SELECT COUNT\(\*\)::int FROM kj_radio_favorites/i.test(q)) {
            return { rows: [LIBRARY], rowCount: 1 };
        }
        if (/^UPDATE kj_users SET password_hash/i.test(q)) {
            const u = findUser(args[0]);
            if (u) { u.password_hash = args[1]; u.password_salt = args[2]; }
            return { rows: [], rowCount: u ? 1 : 0 };
        }
        if (/^UPDATE kj_users SET first_name/i.test(q)) {
            const u = findUser(args[0]);
            if (u) {
                u.first_name = args[1];
                u.last_name = args[2];
                u.name = [args[1], args[2]].filter(Boolean).join(' ').trim() || null;
            }
            return { rows: u ? [project(u)] : [], rowCount: u ? 1 : 0 };
        }
        if (/^UPDATE kj_users SET last_login_at/i.test(q)) return { rows: [], rowCount: 1 };
        if (/^DELETE FROM kj_users WHERE id/i.test(q)) {
            const i = USERS.findIndex((u) => u.id === args[0]);
            if (i >= 0) {
                USERS.splice(i, 1);
                // ON DELETE CASCADE, which the fake has to imitate or the test
                // would prove the sessions survive a deletion.
                SESSIONS = SESSIONS.filter((s) => s.user_id !== args[0]);
            }
            return { rows: [], rowCount: i >= 0 ? 1 : 0 };
        }
        if (/^UPDATE kj_password_resets SET used_at = NOW\(\) WHERE email/i.test(q)) {
            let n = 0;
            for (const r of RESETS) if (r.email === args[0] && !r.used_at) { r.used_at = Date.now(); n++; }
            return { rows: [], rowCount: n };
        }
        if (/^INSERT INTO kj_sessions/i.test(q)) {
            const expires = new Date(Date.now() + 30 * 86400_000);
            SESSIONS.push({ id: sessionId++, user_id: args[0], email: args[1], refresh_hash: args[2],
                            expires_at: expires, revoked_at: null });
            return { rows: [{ expires_at: expires }], rowCount: 1 };
        }
        if (/^UPDATE kj_sessions SET revoked_at = NOW\(\) WHERE user_id/i.test(q)) {
            let n = 0;
            for (const s of SESSIONS) if (s.user_id === args[0] && !s.revoked_at) { s.revoked_at = new Date(); n++; }
            return { rows: [], rowCount: n };
        }
        throw new Error('fake pool: unhandled query — ' + q.slice(0, 120));
    },
};
const dbPath = require.resolve('../lib/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: fakePool } };

// ── Fake authority ───────────────────────────────────────────────────────
// It holds Ada's password. Nothing else here does, which is the point.
let ssoPasswords = { 'ada@example.com': 'authority-password', 'lock@example.com': 'x' };
let ssoProfiles = [];
let ssoPasswordSets = [];
let ssoProfileRefuses = false;

const realFetch = globalThis.fetch;
const reply = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

globalThis.fetch = async function (url, init) {
    const u = String(url);
    if (!u.startsWith('http://sso.test.invalid')) return realFetch(url, init);

    const p = u.slice('http://sso.test.invalid'.length);
    const body = init && init.body ? JSON.parse(init.body) : {};
    if (p === '/api/auth/service/token') return reply(200, { token: 'svc-token', expiresAt: new Date(Date.now() + 1800_000).toISOString() });
    if (init.headers.Authorization !== 'Bearer svc-token') return reply(401, { error: 'unauthorized' });

    if (p === '/api/auth/login') {
        if (ssoPasswords[body.email] && ssoPasswords[body.email] === body.password) {
            return reply(200, { user: { id: 'jid-ada', email: body.email } });
        }
        return reply(401, { error: 'invalid_credentials' });
    }
    if (p === '/api/auth/service/password') {
        ssoPasswordSets.push({ email: body.email, new_password: body.new_password });
        ssoPasswords[body.email] = body.new_password;
        return reply(200, { success: true });
    }
    if (p === '/api/auth/service/profile') {
        if (ssoProfileRefuses) return reply(503, { error: 'authority down' });
        ssoProfiles.push(body);
        return reply(200, { success: true });
    }
    return reply(404, { error: 'no such route' });
};

const account = require('../lib/account');
const { hashToken } = require('../lib/sessions');

// A request the way a route handler sees one: a Headers-like `get`.
const asRequest = (token) => ({ headers: { get: (k) => (k.toLowerCase() === 'authorization' ? `Bearer ${token}` : null) } });
const tokenFor = (u) => signJWT({ sub: u.id, email: u.email });

const liveSessions = (userId) => SESSIONS.filter((s) => s.user_id === userId && !s.revoked_at).length;

(async () => {
    console.log('\nThe gate: who is calling, and may they still act');
    {
        resetTables();
        const anon = await account.requireAccount({ headers: { get: () => null } });
        eq('no token is 401', anon.status, 401);

        const ghost = await account.requireAccount(asRequest(signJWT({ sub: 999, email: 'gone@example.com' })));
        eq('a token for a deleted row is 401', ghost.status, 401);

        // The token still verifies — it was signed before the lock and lives
        // fifteen minutes. Only the database knows the account is shut.
        const locked = await account.requireAccount(asRequest(tokenFor(findUser(3))));
        eq('a locked account is 403, not 401', locked.status, 403);
        ok('and is told why', /locked/i.test(locked.error || ''));

        const ada = await account.requireAccount(asRequest(tokenFor(findUser(1))));
        eq('a live account passes', ada.user.email, 'ada@example.com');
    }

    console.log('\nThe screen is told where the password lives');
    {
        resetTables();
        const ada = account.toSettingsAccount(project(findUser(1)));
        eq('a linked account says jubilee-id', ada.password_kind, 'jubilee-id');
        eq('and admits the link', ada.linked_to_jubilee_id, true);

        const vera = account.toSettingsAccount(project(findUser(2)));
        eq('an account with a local hash says local', vera.password_kind, 'local');
        eq('and is not linked', vera.linked_to_jubilee_id, false);

        // A row linked before jubilee_id was recorded: no hash here either, so
        // writing one would create a second credential for one identity.
        eq('no hash and no link still means the authority',
            account.usesJubileeId({ jubilee_id: null, has_local_password: false }), true);

        ok('and nothing sensitive is handed to the browser',
            !('password_hash' in ada) && !('password_salt' in ada));

        const counts = await account.libraryCounts(1);
        eq('the delete screen is told what it would take', counts.stations_favorited, 7);
    }

    console.log('\nChanging the name writes the copy that decides');
    {
        resetTables();
        ssoProfiles = [];
        const r = await account.changeName(1, { first_name: 'Ada', last_name: 'King' });
        eq('it succeeds', r.success, true);
        eq('the authority was told', ssoProfiles.length, 1);
        eq('with the new name', ssoProfiles[0].last_name, 'King');
        eq('and kj_users followed', findUser(1).name, 'Ada King');
        eq('the caller gets the new name back', r.user.name, 'Ada King');

        // THE BUG THIS GUARDS. linkLocalAccount refreshes the name from the
        // authority on every sign-in. A local write the authority refused would
        // look like it worked and be replaced by the old name at the next
        // sign-in — so the local write must not happen at all.
        ssoProfileRefuses = true;
        const refused = await account.changeName(1, { first_name: 'Augusta', last_name: 'Byron' });
        ssoProfileRefuses = false;
        eq('an authority that refuses fails the change', refused.success, false);
        eq('with a 503, not a 400', refused.status, 503);
        eq('and kj_users is left as it was', findUser(1).name, 'Ada King');

        // An account with no Jubilee ID has no authority to write to, and there
        // the local row IS the name.
        ssoProfiles = [];
        const local = await account.changeName(2, { first_name: 'Vera', last_name: 'Cooper' });
        eq('an unlinked account is renamed locally', local.success, true);
        eq('and the authority is not involved', ssoProfiles.length, 0);
        eq('the row is updated', findUser(2).name, 'Vera Cooper');

        const blank = await account.changeName(2, { first_name: '   ', last_name: 'Cooper' });
        eq('a blank first name is refused', blank.success, false);
        eq('nothing was written', findUser(2).first_name, 'Vera');
    }

    console.log('\nA password change takes the session as proof, not the old password');
    {
        resetTables();
        ssoPasswordSets = [];
        const signedOut = await account.changePassword(999, { newPassword: 'a-brand-new-one' });
        eq('no account, no change', signedOut.success, false);
        eq('with 401', signedOut.status, 401);
        eq('and nothing was set at the authority', ssoPasswordSets.length, 0);

        const short = await account.changePassword(2, { newPassword: 'short' });
        eq('a password under 8 characters is refused', short.status, 400);
        eq('and its hash is untouched', findUser(2).password_hash, hashPassword('old-password', veraSalt));

        const same = await account.changePassword(2, { newPassword: 'old-password' });
        eq('and so is the one already in use', same.status, 400);
        ok('with a message that says why', /different/i.test(same.error || ''));

        // The old password is not asked for, so it is not a way in either: a
        // caller that still sends one is simply changing the password.
        const stillWorks = await account.changePassword(2, {
            currentPassword: 'not-it', newPassword: 'a-brand-new-one',
        });
        eq('a stale currentPassword is ignored, not honoured as a gate', stillWorks.success, true);
    }

    console.log('\nAnd then writes it where the credential actually lives');
    {
        resetTables();
        ssoPasswordSets = [];
        ssoPasswords['ada@example.com'] = 'authority-password';

        const r = await account.changePassword(1, { newPassword: 'a-far-better-password' });
        eq('a Jubilee ID account succeeds', r.success, true);
        eq('the authority was given the new password', ssoPasswordSets.length, 1);
        eq('for the right address', ssoPasswordSets[0].email, 'ada@example.com');
        eq('and kj_users still holds no hash', findUser(1).password_hash, null);
        eq('the screen is told how far the change reaches', r.scope, 'jubilee-id');

        ssoPasswordSets = [];
        const local = await account.changePassword(2, { newPassword: 'a-far-better-password' });
        eq('a legacy account succeeds too', local.success, true);
        eq('the authority was NOT involved', ssoPasswordSets.length, 0);
        eq('and the local hash changed', findUser(2).password_hash,
            hashPassword('a-far-better-password', findUser(2).password_salt));
        eq('the screen is told it was local', local.scope, 'local');
    }

    console.log('\nChanging a password ends every other session, and not this one');
    {
        resetTables();
        const sessions = require('../lib/sessions');
        await sessions.createSession({ id: 2, email: 'vera@example.com' }, { rememberMe: true });
        await sessions.createSession({ id: 2, email: 'vera@example.com' }, { rememberMe: true });
        eq('two devices are signed in', liveSessions(2), 2);

        const r = await account.changePassword(2, { newPassword: 'a-far-better-password' });
        eq('the change succeeds', r.success, true);
        eq('exactly one session survives', liveSessions(2), 1);
        ok('and it is the new one, handed back to this browser',
            SESSIONS.find((s) => !s.revoked_at).refresh_hash === hashToken(r.refreshToken));
        ok('with an access token to use immediately', Boolean(r.token));
    }

    console.log('\nDeleting takes the membership, not the identity');
    {
        resetTables();
        const sessions = require('../lib/sessions');
        await sessions.createSession({ id: 1, email: 'ada@example.com' }, { rememberMe: true });
        ssoPasswords['ada@example.com'] = 'authority-password';
        ssoPasswordSets = [];

        const signedOut = await account.deleteAccount(999);
        eq('no account, no deletion', signedOut.status, 401);
        ok('and the real account is still there', Boolean(findUser(1)));

        const r = await account.deleteAccount(1);
        eq('a signed-in owner deletes it', r.success, true);
        eq('the row is gone', findUser(1), null);
        eq('and every session with it', liveSessions(1), 0);

        // The whole reason the screen says "your Jubilee ID is not deleted":
        // it must be true. Nothing was sent to the authority at all.
        eq('the Jubilee ID was left alone', ssoPasswords['ada@example.com'], 'authority-password');
        eq('and the caller is told so, to put on the screen', r.kept_jubilee_id, true);

        const again = await account.deleteAccount(1);
        eq('deleting twice is a 401, not a crash', again.status, 401);
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
})();
