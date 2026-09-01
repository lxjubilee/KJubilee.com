#!/usr/bin/env node
/**
 * verify-album-audio.js — which albums are ACTUALLY finished on the CDN?
 *
 *   node tools/verify-album-audio.js --station HM316.00-EN
 *   node tools/verify-album-audio.js                     # every station with a pool
 *   node tools/verify-album-audio.js --station HM316.00-EN --quiet
 *
 * ── WHY THE LEDGER IS NOT THE ANSWER ────────────────────────────────────────
 *
 * /data/todo-index.json already says how many of an album's tracks are
 * "ingested", and it is tempting to read that as done. It is not the same
 * claim. Ingested means the track has a SongID in songid-registry.tsv — that
 * the ingest ran and the row was written. Whether the object it names is
 * sitting on cdn.kjubilee.com right now, and answers when something asks for
 * it, is a different question that nothing was asking.
 *
 * That gap is the same one check-station-health.js exists for, and it is not
 * hypothetical: a station's whole day file can be valid, every entry present,
 * and every track 404. An album marked done off the ledger while its audio is
 * missing is a record nobody will ever re-cut, because the console said it was
 * finished.
 *
 * So this asks the CDN. One ranged GET per track — enough to prove the object
 * exists and serves bytes, without pulling megabytes of audio — and an album is
 * green only when EVERY one of its tracks answers.
 *
 * ── WHAT IT WRITES ──────────────────────────────────────────────────────────
 *
 *   public/data/audio-verified.json
 *     { generated_at, checked, albums: { CODE: { tracks, ok, verified } } }
 *
 * Deliberately its own file rather than a field inside todo-index.json: that
 * index is written by walking authoring trees on a machine that can see the
 * music share, and this is a network check that wants running far more often
 * and from anywhere. Keeping them separate means either can be rebuilt without
 * the other, and a missing file here simply means no album shows a tick —
 * never a false one.
 *
 * Exit codes: 0 wrote the file · 1 nothing to check · 2 the run failed.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const POOLS = path.join(ROOT, 'tmp', 'pools');
const OUT = path.join(ROOT, 'public', 'data', 'audio-verified.json');
const CDN = process.env.KJ_CDN_URL || 'https://cdn.kjubilee.com';

function arg(name, fallback) {
    const i = process.argv.indexOf('--' + name);
    return i > 0 && process.argv[i + 1] && process.argv[i + 1].indexOf('--') !== 0
        ? process.argv[i + 1] : fallback;
}
const ONLY = arg('station', null);
const QUIET = process.argv.indexOf('--quiet') > 0;
const CONCURRENCY = Number(arg('concurrency', '8'));
const say = (s) => { if (!QUIET) console.log(s); };

/* The pool stores site-relative addresses (/cdn/music/...), because that is
   what the player asks its own origin for. The object itself lives on the CDN
   under music/, so the prefix is swapped rather than the path rebuilt — one
   translation, in one place. */
function cdnUrl(u) {
    const s = String(u || '');
    if (/^https?:\/\//i.test(s)) return s;
    return CDN + '/' + s.replace(/^\/?cdn\//, '');
}

async function serves(url) {
    try {
        // Range rather than HEAD: some edges answer HEAD from metadata alone,
        // which can succeed for an object whose body is not actually there.
        const r = await fetch(url, { headers: { Range: 'bytes=0-64' } });
        return r.status === 200 || r.status === 206;
    } catch (e) { return false; }
}

/** Run `jobs` with a small pool, so a 600-track station does not open 600 sockets. */
async function pooled(jobs, n) {
    const out = [];
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
        for (;;) {
            const k = i++;
            if (k >= jobs.length) return;
            out[k] = await jobs[k]();
        }
    }));
    return out;
}

(async () => {
    if (!fs.existsSync(POOLS)) {
        console.error('no tmp/pools — build the station manifests first');
        process.exit(1);
    }
    let files = fs.readdirSync(POOLS).filter(f => f.endsWith('.music.json'));
    if (ONLY) files = files.filter(f => f.indexOf(ONLY) === 0);
    if (!files.length) { console.error('no pool matched'); process.exit(1); }

    /* Merged across stations rather than nested under them, because an album is
       an album: the same record selected by three frequencies is one thing to
       verify, and its tick means the same on every page that draws it. */
    const albums = Object.create(null);
    for (const f of files) {
        let pool;
        try { pool = JSON.parse(fs.readFileSync(path.join(POOLS, f), 'utf8')); }
        catch (e) { console.error('unreadable pool ' + f + ': ' + e.message); continue; }
        for (const a of (pool.albums || [])) {
            for (const t of (a.tracks || [])) {
                const code = t.album_id || a.album_id;
                if (!code || !t.url) continue;
                (albums[code] = albums[code] || new Set()).add(t.url);
            }
        }
    }

    const codes = Object.keys(albums).sort();
    if (!codes.length) { console.error('no albums with tracks in those pools'); process.exit(1); }

    say('verifying audio on ' + CDN + ' — ' + codes.length + ' album(s)'
        + (ONLY ? ' for ' + ONLY : '') + '\n');

    const result = {};
    let greens = 0, checked = 0;
    for (const code of codes) {
        const urls = [...albums[code]];
        const hits = await pooled(urls.map(u => () => serves(cdnUrl(u))), CONCURRENCY);
        const okN = hits.filter(Boolean).length;
        checked += urls.length;
        // GREEN MEANS EVERY TRACK. A record that is nine tenths uploaded is not
        // finished, and a tick that meant "mostly" would be the one thing this
        // file exists to prevent.
        const verified = okN === urls.length && urls.length > 0;
        if (verified) greens++;
        result[code] = { tracks: urls.length, ok: okN, verified: verified };
        say('  ' + (verified ? 'OK  ' : '--  ') + code.padEnd(12)
            + okN + '/' + urls.length + ' track(s) serve');
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({
        generated_at: new Date().toISOString(),
        generator: 'tools/verify-album-audio.js',
        cdn: CDN,
        checked: checked,
        albums: result,
    }, null, 0));

    say('\n' + greens + ' of ' + codes.length + ' album(s) fully serve · '
        + checked + ' track(s) checked');
    say('wrote ' + path.relative(ROOT, OUT));
    process.exit(0);
})().catch((e) => { console.error('verify failed: ' + (e && e.stack || e)); process.exit(2); });
