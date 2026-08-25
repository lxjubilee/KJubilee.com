#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────
// Is the auth API actually published, and is it safe to expose?
//
//   node scripts/check-api-host.js                       # api.kjubilee.com
//   node scripts/check-api-host.js http://localhost:3210 # anywhere else
//
// Two questions, and the second is the one that is easy to get wrong.
//
//   1. Is every auth endpoint reachable on this host and behaving?
//   2. Does CORS let the site in and keep everyone else out? An auth API on its
//      own origin lives or dies by that header. Reflecting any Origin with
//      Allow-Credentials: true — which is what `cors({origin:true})` does, and
//      what this repo shipped before lib/cors.js — means any page on the
//      internet can call it as the visitor.
// ─────────────────────────────────────────────────────────────────────────

const BASE = (process.argv[2] || 'https://api.kjubilee.com').replace(/\/+$/, '');
const TIMEOUT = 15000;

let pass = 0, fail = 0, warn = 0;
const ok = (m) => { pass++; console.log('  \x1b[32mok\x1b[0m    ' + m); };
const bad = (m) => { fail++; console.log('  \x1b[31mFAIL\x1b[0m  ' + m); };
const meh = (m) => { warn++; console.log('  \x1b[33mwarn\x1b[0m  ' + m); };

async function req(path, { method = 'GET', body, origin, headers } = {}) {
    const h = { ...(headers || {}) };
    if (body) h['Content-Type'] = 'application/json';
    if (origin) h.Origin = origin;
    const res = await fetch(BASE + path, {
        method,
        headers: h,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT),
        redirect: 'manual',
    });
    let data = null;
    try { data = await res.json(); } catch { /* not json */ }
    return { status: res.status, data, headers: res.headers };
}

// Every auth endpoint, with a request that is REFUSED on purpose — a malformed
// address, an absent challenge, a token that was never issued. Nothing here
// creates an account, sends an email, or changes a password.
const ENDPOINTS = [
    { path: '/api/sso/signup/lookup',   method: 'POST', body: { email: 'not-an-email' },        expect: [400] },
    { path: '/api/sso/login',           method: 'POST', body: { email: '' },                    expect: [400] },
    { path: '/api/sso/signup/verify',   method: 'POST', body: { email: '' },                    expect: [400] },
    { path: '/api/sso/signup/register', method: 'POST', body: { first_name: '' },               expect: [400] },
    { path: '/api/auth/forgot-password',method: 'POST', body: { email: 'not-an-email' },        expect: [200, 403, 503] },
    { path: '/api/auth/reset-password', method: 'GET',  query: '?token=never-issued',           expect: [200] },
];

(async () => {
    console.log(`\nAuth API host: ${BASE}\n`);

    // ── reachable ────────────────────────────────────────────────────────
    try {
        const r = await req('/health');
        if (r.status === 200) ok(`reachable — ${JSON.stringify(r.data)}`);
        else if (r.status === 502 || r.status === 521 || r.status === 523) {
            bad(`HTTP ${r.status} — DNS resolves but nothing is serving this hostname.`);
            console.log('        There is no nginx server_name for it, so the request falls to the');
            console.log('        default server. deploy/nginx/api.kjubilee.com.conf is the block.');
            process.exitCode = 1; return;
        } else { bad(`/health returned ${r.status}`); process.exitCode = 1; return; }
    } catch (e) {
        bad(`unreachable — ${e.message}`);
        process.exitCode = 1; return;
    }

    // ── every endpoint answers ───────────────────────────────────────────
    console.log('\nEndpoints');
    for (const e of ENDPOINTS) {
        const label = `${e.method} ${e.path}`;
        try {
            const r = await req(e.path + (e.query || ''), { method: e.method, body: e.body });
            if (r.status === 404) bad(`${label} — 404, not published on this host`);
            else if (e.expect.includes(r.status)) ok(`${label} — ${r.status}`);
            else meh(`${label} — ${r.status} (expected ${e.expect.join('/')}) ${JSON.stringify(r.data || '').slice(0, 80)}`);
        } catch (err) {
            bad(`${label} — ${err.message}`);
        }
    }

    // ── CORS ─────────────────────────────────────────────────────────────
    console.log('\nCross-origin access');
    const probe = async (origin) => {
        const r = await req('/api/sso/signup/lookup', {
            method: 'OPTIONS',
            origin,
            headers: {
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type',
            },
        });
        return {
            status: r.status,
            allow: r.headers.get('access-control-allow-origin'),
            creds: r.headers.get('access-control-allow-credentials'),
            vary: r.headers.get('vary'),
        };
    };

    for (const origin of ['https://kjubilee.com', 'https://www.kjubilee.com']) {
        try {
            const c = await probe(origin);
            if (c.allow === origin) ok(`${origin} is allowed`);
            else bad(`${origin} is NOT allowed (Allow-Origin: ${c.allow || 'absent'}) — the site cannot call its own API`);
        } catch (e) { bad(`${origin} — ${e.message}`); }
    }

    for (const origin of ['https://evil.example', 'http://kjubilee.com.evil.example']) {
        try {
            const c = await probe(origin);
            if (!c.allow) ok(`${origin} is refused`);
            else bad(`${origin} IS ALLOWED (${c.allow}${c.creds === 'true' ? ', with credentials' : ''}) — CORS is reflecting any origin`);
        } catch (e) { meh(`${origin} — ${e.message}`); }
    }

    try {
        const c = await probe('https://kjubilee.com');
        if ((c.vary || '').toLowerCase().includes('origin')) ok('Vary: Origin is set, so a proxy cannot cache one origin\'s reply for another');
        else meh('Vary: Origin is missing — a shared cache could serve the wrong Allow-Origin');
    } catch { /* covered above */ }

    // ── transport ────────────────────────────────────────────────────────
    if (BASE.startsWith('https://')) {
        console.log('\nTransport');
        try {
            const r = await req('/health');
            const hsts = r.headers.get('strict-transport-security');
            hsts ? ok(`HSTS: ${hsts}`) : meh('no Strict-Transport-Security header');
            const cache = r.headers.get('cache-control') || '';
            /no-store|no-cache/.test(cache) ? ok(`Cache-Control: ${cache}`) : meh(`Cache-Control: ${cache || 'absent'} — an auth API should not be cacheable`);
        } catch { /* already reported */ }
    }

    console.log(`\n${pass} ok, ${warn} warnings, ${fail} failures\n`);
    process.exitCode = fail ? 1 : 0;
})().catch((e) => { bad('unexpected: ' + e.message); process.exitCode = 1; });
