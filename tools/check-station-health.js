#!/usr/bin/env node
/**
 * check-station-health.js — is every station on the dial actually PLAYABLE?
 *
 *   node tools/check-station-health.js              # today + 2, sample 6 tracks
 *   node tools/check-station-health.js --days 7 --sample 12
 *   node tools/check-station-health.js --repair     # republish what is missing
 *   node tools/check-station-health.js --station HM361.90-EN
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Three things have to be true before a listener hears anything, and until now
 * only the first two were ever checked:
 *
 *   1. the station is ON AIR          — derived from having a manifest
 *   2. a day file exists for today    — tools/check-schedules.js
 *   3. IT COVERS THE WHOLE DAY        — nothing checked this
 *   4. THE BYTES BEHIND IT SERVE      — nothing checked this
 *
 * The third is the one that fails silently. A day file is a list of URLs; it
 * returns 200 with 551 entries whether or not a single one of them resolves.
 * Melody's Sparkle once had a perfect 484-entry day file every track of which
 * 404'd, because the schedule had been published and the catalogue never
 * synced. Nothing reported it. Somebody pressed play and heard nothing.
 *
 * So this samples the actual audio. Not every track — that is thousands of
 * range requests an hour — but a random sample per station per run, which over
 * a day of runs covers the catalogue and catches a systematic failure within
 * minutes rather than whenever somebody happens to tune in.
 *
 * ── WHAT IT REPAIRS ─────────────────────────────────────────────────────────
 *
 * With --repair, a station missing a day file gets its schedule republished
 * from the pool the host already holds. That is the failure this can actually
 * fix by itself. It deliberately does NOT try to fix missing audio: that needs
 * the music share and a human decision about what belongs on air, and a script
 * that guessed would be worse than one that reports.
 *
 * Exit codes: 0 all healthy · 1 something is broken · 2 the check itself failed.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CDN = process.env.KJ_CDN_URL || 'https://cdn.kjubilee.com';

function arg(name, fallback) {
    const i = process.argv.indexOf('--' + name);
    return i > 0 && process.argv[i + 1] && process.argv[i + 1].indexOf('--') !== 0
        ? process.argv[i + 1] : fallback;
}
const DAYS = parseInt(arg('days', '3'), 10);
const SAMPLE = parseInt(arg('sample', '6'), 10);
const ONLY = arg('station', null);
const REPAIR = process.argv.indexOf('--repair') > 0;
const QUIET = process.argv.indexOf('--quiet') > 0;

function say(s) { if (!QUIET) console.log(s); }

/* ── THE ROSTER COMES FROM THE TENANTS, not from stations-data.js ────────
   The same list r2-publish-schedules.js publishes from, and for the same
   reason: this has to agree with the publisher about which stations exist or
   it will happily report a clean bill of health for a roster that is missing
   whatever was added last.

   That is not hypothetical. The scheduler host's copy of stations-data.js was
   five days stale when this was written — it did not know HM 317.40 existed —
   while its tenants directory was current. Reading the dial file here would
   have made this monitor blind to exactly the newest station, which is the one
   most likely to be broken. One source, shared with the tool that writes the
   files being checked. */
const tenants = require(path.join(ROOT, 'tools', 'lib', 'tenants'));
const zone = require(path.join(ROOT, 'tools', 'lib', 'zone'));
let STATIONS = tenants.ids().map(id => ({
    tenant: id,
    name: (tenants.load(id) || {}).name || id,
}));
if (ONLY) STATIONS = STATIONS.filter(s => s.tenant === ONLY);

/* The player computes its day key in Pacific, because every tenant declares a
   Pacific broadcast day. Asking in the host's local time passes on a London
   box at 23:00 and misses the file the listener is actually requesting. */
function pacificDay(offset) {
    const d = new Date(Date.now() + offset * 86400000);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d).replace(/-/g, '');
}

function pick(arr, n) {
    const copy = arr.slice();
    const out = [];
    while (out.length < n && copy.length) {
        out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return out;
}

async function head(url) {
    try {
        const r = await fetch(url, { headers: { Range: 'bytes=0-64' } });
        return r.status;
    } catch (e) { return -1; }
}

function republish(tenant) {
    return new Promise((resolve) => {
        execFile(process.execPath,
            [path.join(ROOT, 'scripts', 'r2-publish-schedules.js'),
             '--apply', '--station', tenant, '--days', String(Math.max(DAYS, 7))],
            { cwd: ROOT, timeout: 600000 },
            (err, stdout) => resolve({ ok: !err, out: String(stdout || '').split('\n').pop() }));
    });
}

(async () => {
    const dates = Array.from({ length: DAYS }, (_, i) => pacificDay(i));
    say('kJubilee station health — ' + new Date().toISOString());
    say('  ' + STATIONS.length + ' on-air station(s) · days ' + dates[0] + '..' + dates[dates.length - 1]
        + ' · sampling ' + SAMPLE + ' track(s) each\n');

    const problems = [];
    const repaired = [];

    for (const s of STATIONS) {
        const missing = [];
        const short = [];      // published, but not covering the whole day
        let doc = null;

        for (const d of dates) {
            // Built by the same helper the publisher writes with, so a naming
            // change cannot make this look for files nobody publishes.
            const url = tenants.deliveryUrl(s.tenant, d, CDN);
            try {
                const r = await fetch(url, { cache: 'no-store' });
                if (!r.ok) { missing.push(d); continue; }
                const j = await r.json();
                const n = (j.entries || []).length;
                if (!n) { missing.push(d + ' (empty)'); continue; }

                /* ── DOES THE DAY ACTUALLY COVER THE DAY? ────────────────
                   Entry count proves nothing about the hours a listener can
                   tune in. The player asks the schedule what is playing at
                   THIS SECOND; if the entries stop at 18:00, everything after
                   that is "Off air" on a station reporting ON AIR with a day
                   file that looks perfect from every other angle. A gap in
                   the middle does the same for as long as it lasts.

                   `t` is seconds from the top of the broadcast day and `d` is
                   the duration — read off a live file, not assumed. The day
                   length is asked for rather than taken as 86400, because two
                   days a year it is 23 or 25 hours and a hard-coded day would
                   cry wolf on one and miss an hour of silence on the other. */
                const need = zone.dayLengthSeconds(d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8));
                let end = 0, cursor = 0, holes = 0;
                for (const e of (j.entries || [])) {
                    const t = Number(e.t || 0), dur = Number(e.d || 0);
                    if (t > cursor + 2) holes++;
                    cursor = Math.max(cursor, t + dur);
                    if (t + dur > end) end = t + dur;
                }
                // A minute's slack: the last track may end a little either side
                // of midnight and the next day's file carries on from there.
                if (end < need - 60) short.push(d + ' (ends ' + Math.round((need - end) / 60) + ' min early)');
                if (holes) short.push(d + ' (' + holes + ' gap(s) mid-day)');

                if (!doc) doc = j;
            } catch (e) { missing.push(d + ' (' + (e.message || 'fetch failed') + ')'); }
        }

        // ── the bytes ───────────────────────────────────────────────────
        const dead = [];
        if (doc) {
            const urls = [...new Set((doc.entries || []).map(e => e.u))];
            for (const u of pick(urls, SAMPLE)) {
                const code = await head(CDN + '/music/' + u);
                if (code !== 200 && code !== 206) dead.push(code + ' ' + u);
            }
        }

        const bad = missing.length || short.length || dead.length;
        say('  ' + (bad ? 'BAD  ' : 'ok   ') + s.tenant.padEnd(14) + s.name.slice(0, 26).padEnd(28)
            + (missing.length ? 'missing:' + missing.length + ' ' : '')
            + (short.length ? 'gaps:' + short.length + ' ' : '')
            + (dead.length ? 'deadAudio:' + dead.length + '/' + SAMPLE : ''));

        if (missing.length) {
            problems.push({ tenant: s.tenant, name: s.name, kind: 'schedule', detail: missing.join(', ') });
            if (REPAIR) {
                const r = await republish(s.tenant);
                repaired.push(s.tenant + (r.ok ? ' — republished' : ' — REPUBLISH FAILED'));
                say('       repair: ' + (r.ok ? 'republished' : 'FAILED') + '  ' + r.out);
            }
        }
        /* Repairable the same way a missing file is — republishing rebuilds the
           day from the pool — so it goes through the same branch. */
        if (short.length) {
            problems.push({ tenant: s.tenant, name: s.name, kind: 'coverage', detail: short.join(', ') });
            if (REPAIR && !missing.length) {
                const r = await republish(s.tenant);
                repaired.push(s.tenant + (r.ok ? ' — republished' : ' — REPUBLISH FAILED'));
                say('       repair: ' + (r.ok ? 'republished' : 'FAILED') + '  ' + r.out);
            }
        }
        if (dead.length) {
            problems.push({ tenant: s.tenant, name: s.name, kind: 'audio', detail: dead.slice(0, 3).join(' | ') });
        }
    }

    say('');
    if (!problems.length) {
        say('PASS — every on-air station has published programming and audio that serves.');
        process.exit(0);
    }

    console.error('FAIL — ' + problems.length + ' problem(s):');
    for (const p of problems) {
        console.error('  ' + p.kind.toUpperCase().padEnd(9) + p.tenant.padEnd(14) + p.name);
        console.error('       ' + p.detail);
    }
    if (repaired.length) {
        console.error('\nrepairs attempted:');
        repaired.forEach(r => console.error('  ' + r));
    }
    process.exit(1);
})().catch(e => { console.error('check failed: ' + (e && e.stack || e)); process.exit(2); });
