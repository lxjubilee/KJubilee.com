#!/usr/bin/env node
/**
 * Tests human verification on the door.
 *
 *   node tests/turnstile.test.js            # offline — fakes Cloudflare
 *   node tests/turnstile.test.js --live     # also asks the REAL siteverify
 *                                             whether our secret is valid
 *
 * The point of this file is that the rest of the family's Turnstile is
 * DECORATION: those sites render the widget but hold no secret, so the token is
 * never checked and a script that skips the challenge is not stopped. kJubilee
 * has the secret, so what is under test is that the token is actually required.
 *
 * Which way it fails is the substance:
 *
 *   missing or bad token  -> refused. This is the case an attacker controls.
 *   Cloudflare unreachable -> allowed, loudly. That is OUR outage, and refusing
 *                             every sign-in on earth because siteverify timed
 *                             out trades a little spam for all of it.
 *
 * --live sends only the secret and a deliberately invalid response token, so it
 * proves the key is real without needing a browser to solve a challenge.
 */
'use strict';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (d ? '  — ' + d : '')); } };
const eq = (n, a, b) => ok(n, a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const LIVE = process.argv.includes('--live');

// ── Load the real keys the way the app does ──────────────────────────────
require('dotenv').config();
const SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';
const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';

// ── Offline: fake Cloudflare, run lib/turnstile.js for real ──────────────
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const realFetch = globalThis.fetch;
let lastRequest = null;
let nextReply = { success: true };

globalThis.fetch = async function (url, init) {
    if (String(url) !== VERIFY_URL) return realFetch(url, init);
    lastRequest = Object.fromEntries(new URLSearchParams(init.body));
    if (nextReply instanceof Error) throw nextReply;
    return { ok: true, status: 200, json: async () => nextReply };
};

process.env.TURNSTILE_ENFORCE = 'true';
const turnstile = require('../lib/turnstile');

(async () => {
    console.log('\nThe keys are configured');
    {
        ok('a site key is set', Boolean(SITE_KEY), 'TURNSTILE_SITE_KEY is empty');
        ok('a secret key is set', Boolean(SECRET_KEY), 'TURNSTILE_SECRET_KEY is empty');
        ok('they are not the same value', SITE_KEY !== SECRET_KEY);
        // The secret must never be given a NEXT_PUBLIC_ name — that ships it to
        // every browser and it stops being a secret.
        const leaked = Object.keys(process.env).filter(
            (k) => k.startsWith('NEXT_PUBLIC') && String(process.env[k]) === SECRET_KEY);
        eq('the secret is not exposed under a NEXT_PUBLIC_ name', leaked.length, 0);
        eq('the site key is what the browser is handed', turnstile.siteKey(), SITE_KEY);
        eq('verification is enforced', turnstile.isEnforced(), true);
    }

    console.log('\nA good token passes, and is sent correctly');
    {
        nextReply = { success: true };
        const r = await turnstile.verifyTurnstile('a-solved-token', '203.0.113.9');
        eq('accepted', r.ok, true);
        eq('the SECRET is what goes to Cloudflare', lastRequest.secret, SECRET_KEY);
        eq('along with the token', lastRequest.response, 'a-solved-token');
        eq('and the caller IP', lastRequest.remoteip, '203.0.113.9');
        ok('the site key is never sent to siteverify', lastRequest.sitekey === undefined);
    }

    console.log('\nA missing or bad token is refused');
    {
        const none = await turnstile.verifyTurnstile('', '203.0.113.9');
        eq('no token at all is refused', none.ok, false);
        eq('and named as missing', none.reason, 'missing');

        nextReply = { success: false, 'error-codes': ['invalid-input-response'] };
        const bad = await turnstile.verifyTurnstile('made-up', '203.0.113.9');
        eq('a token Cloudflare rejects is refused', bad.ok, false);
        eq('with the reason kept for our logs', bad.reason, 'invalid-input-response');

        nextReply = { success: false, 'error-codes': ['timeout-or-duplicate'] };
        const replay = await turnstile.verifyTurnstile('already-used', null);
        eq('a replayed token is refused', replay.ok, false);
    }

    console.log("\n'unknown' is never passed off as an IP address");
    {
        nextReply = { success: true };
        await turnstile.verifyTurnstile('t', 'unknown');
        ok('remoteip is omitted rather than sent as "unknown"', lastRequest.remoteip === undefined);
    }

    console.log('\nCloudflare being unreachable does not lock the site');
    {
        nextReply = new Error('ECONNREFUSED');
        const r = await turnstile.verifyTurnstile('a-solved-token', '203.0.113.9');
        eq('the request is allowed through', r.ok, true);
        eq('and flagged as degraded, not as a pass', r.degraded, true);
        nextReply = { success: true };
    }

    console.log('\nThe switch turns enforcement off without removing the widget');
    {
        delete require.cache[require.resolve('../lib/turnstile')];
        process.env.TURNSTILE_ENFORCE = 'false';
        const off = require('../lib/turnstile');
        eq('not enforced', off.isEnforced(), false);
        const r = await off.verifyTurnstile('', null);
        eq('a request with no token is allowed', r.ok, true);
        eq('and marked as skipped', r.skipped, true);
        eq('but the widget is still rendered', off.siteKey(), SITE_KEY);
        process.env.TURNSTILE_ENFORCE = 'true';
        delete require.cache[require.resolve('../lib/turnstile')];
    }

    console.log('\nWith no secret at all, nothing is enforced');
    {
        const saved = process.env.TURNSTILE_SECRET_KEY;
        delete process.env.TURNSTILE_SECRET_KEY;
        delete require.cache[require.resolve('../lib/turnstile')];
        const bare = require('../lib/turnstile');
        eq('not enforced', bare.isEnforced(), false);
        eq('and a tokenless request passes', (await bare.verifyTurnstile('', null)).ok, true);
        process.env.TURNSTILE_SECRET_KEY = saved;
        delete require.cache[require.resolve('../lib/turnstile')];
    }

    // ── Live: is the secret real? ────────────────────────────────────────
    if (LIVE) {
        console.log('\nAgainst the real Cloudflare');
        globalThis.fetch = realFetch;
        try {
            const body = new URLSearchParams({ secret: SECRET_KEY, response: 'deliberately-invalid' });
            const res = await realFetch(VERIFY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });
            const data = await res.json();
            const codes = data['error-codes'] || [];
            // A REAL secret with a junk token answers invalid-input-response.
            // A wrong secret answers invalid-input-secret — that is the tell.
            ok('the secret key is recognised by Cloudflare',
                !codes.includes('invalid-input-secret') && !codes.includes('missing-input-secret'),
                'error-codes: ' + JSON.stringify(codes));
            ok('and the junk token is correctly rejected',
                data.success === false, JSON.stringify(data));
        } catch (e) {
            console.log('  skip  could not reach Cloudflare — ' + (e && e.message));
        }
    } else {
        console.log('\n  (run with --live to check the secret against Cloudflare)');
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
