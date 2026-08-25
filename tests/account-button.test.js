#!/usr/bin/env node
/**
 * Tests the header's idea of who is signed in.
 *
 *   node tests/account-button.test.js
 *
 * The header used to be a hardcoded "Sign In" anchor: it said Sign In whether
 * or not you already were. What replaced it reads the session the door wrote,
 * and the two things it must not get wrong are:
 *
 *   1. An EXPIRED token is not a session. Showing a name for one greets
 *      somebody whose very next API call returns 401 — the worst version,
 *      because the page looks signed in and behaves signed out.
 *
 *   2. There must always be something to show. The door stores whatever the
 *      account has, and an account created before the door has no first_name
 *      at all; falling through to nothing would render an empty button.
 *
 * The DOM is not involved — readSession and shortName are pure, and they are
 * where the decisions live.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (d ? '  — ' + d : '')); } };
const eq = (n, a, b) => ok(n, a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

// The component is a client module; lift the two pure helpers out of it so the
// test exercises the shipped source rather than a copy that can drift from it.
const src = fs.readFileSync(path.join(__dirname, '..', 'app', '_account-button.js'), 'utf8');
const helpers = src.slice(src.indexOf('function readSession'), src.indexOf('export default'));
const store = {};
const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    removeItem: (k) => { delete store[k]; },
};
const mod = { exports: {} };
new Function('module', 'localStorage', helpers + '\nmodule.exports = { readSession, clearSession, shortName };')(mod, localStorage);
const { readSession, clearSession, shortName } = mod.exports;

const reset = () => { for (const k of Object.keys(store)) delete store[k]; };
const hour = 3600_000;
const session = (user, expiresAt) => JSON.stringify({ token: 't', user, expiresAt });

console.log('\nNo session means no name');
{
    reset();
    eq('nothing stored', readSession(), null);
    store.jv_auth = 'not json at all';
    eq('a corrupt value is not a session', readSession(), null);
    store.jv_auth = JSON.stringify({ token: 't' });
    eq('a token with no user is not a session', readSession(), null);
    store.jv_auth = session({ first_name: 'Ezra' }, null);
    eq('a user with no email is not a session', readSession(), null);
}

console.log('\nA live session is read from either key the site uses');
{
    reset();
    store.jv_auth = session({ email: 'ezra@example.com', first_name: 'Ezra' }, new Date(Date.now() + hour).toISOString());
    eq('jv_auth (the home page key)', readSession().email, 'ezra@example.com');

    reset();
    store.jubileeVerseAuth = session({ email: 'ezra@example.com', first_name: 'Ezra' }, new Date(Date.now() + hour).toISOString());
    eq('jubileeVerseAuth (radio and music)', readSession().email, 'ezra@example.com');

    reset();
    store.jv_auth = session({ email: 'a@example.com', first_name: 'Ada' }, new Date(Date.now() + hour).toISOString());
    store.jubileeVerseAuth = session({ email: 'b@example.com', first_name: 'Bea' }, new Date(Date.now() + hour).toISOString());
    eq('jv_auth wins when both are present', readSession().email, 'a@example.com');
}

console.log('\nAn expired token is not a session');
{
    reset();
    store.jv_auth = session({ email: 'ezra@example.com', first_name: 'Ezra' }, new Date(Date.now() - 1000).toISOString());
    eq('one second past expiry', readSession(), null);

    reset();
    store.jv_auth = session({ email: 'ezra@example.com', first_name: 'Ezra' }, new Date(Date.now() + 60_000).toISOString());
    ok('a minute before expiry is still good', readSession() !== null);

    // The door has always written expiresAt, but a session stored by an older
    // build has none — refusing those would sign everyone out on deploy day.
    reset();
    store.jv_auth = JSON.stringify({ token: 't', user: { email: 'ezra@example.com', first_name: 'Ezra' } });
    ok('no expiresAt at all is accepted', readSession() !== null);

    reset();
    store.jv_auth = session({ email: 'ezra@example.com' }, 'not a date');
    ok('an unparseable expiresAt is accepted rather than locking someone out', readSession() !== null);
}

console.log('\nThere is always a name to show');
{
    eq('first_name is preferred', shortName({ first_name: 'Ezra', name: 'Ezra Kade', email: 'e@x.com' }), 'Ezra');
    eq('falls back to the first word of name', shortName({ name: 'Ada Lovelace', email: 'a@x.com' }), 'Ada');
    eq('then to the address', shortName({ email: 'jaigkv@gmail.com' }), 'jaigkv');
    eq('blank first_name does not win', shortName({ first_name: '   ', name: 'Vera Rubin', email: 'v@x.com' }), 'Vera');
    eq('extra spaces in name do not produce an empty word', shortName({ name: '  Mira   Bell ', email: 'm@x.com' }), 'Mira');
    ok('and the initial is always a letter', /^[A-Z0-9]$/.test(shortName({ email: 'zed@x.com' }).charAt(0).toUpperCase()));
}

console.log('\nSigning out clears both keys');
{
    reset();
    store.jv_auth = session({ email: 'e@x.com', first_name: 'E' }, new Date(Date.now() + hour).toISOString());
    store.jubileeVerseAuth = session({ email: 'e@x.com', first_name: 'E' }, new Date(Date.now() + hour).toISOString());
    clearSession();
    eq('jv_auth gone', store.jv_auth, undefined);
    eq('jubileeVerseAuth gone', store.jubileeVerseAuth, undefined);
    eq('and the session reads as absent', readSession(), null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
