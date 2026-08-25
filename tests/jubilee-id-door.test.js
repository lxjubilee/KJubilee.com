#!/usr/bin/env node
/**
 * Tests the Jubilee ID door — the three outcomes behind /login, /signin and
 * /signup.
 *
 *   node tests/jubilee-id-door.test.js
 *
 * What is under test is the ROUTING, because that is the whole design and the
 * only part that can silently do the wrong thing. An email arrives and exactly
 * one of three things must happen:
 *
 *   A  known here          → password → signed in, and NOTHING is created
 *   B  Jubilee ID, new here → password → a VISIBLE Create Account step, and
 *                             still nothing created until that step is
 *                             submitted. A door that quietly linked the
 *                             account on the password screen would look
 *                             identical to a listener and would break the
 *                             promise the app stores are shown.
 *   C  unknown everywhere  → the Jubilee ID and the local account are created
 *                             together, in one motion
 *
 * The Postgres pool and the Jubilee ID authority are both faked, so the SQL is
 * not what is being checked — the decisions are. The fake authority is a real
 * HTTP-shaped double behind global.fetch, so lib/sso.js runs for real,
 * including the service-token mint.
 *
 * Runs twice, in child processes: once with authority credentials configured,
 * and once WITHOUT, which is the fallback that keeps a dev box and every
 * account created before the door signing in.
 */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const MODE = process.env.DOOR_TEST_MODE || '';
const PORT = parseInt(process.env.DOOR_TEST_PORT || '3987', 10);
const BASE = `http://127.0.0.1:${PORT}`;

// ── Runner ────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? '  — ' + detail : '')); }
}
function eq(name, actual, expected) {
    ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── The pure bits, checked in-process before any server starts ───────────
// doorParams decides where someone lands after signing in, from a value that
// arrives in the URL. That makes it the one piece of the door an attacker can
// address directly, so it is checked on its own rather than through a screen.
function doorParamsSuite() {
    const src = require('fs')
        .readFileSync(path.join(__dirname, '..', 'lib', 'door-params.js'), 'utf8')
        .replace('export function', 'function') + '\nmodule.exports = { doorParams };';
    const mod = { exports: {} };
    new Function('module', 'exports', src)(mod, mod.exports);
    const { doorParams } = mod.exports;

    console.log('\nWhere the door sends you afterwards');
    eq('a plain path is kept',                doorParams({ redirect: '/player' }).returnUrl, '/player');
    eq('?next= is honoured too',              doorParams({ next: '/music' }).returnUrl, '/music');
    eq('?returnTo= is honoured too',          doorParams({ returnTo: '/stations' }).returnUrl, '/stations');
    eq('nothing given means the home page',   doorParams({}).returnUrl, '/');
    eq('a protocol-relative URL cannot leave the site', doorParams({ redirect: '//evil.example' }).returnUrl, '/');
    eq('an absolute URL cannot leave either', doorParams({ redirect: 'https://evil.example' }).returnUrl, '/');
    eq('a javascript: URL is refused',        doorParams({ redirect: 'javascript:alert(1)' }).returnUrl, '/');
    eq('a repeated param takes the first',    doorParams({ redirect: ['/dial', '/x'] }).returnUrl, '/dial');
    eq('the carried email is trimmed',        doorParams({ email: '  Jane@Example.com ' }).initialEmail, 'Jane@Example.com');
}

// ── Parent: run the pure checks, then both server modes as children ──────
if (!MODE) {
    doorParamsSuite();
    console.log(`\n${pass} passed, ${fail} failed`);
    let failed = fail ? 1 : 0;
    for (const [mode, port] of [['sso', 3987], ['nosso', 3988]]) {
        console.log(`\n─── mode: ${mode} ───`);
        const r = spawnSync(process.execPath, [__filename], {
            stdio: 'inherit',
            env: { ...process.env, DOOR_TEST_MODE: mode, DOOR_TEST_PORT: String(port) },
        });
        if (r.status !== 0) failed++;
    }
    process.exit(failed ? 1 : 0);
}

// ── Fixtures ─────────────────────────────────────────────────────────────
// The authority's identities, and this site's own rows. They deliberately
// disagree: mira has a Jubilee ID but no account here (Outcome B), and vera is
// an account from before the door with no Jubilee ID at all.
const SSO_IDENTITIES = {
    'ada@example.com':  { id: 'jid-ada',  first_name: 'Ada',  last_name: 'Lovelace', date_of_birth: '1815-12-10', password: 'correct-horse' },
    'mira@example.com': { id: 'jid-mira', first_name: 'Mira', last_name: 'Bell',     date_of_birth: '1990-04-02', password: 'let-me-in-1234' },
};

const { hashPassword, createSalt } = require('../lib/auth');
const veraSalt = createSalt();

let nextId = 100;
const USERS = [
    // Outcome A — has a Jubilee ID and already listens here.
    { id: 1, email: 'ada@example.com', first_name: 'Ada', last_name: 'Lovelace', name: 'Ada Lovelace',
      role: 'user', jubilee_id: 'jid-ada', is_active: true, is_locked: false, email_verified: true,
      date_of_birth: null, password_hash: null, password_salt: null },
    // A local account that predates the door: a password here, no Jubilee ID.
    { id: 2, email: 'vera@example.com', first_name: 'Vera', last_name: 'Rubin', name: 'Vera Rubin',
      role: 'user', jubilee_id: null, is_active: true, is_locked: false, email_verified: true,
      date_of_birth: null, password_hash: hashPassword('old-password', veraSalt), password_salt: veraSalt },
];

const findUser = (email) => USERS.find((u) => u.email === email) || null;

// The columns lib/local-account.js selects, including the derived flag.
function project(u) {
    if (!u) return undefined;
    return {
        id: u.id, email: u.email, first_name: u.first_name, last_name: u.last_name, name: u.name,
        role: u.role, jubilee_id: u.jubilee_id, is_active: u.is_active, is_locked: u.is_locked,
        email_verified: u.email_verified, date_of_birth: u.date_of_birth,
        has_local_password: u.password_hash != null,
    };
}

// ── Fake Postgres ────────────────────────────────────────────────────────
// Matches on the distinctive part of each statement the door issues. It is a
// double for the decisions, not an SQL engine.
const fakePool = {
    async query(sql, args = []) {
        const q = String(sql).replace(/\s+/g, ' ').trim();

        if (/^SELECT 1/i.test(q)) return { rows: [{ '?column?': 1 }], rowCount: 1 };

        if (/^SELECT password_hash, password_salt FROM kj_users WHERE email/i.test(q)) {
            const u = findUser(args[0]);
            return { rows: u ? [{ password_hash: u.password_hash, password_salt: u.password_salt }] : [], rowCount: u ? 1 : 0 };
        }
        if (/^SELECT id, email, first_name/i.test(q) && /FROM kj_users WHERE email/i.test(q)) {
            const u = project(findUser(args[0]));
            return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
        }
        if (/^UPDATE kj_users SET last_login_at/i.test(q)) return { rows: [], rowCount: 1 };

        if (/^UPDATE kj_users SET jubilee_id/i.test(q)) {
            const u = findUser(args[0]);
            if (u && u.jubilee_id == null) u.jubilee_id = args[1];
            return { rows: [], rowCount: u ? 1 : 0 };
        }
        // linkLocalAccount, existing row (has RETURNING)
        if (/^UPDATE kj_users SET first_name/i.test(q) && /RETURNING/i.test(q)) {
            const u = findUser(args[0]);
            if (!u) return { rows: [], rowCount: 0 };
            if (args[1] != null) u.first_name = args[1];
            if (args[2] != null) u.last_name = args[2];
            u.name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name;
            if (args[3] != null) u.date_of_birth = args[3];
            if (u.jubilee_id == null && args[4] != null) u.jubilee_id = args[4];
            return { rows: [project(u)], rowCount: 1 };
        }
        // updateLocalAccount (no RETURNING)
        if (/^UPDATE kj_users SET first_name/i.test(q)) {
            const u = findUser(args[0]);
            if (!u) return { rows: [], rowCount: 0 };
            if (args[1] != null) u.first_name = args[1];
            if (args[2] != null) u.last_name = args[2];
            u.name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name;
            return { rows: [], rowCount: 1 };
        }
        // linkLocalAccount insert (passwordless) — the Jubilee ID path
        if (/^INSERT INTO kj_users \(email, first_name/i.test(q)) {
            if (findUser(args[0])) { const e = new Error('duplicate'); e.code = '23505'; throw e; }
            const u = {
                id: nextId++, email: args[0], first_name: args[1], last_name: args[2],
                name: [args[1], args[2]].filter(Boolean).join(' ') || null,
                date_of_birth: args[3], jubilee_id: args[4], email_verified: args[5],
                role: 'user', is_active: true, is_locked: false, password_hash: null, password_salt: null,
            };
            USERS.push(u);
            return { rows: [project(u)], rowCount: 1 };
        }
        // The no-authority register: a local password instead of a Jubilee ID
        if (/^INSERT INTO kj_users \(email, password_hash/i.test(q)) {
            if (findUser(args[0])) { const e = new Error('duplicate'); e.code = '23505'; throw e; }
            const u = {
                id: nextId++, email: args[0], password_hash: args[1], password_salt: args[2],
                first_name: args[3], last_name: args[4],
                name: [args[3], args[4]].filter(Boolean).join(' ') || null,
                date_of_birth: args[5], jubilee_id: null, email_verified: false,
                role: 'user', is_active: true, is_locked: false,
            };
            USERS.push(u);
            return { rows: [project(u)], rowCount: 1 };
        }
        throw new Error('fake pool: unhandled query — ' + q.slice(0, 120));
    },
};

// ── Fake Jubilee ID authority ────────────────────────────────────────────
const SSO_BASE = 'http://sso.test.invalid';
let mintedTokens = 0;

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const realFetch = globalThis.fetch;
globalThis.fetch = async function (url, init) {
    const u = String(url);
    if (!u.startsWith(SSO_BASE)) return realFetch(url, init);
    const p = u.slice(SSO_BASE.length);
    const body = init && init.body ? JSON.parse(init.body) : {};

    if (p === '/api/auth/service/token') {
        mintedTokens++;
        return jsonResponse(200, { token: 'svc-token', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() });
    }
    // Everything else must carry the service bearer.
    if (!init || !init.headers || init.headers.Authorization !== 'Bearer svc-token') {
        return jsonResponse(401, { error: 'unauthorized' });
    }

    const identity = SSO_IDENTITIES[body.email];

    if (p === '/api/auth/lookup') return jsonResponse(200, { exists: Boolean(identity) });

    if (p === '/api/auth/login') {
        if (!identity) return jsonResponse(404, { error: 'not found' });
        if (identity.password !== body.password) return jsonResponse(401, { error: 'Invalid email or password' });
        return jsonResponse(200, { user: { ...identity, email: body.email, password: undefined } });
    }
    if (p === '/api/auth/register') {
        if (identity) return jsonResponse(409, { error: 'exists' });
        SSO_IDENTITIES[body.email] = {
            id: 'jid-' + body.email.split('@')[0], first_name: body.first_name, last_name: body.last_name,
            date_of_birth: body.date_of_birth, password: body.password,
        };
        return jsonResponse(201, { user: { ...SSO_IDENTITIES[body.email], email: body.email, password: undefined } });
    }
    if (p === '/api/auth/service/profile') {
        if (!identity) return jsonResponse(404, { error: 'not found' });
        Object.assign(identity, body, { email: undefined });
        return jsonResponse(200, { success: true, user: { ...identity, email: body.email } });
    }
    return jsonResponse(404, { error: 'no such SSO route' });
};

// ── Boot the real server against the doubles ─────────────────────────────
process.env.NODE_ENV = 'test';
process.env.PORT = String(PORT);
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-for-the-guard';
process.env.SSO_BASE = SSO_BASE;
process.env.SSO_CLIENT_ID = 'kjubilee';
process.env.SSO_CLIENT_SECRET = MODE === 'sso' ? 'test-secret' : '';
// The door's own limiter must not trip mid-suite.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
// Human verification is exercised in tests/turnstile.test.js. What is under
// test here is the routing, and a real secret in .env would turn every
// lookup below into a 403 for want of a browser to solve a challenge.
process.env.TURNSTILE_ENFORCE = 'false';
process.env.RATE_LIMIT_MAX = '1000';

const dbPath = require.resolve('../lib/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: fakePool } };

require('../server.js');

// ── Helpers ──────────────────────────────────────────────────────────────
async function post(p, body) {
    const res = await realFetch(BASE + p, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    return { status: res.status, data };
}

const isJwt = (t) => typeof t === 'string' && t.split('.').length === 3;

// ── Suites ───────────────────────────────────────────────────────────────
async function ssoSuite() {
    console.log('\nScreen 1 — the lookup routes the email');
    {
        const a = await post('/api/sso/signup/lookup', { email: 'ada@example.com' });
        eq('A: known here → existsLocally', a.data.existsLocally, true);

        const b = await post('/api/sso/signup/lookup', { email: 'mira@example.com' });
        eq('B: Jubilee ID, new here → not local', b.data.existsLocally, false);
        eq('B: Jubilee ID, new here → in SSO', b.data.existsInSso, true);

        const c = await post('/api/sso/signup/lookup', { email: 'nova@example.com' });
        eq('C: unknown → not local', c.data.existsLocally, false);
        eq('C: unknown → not in SSO', c.data.existsInSso, false);

        const bad = await post('/api/sso/signup/lookup', { email: 'not-an-email' });
        eq('a malformed address is refused', bad.status, 400);
        eq('the case of an address does not matter', (await post('/api/sso/signup/lookup', { email: 'ADA@Example.com ' })).data.existsLocally, true);
    }

    console.log('\nOutcome A — returning listener');
    {
        const wrong = await post('/api/sso/login', { email: 'ada@example.com', password: 'nope' });
        eq('a wrong password is 401', wrong.status, 401);
        ok('a wrong password does not leak which half was wrong', wrong.data.error === 'Invalid email or password', wrong.data.error);

        const r = await post('/api/sso/login', { email: 'ada@example.com', password: 'correct-horse' });
        eq('the right password signs in', r.data.success, true);
        ok('a session token comes back', isJwt(r.data.token), r.data.token);
        eq('the user is the local account', r.data.user.email, 'ada@example.com');
        ok('no password field is ever echoed back', !('password' in (r.data.user || {})));
    }

    console.log('\nOutcome B — has a Jubilee ID, new to kJubilee');
    {
        const before = USERS.length;

        const bad = await post('/api/sso/login', { email: 'mira@example.com', password: 'wrong' });
        eq('the confirm screen rejects a wrong Jubilee ID password', bad.status, 401);
        eq('… and creates nothing', USERS.length, before);

        const confirm = await post('/api/sso/login', { email: 'mira@example.com', password: 'let-me-in-1234' });
        eq('confirming routes to the Create Account screen', confirm.data.redirect, 'signup-existing');
        ok('… with no session yet — the account does not exist', !confirm.data.token);
        eq('… and STILL creates nothing', USERS.length, before);
        eq('the screen is pre-filled from the Jubilee ID (first)', confirm.data.first_name, 'Mira');
        eq('the screen is pre-filled from the Jubilee ID (last)', confirm.data.last_name, 'Bell');
        eq('the screen is pre-filled from the Jubilee ID (dob)', confirm.data.date_of_birth, '1990-04-02');

        // The visible Create Account step, with an edited surname.
        const created = await post('/api/sso/signup/verify', {
            email: 'mira@example.com', password: 'let-me-in-1234',
            first_name: 'Mira', last_name: 'Bellweather', date_of_birth: '1990-04-02',
        });
        eq('Create Account creates the account', created.data.success, true);
        eq('… exactly one row appears', USERS.length, before + 1);
        ok('… and signs them in', isJwt(created.data.token));
        eq('… linked to the Jubilee ID', findUser('mira@example.com').jubilee_id, 'jid-mira');
        eq('an edit made on the screen is honoured locally', created.data.user.last_name, 'Bellweather');
        eq('… and pushed back to the Jubilee ID', SSO_IDENTITIES['mira@example.com'].last_name, 'Bellweather');
        ok('a Jubilee ID account holds no password here', findUser('mira@example.com').password_hash === null);
        eq('the address counts as verified — the Jubilee ID proved it', findUser('mira@example.com').email_verified, true);

        const forged = await post('/api/sso/signup/verify', { email: 'nova@example.com', password: 'guess' });
        ok('Create Account cannot be reached without the password', forged.status === 401 || forged.status === 503);
    }

    console.log('\nOutcome C — brand new to everything');
    {
        const short = await post('/api/sso/signup/register', {
            first_name: 'Nova', last_name: 'Reed', email: 'nova@example.com', date_of_birth: '1998-06-15', password: 'short',
        });
        eq('a password under 8 characters is refused', short.status, 400);

        const young = await post('/api/sso/signup/register', {
            first_name: 'Nova', last_name: 'Reed', email: 'nova@example.com',
            date_of_birth: new Date().toISOString().slice(0, 10), password: 'a-good-password',
        });
        eq('an under-13 date of birth is refused', young.status, 400);

        const r = await post('/api/sso/signup/register', {
            first_name: 'Nova', last_name: 'Reed', email: 'nova@example.com',
            date_of_birth: '1998-06-15', password: 'a-good-password',
        });
        eq('the Jubilee ID and the account are created together', r.data.success, true);
        ok('… and the listener is signed straight in', isJwt(r.data.token));
        ok('the Jubilee ID now exists at the authority', Boolean(SSO_IDENTITIES['nova@example.com']));
        eq('… and the local row points at it', findUser('nova@example.com').jubilee_id, 'jid-nova');
        eq('nothing proved the address, so it is unverified', findUser('nova@example.com').email_verified, false);

        const again = await post('/api/sso/signup/register', {
            first_name: 'Nova', last_name: 'Reed', email: 'nova@example.com',
            date_of_birth: '1998-06-15', password: 'a-good-password',
        });
        eq('signing up twice is a conflict, not a second account', again.status, 409);

        // And the new Jubilee ID works as a credential immediately.
        const signIn = await post('/api/sso/login', { email: 'nova@example.com', password: 'a-good-password' });
        eq('the new Jubilee ID signs in on the next visit', signIn.data.success, true);
    }

    console.log('\nAccounts that predate the door');
    {
        const r = await post('/api/sso/login', { email: 'vera@example.com', password: 'old-password' });
        eq('a local password still signs in when there is no Jubilee ID', r.data.success, true);
        const w = await post('/api/sso/login', { email: 'vera@example.com', password: 'guess' });
        eq('… and a wrong one still does not', w.status, 401);

        const look = await post('/api/sso/signup/lookup', { email: 'vera@example.com' });
        eq('… and Screen 1 sends them to the password screen', look.data.existsLocally, true);
    }

    console.log('\nThe service token is minted once, not per request');
    eq('service tokens minted', mintedTokens, 1);
}

async function noSsoSuite() {
    console.log('\nWith no authority credentials, the site still works on its own');
    {
        const look = await post('/api/sso/signup/lookup', { email: 'vera@example.com' });
        eq('a local account routes to the password screen', look.data.existsLocally, true);

        const r = await post('/api/sso/login', { email: 'vera@example.com', password: 'old-password' });
        eq('and signs in on its local password', r.data.success, true);

        const w = await post('/api/sso/login', { email: 'vera@example.com', password: 'guess' });
        eq('a wrong password is still refused', w.status, 401);

        const fresh = await post('/api/sso/signup/lookup', { email: 'zed@example.com' });
        eq('an unknown email goes to the create screen', fresh.data.existsInSso, false);
        eq('… and says so plainly', fresh.data.ssoConfigured, false);

        const made = await post('/api/sso/signup/register', {
            first_name: 'Zed', last_name: 'Okafor', email: 'zed@example.com',
            date_of_birth: '1988-01-09', password: 'a-good-password',
        });
        eq('a local-only account is created', made.data.success, true);
        ok('… with a local password, since there is no authority to hold one', findUser('zed@example.com').password_hash != null);

        const back = await post('/api/sso/login', { email: 'zed@example.com', password: 'a-good-password' });
        eq('… and it signs in', back.data.success, true);

        ok('the authority was never called', mintedTokens === 0);
    }
}

// ── Go ───────────────────────────────────────────────────────────────────
(async () => {
    // Give the listener a moment to bind.
    await new Promise((r) => setTimeout(r, 400));
    try {
        if (MODE === 'sso') await ssoSuite();
        else await noSsoSuite();
    } catch (e) {
        fail++;
        console.error('  FAIL suite threw —', e && e.stack ? e.stack : e);
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
