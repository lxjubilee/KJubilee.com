#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────
// Is kJubilee actually able to talk to the Jubilee ID authority?
//
//   node scripts/check-sso.js
//
// There are four separate things that each break the door on their own, and
// they all look the same from the sign-in screen ("Sign-in is temporarily
// unavailable"). This tells them apart:
//
//   1. the authority is reachable at all
//   2. our client_id + client_secret mint a service token
//   3. 'kjubilee' is a canonical site key there  (the PLATFORM_KEYS deploy)
//   4. an identity lookup answers
//
// Reads the same env the app does. Prints no secrets.
// ─────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const BASE = (process.env.SSO_BASE || 'https://sso.jubileeinspire.com').replace(/\/+$/, '');
const ID = process.env.SSO_CLIENT_ID || 'kjubilee';
const SECRET = process.env.SSO_CLIENT_SECRET || '';
const SITE = process.env.SSO_SITE || 'kjubilee';
const TIMEOUT = parseInt(process.env.SSO_TIMEOUT_MS || '12000', 10);

const ok = (m) => console.log('  \x1b[32mok\x1b[0m    ' + m);
const bad = (m) => console.log('  \x1b[31mFAIL\x1b[0m  ' + m);
const note = (m) => console.log('        ' + m);

// Set by any check that reported FAIL. Without it the run below could print a
// red line and still sign off with "the door can talk to the authority" — which
// is the one line an operator actually reads.
let failed = false;

async function call(path, body, headers) {
    const res = await fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers || {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT),
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    return { status: res.status, data };
}

(async () => {
    console.log(`\nJubilee ID authority: ${BASE}`);
    console.log(`client_id: ${ID}   secret: ${SECRET ? SECRET.length + ' chars' : 'NOT SET'}   site: ${SITE}\n`);

    if (!SECRET) {
        bad('SSO_CLIENT_SECRET is not set — the door will fall back to local passwords.');
        process.exitCode = 1; return;
    }

    // ── 1. reachable ─────────────────────────────────────────────────────
    try {
        const res = await fetch(BASE + '/health', { signal: AbortSignal.timeout(TIMEOUT) });
        const d = await res.json().catch(() => ({}));
        if (res.ok) ok(`reachable — ${d.service || 'sso'} (env ${d.env || '?'}, db ${d.db || '?'})`);
        else { bad(`/health returned ${res.status}`); process.exitCode = 1; return; }
    } catch (e) {
        bad(`unreachable — ${e.message}`);
        process.exitCode = 1; return;
    }

    // ── 2. the credential pair ───────────────────────────────────────────
    let token = null;
    {
        const r = await call('/api/auth/service/token', { client_id: ID, client_secret: SECRET });
        if (r.status === 200 && r.data && r.data.token) {
            token = r.data.token;
            ok(`service token minted (expires ${r.data.expiresAt || 'unknown'})`);
        } else {
            bad(`service token refused — HTTP ${r.status} ${JSON.stringify(r.data)}`);
            if (r.data && r.data.error === 'invalid_client') {
                note('');
                note('The running authority does not hold this client. In order of likelihood:');
                note('');
                note('  a) It was added to .env but the service was NOT RESTARTED. dotenv only');
                note('     populates process.env at boot, and services/service-clients.js reads');
                note('     process.env on every call — so an edited .env changes nothing until');
                note('     the process restarts.');
                note('');
                note('  b) It went into the wrong file. server.js loads .env and THEN overlays');
                note('     .env.<DEPLOY_ENV> with override:true, so a SSO_SERVICE_CLIENTS line in');
                note('     .env.production silently shadows the one in .env. Put the client in');
                note('     whichever file actually wins, or in both.');
                note('');
                note('  c) The JSON is malformed. loadClients() logs and returns {} on a parse');
                note('     error, which would break EVERY client — if jubileeinspire still signs');
                note('     in, it is not this.');
                note('');
                note('  On the box:  node scripts/verify-clients.js   (prints TOKEN OK per client)');
            }
            process.exitCode = 1; return;
        }
    }

    const auth = { Authorization: `Bearer ${token}` };

    // ── 3. is 'kjubilee' a canonical site key there? ──────────────────────
    // Probed through /login with credentials that cannot exist: site validation
    // runs BEFORE any identity lookup, so invalid_site is unambiguous and
    // nothing is created either way.
    {
        const probe = `check-${Date.now()}@kjubilee.invalid`;
        const r = await call('/api/auth/login', { email: probe, password: 'x'.repeat(24), site: SITE }, auth);
        if (r.data && r.data.error === 'invalid_site') {
            failed = true;
            bad(`'${SITE}' is not a canonical site key on this authority`);
            note("Ship the PLATFORM_KEYS change in routes/auth.js (add 'kjubilee') and restart.");
            note('Until then sign-in and registration both fail, even with a valid token.');
        } else {
            ok(`'${SITE}' is accepted as a site key`);
        }
    }

    // ── 4. does a lookup answer? ─────────────────────────────────────────
    {
        const probe = `check-${Date.now()}@kjubilee.invalid`;
        const r = await call('/api/auth/lookup', { email: probe }, auth);
        if (r.status === 200 && r.data && typeof r.data.exists === 'boolean') {
            ok(`identity lookup answers (exists=${r.data.exists} for an address that cannot exist)`);
        } else {
            bad(`lookup failed — HTTP ${r.status} ${JSON.stringify(r.data)}`);
            process.exitCode = 1; return;
        }
    }

    if (failed) {
        // Every call answered and the credentials are good, but the door still
        // cannot sign anyone in. Reporting success here is exactly how a
        // half-configured authority gets mistaken for a working one.
        console.log('\nThe credentials work, but the door will still fail — see above.\n');
        process.exitCode = 1;
        return;
    }

    console.log('\nThe door can talk to the authority.\n');
})().catch((e) => {
    bad('unexpected: ' + (e && e.message));
    process.exitCode = 1;
});
