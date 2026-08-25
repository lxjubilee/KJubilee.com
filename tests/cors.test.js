#!/usr/bin/env node
/**
 * Tests who may call the API from a browser.
 *
 *   node tests/cors.test.js
 *
 * This is the check that matters once the auth API answers on its own hostname.
 * Until then every call was same-origin and the header was decoration; from
 * api.kjubilee.com, cross-origin IS the normal case and Allow-Origin is the
 * only thing standing between the auth API and every page on the internet.
 *
 * What this repo shipped before lib/cors.js was `cors({ origin: true,
 * credentials: true })` — reflect whatever Origin asked, and say credentials
 * are welcome. That is the misconfiguration this file exists to prevent coming
 * back.
 *
 * The near-miss hostnames are the point. A rule written with a loose match lets
 * through `kjubilee.com.evil.example` (a domain the attacker owns, ending in
 * something that merely CONTAINS ours) or `evilkjubilee.com` (ours as a
 * suffix). Both read as "kjubilee.com" at a glance and neither is us.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (d ? '  — ' + d : '')); } };

// lib/cors.js is ESM (middleware imports it), so it is loaded the same way
// door-params is: read, strip the export keywords, evaluate.
function load(env) {
    for (const [k, v] of Object.entries(env || {})) process.env[k] = v;
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cors.js'), 'utf8')
        .replace(/export function/g, 'function')
        + '\nmodule.exports = { isAllowedOrigin, corsHeaders };';
    const mod = { exports: {} };
    new Function('module', 'exports', 'process', src)(mod, mod.exports, process);
    return mod.exports;
}

const { isAllowedOrigin, corsHeaders } = load();

console.log('\nThe family is let in');
for (const o of [
    'https://kjubilee.com',
    'https://www.kjubilee.com',
    'https://api.kjubilee.com',
    'https://radio.kjubilee.com',
    'https://jubileeinspire.com',
    'https://sso.jubileeinspire.com',
    'https://torahsings.com',
    'https://jubilujah.com',
]) ok(o, isAllowedOrigin(o));

console.log('\nDevelopment is let in');
for (const o of ['http://localhost:3210', 'http://localhost', 'http://127.0.0.1:3210', 'https://localhost:3000'])
    ok(o, isAllowedOrigin(o));

console.log('\nEverything else is refused');
for (const o of [
    'https://evil.example',
    // ours as a PREFIX of a domain someone else owns
    'https://kjubilee.com.evil.example',
    'https://kjubilee.com.br',
    // ours as a SUFFIX of a domain someone else owns
    'https://evilkjubilee.com',
    'https://notjubileeinspire.com',
    // a label that merely contains ours
    'https://kjubilee-com.example',
    // scheme games
    'file://kjubilee.com',
    'ftp://kjubilee.com',
    'null',
    // a path is not part of an origin; anything carrying one is malformed
    'https://kjubilee.com/evil',
    'https://kjubilee.com:8443@evil.example',
]) ok(o, !isAllowedOrigin(o));

console.log('\nAn absent origin gets no headers at all');
{
    ok('empty string is refused', !isAllowedOrigin(''));
    ok('undefined is refused', !isAllowedOrigin(undefined));
    const none = corsHeaders({ headers: { get: () => null } });
    ok('a request with no Origin gets no CORS headers', Object.keys(none).length === 0);
}

console.log('\nThe headers themselves');
{
    const h = corsHeaders({ headers: { get: (k) => (k === 'origin' ? 'https://kjubilee.com' : null) } });
    ok('Allow-Origin echoes the caller, never *', h['Access-Control-Allow-Origin'] === 'https://kjubilee.com');
    ok('credentials are allowed for the family', h['Access-Control-Allow-Credentials'] === 'true');
    ok('Vary: Origin is set so a cache cannot cross the wires', h.Vary === 'Origin');

    const blocked = corsHeaders({ headers: { get: (k) => (k === 'origin' ? 'https://evil.example' : null) } });
    ok('a refused origin gets nothing', Object.keys(blocked).length === 0);
    ok('and specifically no Allow-Credentials', blocked['Access-Control-Allow-Credentials'] === undefined);
}

console.log('\nCORS_ORIGINS adds exact origins, and only exact ones');
{
    const c = load({ CORS_ORIGINS: 'https://partner.example, https://preview.vercel.app' });
    ok('a listed origin is allowed', c.isAllowedOrigin('https://partner.example'));
    ok('whitespace around it is tolerated', c.isAllowedOrigin('https://preview.vercel.app'));
    ok('a subdomain of it is NOT implied', !c.isAllowedOrigin('https://sub.partner.example'));
    ok('a lookalike is not allowed', !c.isAllowedOrigin('https://partner.example.evil.com'));
    ok('the family still works', c.isAllowedOrigin('https://kjubilee.com'));
    delete process.env.CORS_ORIGINS;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
