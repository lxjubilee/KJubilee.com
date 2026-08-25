#!/usr/bin/env node
/**
 * Tests the password reset kJubilee owns.
 *
 *   node tests/password-reset.test.js
 *
 * Why kJubilee owns it at all: the Jubilee ID authority stores a reset code and
 * deliberately does NOT email it ("the requesting SITE owns the reset UX"), and
 * outside development it does not hand the code back either. A site that leaned
 * on the authority therefore sent nothing — a reset form that silently does
 * nothing, which is what JubileeInspire shipped once. So this flow issues its
 * own token, emails it, and finishes by setting the password AT the authority.
 *
 * Three properties are under test, because each one fails silently:
 *
 *   1. The form must not answer "does this address have an account?" — the
 *      response is identical either way, and only the mailbox differs.
 *   2. The token must never be readable from the table. Only its SHA-256 is
 *      stored, so a leaked backup resets nobody's password.
 *   3. The new password must land where the credential actually lives. A
 *      Jubilee ID account keeps none here, so a reset that only wrote kj_users
 *      would report success and change nothing.
 *
 * The pool and Mailgun are faked; lib/email.js and lib/password-reset.js run
 * for real, including the exact Mailgun request body.
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
process.env.MAILGUN_API_KEY = 'key-test';
process.env.MAILGUN_DOMAIN = 'kjubilee.com';
process.env.MAILGUN_API_BASE = 'http://mailgun.test.invalid';
process.env.EMAIL_FROM = 'kJubilee <noreply@kjubilee.com>';
process.env.PUBLIC_SITE_URL = 'https://kjubilee.com';
process.env.SSO_BASE = 'http://sso.test.invalid';
process.env.SSO_CLIENT_ID = 'kjubilee';
process.env.SSO_CLIENT_SECRET = 'test-secret';
process.env.PASSWORD_RESET_MAX_LIVE = '3';

// ── Fake table ───────────────────────────────────────────────────────────
const { hashPassword, createSalt } = require('../lib/auth');
const veraSalt = createSalt();

const USERS = [
    // A Jubilee ID account: no password here at all.
    { id: 1, email: 'ada@example.com', first_name: 'Ada', last_name: 'Lovelace', name: 'Ada Lovelace',
      role: 'user', jubilee_id: 'jid-ada', is_active: true, is_locked: false, email_verified: true,
      date_of_birth: null, password_hash: null, password_salt: null },
    // An account that predates the door: its hash is in kj_users.
    { id: 2, email: 'vera@example.com', first_name: 'Vera', last_name: 'Rubin', name: 'Vera Rubin',
      role: 'user', jubilee_id: null, is_active: true, is_locked: false, email_verified: true,
      date_of_birth: null, password_hash: hashPassword('old-password', veraSalt), password_salt: veraSalt },
    // Locked: may not reset, and may not be told so.
    { id: 3, email: 'lock@example.com', first_name: 'L', last_name: 'K', name: 'L K',
      role: 'user', jubilee_id: 'jid-lock', is_active: true, is_locked: true, email_verified: true,
      date_of_birth: null, password_hash: null, password_salt: null },
];
const findUser = (e) => USERS.find((u) => u.email === e) || null;

// What the authority knows, independent of kj_users. 'identity-only' is the
// case the first version of this flow got wrong: a Jubilee ID, no account here.
const SSO_IDENTITIES = {
    'ada@example.com': true,
    'vera@example.com': false,
    'lock@example.com': true,
    'identity-only@example.com': true,
};
const project = (u) => u && ({
    id: u.id, email: u.email, first_name: u.first_name, last_name: u.last_name, name: u.name,
    role: u.role, jubilee_id: u.jubilee_id, is_active: u.is_active, is_locked: u.is_locked,
    email_verified: u.email_verified, date_of_birth: u.date_of_birth,
    has_local_password: u.password_hash != null,
});

let RESETS = [];
let resetId = 1;

const fakePool = {
    async query(sql, args = []) {
        const q = String(sql).replace(/\s+/g, ' ').trim();
        const now = Date.now();

        if (/^SELECT id, email, first_name/i.test(q) && /FROM kj_users WHERE email/i.test(q)) {
            const u = project(findUser(args[0]));
            return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
        }
        if (/^SELECT COUNT\(\*\)::int AS live FROM kj_password_resets/i.test(q)) {
            const live = RESETS.filter((r) => r.email === args[0] && !r.used_at && r.expires_at > now).length;
            return { rows: [{ live }], rowCount: 1 };
        }
        if (/^INSERT INTO kj_password_resets/i.test(q)) {
            RESETS.push({
                id: resetId++, email: args[0], token_hash: args[1],
                expires_at: now + parseInt(args[2], 10) * 60_000,
                used_at: null, requested_ip: args[3],
            });
            return { rows: [], rowCount: 1 };
        }
        if (/^SELECT email FROM kj_password_resets/i.test(q)) {
            const r = RESETS.find((x) => x.token_hash === args[0] && !x.used_at && x.expires_at > now);
            return { rows: r ? [{ email: r.email }] : [], rowCount: r ? 1 : 0 };
        }
        if (/^UPDATE kj_password_resets SET used_at = NOW\(\) WHERE token_hash/i.test(q)) {
            const r = RESETS.find((x) => x.token_hash === args[0]);
            if (r) r.used_at = now;
            return { rows: [], rowCount: r ? 1 : 0 };
        }
        if (/^UPDATE kj_password_resets SET used_at = NOW\(\) WHERE email/i.test(q)) {
            let n = 0;
            for (const r of RESETS) if (r.email === args[0] && !r.used_at) { r.used_at = now; n++; }
            return { rows: [], rowCount: n };
        }
        if (/^UPDATE kj_users SET password_hash/i.test(q)) {
            const u = findUser(args[0]);
            if (u) { u.password_hash = args[1]; u.password_salt = args[2]; }
            return { rows: [], rowCount: u ? 1 : 0 };
        }
        throw new Error('fake pool: unhandled query — ' + q.slice(0, 120));
    },
};
const dbPath = require.resolve('../lib/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: fakePool } };

// ── Fake Mailgun + fake authority ────────────────────────────────────────
const SENT = [];
let ssoPasswordSets = [];
const realFetch = globalThis.fetch;
const reply = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

globalThis.fetch = async function (url, init) {
    const u = String(url);

    if (u.startsWith('http://mailgun.test.invalid')) {
        const auth = init.headers.Authorization || '';
        const decoded = Buffer.from(auth.replace('Basic ', ''), 'base64').toString();
        const form = new URLSearchParams(init.body);
        SENT.push({ url: u, auth: decoded, fields: Object.fromEntries(form) });
        return reply(200, { id: '<20260825.' + SENT.length + '@kjubilee.com>', message: 'Queued' });
    }

    if (u.startsWith('http://sso.test.invalid')) {
        const p = u.slice('http://sso.test.invalid'.length);
        const body = init && init.body ? JSON.parse(init.body) : {};
        if (p === '/api/auth/service/token') return reply(200, { token: 'svc-token', expiresAt: new Date(Date.now() + 1800_000).toISOString() });
        if (init.headers.Authorization !== 'Bearer svc-token') return reply(401, { error: 'unauthorized' });
        if (p === '/api/auth/lookup') {
            return reply(200, { exists: SSO_IDENTITIES[body.email] === true });
        }
        if (p === '/api/auth/service/password') {
            ssoPasswordSets.push({ email: body.email, new_password: body.new_password });
            return reply(200, { success: true });
        }
        return reply(404, { error: 'no such route' });
    }
    return realFetch(url, init);
};

const { requestReset, peekToken, completeReset, hashToken } = require('../lib/password-reset');

// Pull the token out of the message the way a person would — by reading it.
function tokenFromLastEmail() {
    const m = SENT[SENT.length - 1].fields.text.match(/reset-password\?token=([A-Za-z0-9_-]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

(async () => {
    console.log('\nAsking for a link tells nobody whether the account exists');
    {
        const known = await requestReset('ada@example.com', '10.0.0.1');
        const unknown = await requestReset('nobody@example.com', '10.0.0.1');
        eq('a real address succeeds', known.success, true);
        eq('an unknown address succeeds identically', unknown.success, true);
        ok('and the response carries nothing else to compare',
            JSON.stringify({ success: unknown.success }) === JSON.stringify({ success: known.success }));
        eq('only the real one produced an email', SENT.length, 1);

        const locked = await requestReset('lock@example.com', '10.0.0.1');
        eq('a locked account also succeeds outwardly', locked.success, true);
        eq('but is sent nothing', SENT.length, 1);
    }

    console.log('\nThe message itself');
    {
        const m = SENT[0];
        eq('goes to the right person', m.fields.to, 'ada@example.com');
        eq('is sent as the Mailgun API user', m.auth, 'api:key-test');
        eq('through the kjubilee.com sending domain', m.url, 'http://mailgun.test.invalid/v3/kjubilee.com/messages');
        // DMARC on kjubilee.com is p=reject: an unaligned From is not delivered.
        ok('is FROM kjubilee.com, which p=reject requires', /@kjubilee\.com>?$/.test(m.fields.from), m.fields.from);
        eq('click tracking is off',  m.fields['o:tracking-clicks'], 'no');
        eq('open tracking is off',   m.fields['o:tracking-opens'], 'no');
        eq('tracking is off',        m.fields['o:tracking'], 'no');
        // Test mode is OFF unless a box asks for it — a staging flag that leaked
        // into production would silently deliver every reset email to nobody.
        ok('test mode is not on by default', m.fields['o:testmode'] === undefined);
        ok('carries a plain-text part', Boolean(m.fields.text));
        ok('carries an HTML part',      Boolean(m.fields.html));
        ok('the link is absolute and on the public origin',
            m.fields.text.includes('https://kjubilee.com/reset-password?token='));
    }

    console.log('\nThe token is never stored');
    {
        const token = tokenFromLastEmail();
        ok('a token was emailed', Boolean(token));
        ok('it is long enough not to be guessed', token.length >= 40, `length ${token.length}`);
        ok('the table holds no row containing it',
            !RESETS.some((r) => JSON.stringify(r).includes(token)));
        eq('what is stored is its SHA-256', RESETS[0].token_hash, hashToken(token));

        const peek = await peekToken(token);
        eq('the link checks out before the form is drawn', peek.valid, true);
        eq('and names the account it belongs to', peek.email, 'ada@example.com');
        eq('a token that was never issued does not', (await peekToken('made-up')).valid, false);
    }

    console.log('\nA Jubilee ID password is changed AT the authority');
    {
        const token = tokenFromLastEmail();
        const short = await completeReset(token, 'short');
        eq('a password under 8 characters is refused', short.success, false);
        eq('and the link is still usable', (await peekToken(token)).valid, true);

        const r = await completeReset(token, 'a-brand-new-password');
        eq('the reset succeeds', r.success, true);
        eq('the authority was told', ssoPasswordSets.length, 1);
        eq('for the right identity', ssoPasswordSets[0].email, 'ada@example.com');
        eq('with the new password', ssoPasswordSets[0].new_password, 'a-brand-new-password');
        ok('and nothing was written to kj_users, which holds no password for it',
            findUser('ada@example.com').password_hash === null);

        eq('the link is spent', (await peekToken(token)).valid, false);
        eq('using it again fails', (await completeReset(token, 'another-password')).success, false);
    }

    console.log('\nAn account predating the door is changed here');
    {
        SENT.length = 0;
        await requestReset('vera@example.com', '10.0.0.2');
        const token = tokenFromLastEmail();
        const before = findUser('vera@example.com').password_hash;
        const r = await completeReset(token, 'vera-new-password');
        eq('the reset succeeds', r.success, true);
        const after = findUser('vera@example.com');
        ok('the local hash changed', after.password_hash !== before);
        ok('and it verifies against the new password',
            hashPassword('vera-new-password', after.password_salt) === after.password_hash);
        eq('the authority was NOT called for a local-only account', ssoPasswordSets.length, 1);
    }

    console.log('\nA Jubilee ID with no kJubilee account can still reset');
    {
        // "Forgot your password?" sits on the Confirm it's you screen, which is
        // ONLY ever shown to someone who has a Jubilee ID and no account here.
        // The first version returned early on "no local account" and sent them
        // nothing at all — the one person the link exists for.
        SENT.length = 0; RESETS = []; resetId = 1; ssoPasswordSets = [];
        const r = await requestReset('identity-only@example.com', '10.0.0.9');
        eq('the request succeeds', r.success, true);
        eq('and an email really is sent', SENT.length, 1);
        eq('to the right person', SENT[0].fields.to, 'identity-only@example.com');

        const token = tokenFromLastEmail();
        eq('the link is live', (await peekToken(token)).valid, true);

        const done = await completeReset(token, 'a-fresh-password');
        eq('the reset completes', done.success, true);
        eq('the authority was told', ssoPasswordSets.length, 1);
        eq('for the right identity', ssoPasswordSets[0].email, 'identity-only@example.com');
        ok('and no kJubilee account was invented out of a password reset',
            findUser('identity-only@example.com') === null);
    }

    console.log('\nAn address nobody has heard of still gets nothing');
    {
        SENT.length = 0; RESETS = []; resetId = 1;
        const r = await requestReset('stranger@example.com', '10.0.0.9');
        eq('the response is the same success', r.success, true);
        eq('but nothing is sent', SENT.length, 0);
        eq('and no token is stored', RESETS.length, 0);
    }

    console.log('\nThe template is the family shell in kJubilee colours');
    {
        const m = require('../lib/email').passwordResetEmail({
            to: 'jai@example.com',
            resetUrl: 'https://kjubilee.com/reset-password?token=ABC',
            minutes: 60, firstName: 'Jai',
        });
        // The shell is JubileeInspire's, because family mail should look like
        // one family. Mail clients are not browsers: Outlook renders through
        // Word, so the table layout and the VML button are what make this
        // arrive intact rather than as a stack of unstyled text.
        ok('XHTML transitional doctype', m.html.includes('XHTML 1.0 Transitional'));
        ok('VML button, for Outlook', m.html.includes('v:roundrect'));
        ok('600px card on a table layout', m.html.includes('width:600px'));
        // ...and the colours are ours.
        ok('kJubilee blue card border', m.html.includes('3px solid #3DA5FF'));
        ok('no JubileeInspire gold survived the port', !/#ffbd59|#ffcc00|#f0ad4e/.test(m.html));
        ok('the wordmark is kJubilee, not JubileeInspire', !m.html.includes('>Inspire</span>'));
        ok('the logo is an absolute URL a mail client can fetch',
            m.html.includes('https://kjubilee.com/images/members/'));
        // A text part is not optional: it is what text-only clients show and
        // what a filter reads when it distrusts the HTML.
        ok('plain text carries the link', m.text.includes('https://kjubilee.com/reset-password'));
        ok('greeting uses the name when we have one', m.text.startsWith('Hi Jai,'));
        const anon = require('../lib/email').passwordResetEmail({
            to: 'x@y.z', resetUrl: 'https://kjubilee.com/r?token=T', minutes: 60,
        });
        ok('and falls back when we do not', anon.text.startsWith('Hi there,'));
    }

    console.log('\nFinishing a reset retires every other outstanding link');
    {
        SENT.length = 0; RESETS = []; resetId = 1;
        await requestReset('ada@example.com', '10.0.0.3');
        const first = tokenFromLastEmail();
        await requestReset('ada@example.com', '10.0.0.3');
        const second = tokenFromLastEmail();
        ok('two different links were issued', first !== second);

        eq('finishing with the second works', (await completeReset(second, 'yet-another-password')).success, true);
        eq('the first is dead too', (await peekToken(first)).valid, false);
    }

    console.log('\nOne address cannot hold unlimited live links');
    {
        SENT.length = 0; RESETS = []; resetId = 1;
        for (let i = 0; i < 5; i++) await requestReset('ada@example.com', '10.0.0.4');
        eq('issuing stops at the cap', SENT.length, 3);
        ok('and the caller cannot tell it stopped',
            (await requestReset('ada@example.com', '10.0.0.4')).success === true);
    }

    console.log('\nA send that fails does not leave a live link behind');
    {
        SENT.length = 0; RESETS = []; resetId = 1;
        const saved = globalThis.fetch;
        globalThis.fetch = async (url, init) =>
            String(url).startsWith('http://mailgun.test.invalid')
                ? reply(401, { message: 'Forbidden' })
                : saved(url, init);

        const r = await requestReset('ada@example.com', '10.0.0.5');
        eq('the caller is told, because this is OUR failure', r.success, false);
        eq('a row was written', RESETS.length, 1);
        ok('but the token was burned rather than left usable', RESETS[0].used_at !== null);
        globalThis.fetch = saved;
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
