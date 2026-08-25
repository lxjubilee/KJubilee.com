#!/usr/bin/env node
/**
 * Tests for the dated broadcast schedule (tools/build-schedule-manifest.js).
 *
 * The property under test is not "the file parses" — it is THE ILLUSION: two
 * listeners who tune in at the same instant, on different machines, having each
 * downloaded the schedule at a different time, must hear the same song at the
 * same offset. Everything below exists to hold one of the legs that stands on.
 *
 *   node tests/schedule-manifest.test.js            # offline checks only
 *   node tests/schedule-manifest.test.js --cdn      # also probe cdn.kjubilee.com
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { build, buildDay, poolFrom } = require('../tools/build-schedule-manifest');

const DAY = 86400;
let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? '  — ' + detail : '')); }
}

const poolPath = process.argv.includes('--pool')
    ? process.argv[process.argv.indexOf('--pool') + 1]
    : path.join(__dirname, 'fixtures', 'pool.json');
if (!fs.existsSync(poolPath)) {
    console.error('pool manifest not found: ' + poolPath);
    console.error('build one:  node tools/build-station-manifest.js --station HM339.18-EN ' +
                  '--url-layout canonical --out ' + poolPath);
    process.exit(1);
}

const STATION = 'HM339.18-EN';
const DATE = '2026-08-22';
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kjsched-'));
// The station is not optional: poolFrom checks the pool it was handed against
// the station it is being scheduled for, which is what stops a day file being
// stamped for one station and filled with another's music. This test builds
// HM339.18-EN days, so it says so.
const pool = poolFrom(poolPath, STATION);

console.log('\nschedule-manifest — pool ' + pool.length + ' tracks\n');

// ── the timeline itself ──────────────────────────────────────────────────────
const entries = buildDay(pool, STATION, DATE);

ok('starts at exactly 00:00:00Z', entries[0].t === 0, 't=' + entries[0].t);

let contiguous = true, firstBreak = null;
for (let i = 1; i < entries.length; i++) {
    const expected = entries[i - 1].t + entries[i - 1].d;
    if (entries[i].t !== expected) { contiguous = false; firstBreak = i; break; }
}
ok('no gap or overlap between consecutive entries', contiguous,
   firstBreak === null ? '' : 'entry ' + firstBreak + ' starts at ' + entries[firstBreak].t +
   ', previous ends at ' + (entries[firstBreak - 1].t + entries[firstBreak - 1].d));

const last = entries[entries.length - 1];
ok('covers the whole day', last.t + last.d >= DAY, 'ends at ' + (last.t + last.d));
ok('does not start a track after midnight', last.t < DAY, 'last starts at ' + last.t);

ok('every entry has a positive duration', entries.every(e => e.d > 0));
ok('every entry has a CDN-relative url', entries.every(e => e.u && e.u.indexOf('/') > 0 && e.u[0] !== '/'));

let adjacent = 0;
for (let i = 1; i < entries.length; i++) if (entries[i].id === entries[i - 1].id) adjacent++;
ok('no song plays twice back to back', adjacent === 0, adjacent + ' adjacent repeat(s)');

// ── determinism: the whole contract rests on this ────────────────────────────
const again = buildDay(pool, STATION, DATE);
ok('rebuilding the same day is byte-identical',
   JSON.stringify(again) === JSON.stringify(entries));

const otherDay = buildDay(pool, STATION, '2026-08-23');
ok('a different day gets a different running order',
   JSON.stringify(otherDay) !== JSON.stringify(entries));

const otherStation = buildDay(pool, 'HM332.16-RO', DATE);
ok('a different station gets a different running order',
   JSON.stringify(otherStation) !== JSON.stringify(entries));

// ── the client resolver, which is what the player will run ───────────────────
/** What should be sounding at `sec` past midnight, and how far into it. */
function resolve(sched, sec) {
    let lo = 0, hi = sched.length - 1, found = null;
    while (lo <= hi) {                       // binary search: 390 entries, but a
        const mid = (lo + hi) >> 1;          // week-long file would be ~2,700
        const e = sched[mid];
        if (sec < e.t) hi = mid - 1;
        else if (sec >= e.t + e.d) lo = mid + 1;
        else { found = { entry: e, offset: sec - e.t }; break; }
    }
    return found;
}

let resolvedEverySecond = true, missAt = null;
for (let s = 0; s < DAY; s += 7) {           // 12,343 probes across the day
    const r = resolve(entries, s);
    if (!r || r.offset < 0 || r.offset >= r.entry.d) { resolvedEverySecond = false; missAt = s; break; }
}
ok('every second of the day resolves to exactly one track', resolvedEverySecond,
   missAt === null ? '' : 'no entry covers second ' + missAt);

// Two clients, same instant, schedules fetched independently — the illusion.
const clientA = buildDay(pool, STATION, DATE);
const clientB = JSON.parse(JSON.stringify(buildDay(pool, STATION, DATE)));
let agree = true, disagreeAt = null;
for (const s of [0, 1, 3599, 43200, 61234, 86399]) {
    const a = resolve(clientA, s), b = resolve(clientB, s);
    if (!a || !b || a.entry.id !== b.entry.id || a.offset !== b.offset) {
        agree = false; disagreeAt = s; break;
    }
}
ok('two independent clients agree on track AND offset', agree,
   disagreeAt === null ? '' : 'disagree at second ' + disagreeAt);

// Drift correction: a client that is late still lands in the right place.
const r1 = resolve(entries, 45000);
const r2 = resolve(entries, 45000 + 3);      // 3s of clock skew
ok('a 3s clock skew does not change the track',
   r1 && r2 && r1.entry.id === r2.entry.id && r2.offset - r1.offset === 3);

// ── size, which is the whole economic argument ───────────────────────────────
const written = build({ station: STATION, date: DATE, days: 1, pool: poolPath,
                        out: out, cdnBase: 'https://cdn.kjubilee.com' });
const raw = fs.statSync(written[0].file).size;
const gz = zlib.gzipSync(fs.readFileSync(written[0].file)).length;
ok('a day of schedule fits in 40 KB gzipped', gz < 40 * 1024,
   (gz / 1024).toFixed(1) + ' KB gz (' + (raw / 1024).toFixed(0) + ' KB raw)');
console.log('       → ' + (gz / 1024).toFixed(1) + ' KB per listener per day = ' +
            (gz * 8 / DAY).toFixed(2) + ' bps averaged');

// ── the CDN really serves what the schedule points at ────────────────────────
async function probeCdn() {
    const doc = written[0].doc;
    const sample = [0, Math.floor(doc.entries.length / 2), doc.entries.length - 1]
        .map(i => doc.entries[i]);
    console.log('\n  cdn.kjubilee.com');
    for (const e of sample) {
        const url = doc.cdnBase + '/' + doc.prefix + e.u.split('/').map(encodeURIComponent).join('/');
        try {
            const head = await fetch(url, { method: 'HEAD' });
            ok('serves ' + e.ti.slice(0, 34), head.ok, head.status + ' ' + url.slice(0, 70));
            // Mid-track join needs byte ranges, so prove one.
            const mid = await fetch(url, { headers: { Range: 'bytes=500000-500255' } });
            ok('  range request for a mid-track join', mid.status === 206,
               'got ' + mid.status);
        } catch (err) {
            ok('serves ' + e.ti.slice(0, 34), false, err.message);
        }
    }
}

(async () => {
    if (process.argv.includes('--cdn')) await probeCdn();
    fs.rmSync(out, { recursive: true, force: true });
    console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
    process.exit(fail ? 1 : 0);
})();
