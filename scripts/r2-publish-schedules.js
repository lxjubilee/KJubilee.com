#!/usr/bin/env node
/**
 * r2-publish-schedules.js — build each station's dated broadcast schedule and
 * publish it to the R2 bucket cdn.kjubilee.com serves, under
 *
 *     radio/<STATION>/schedule/<YYYY-MM-DD>.json
 *
 * Usage:
 *   node scripts/r2-publish-schedules.js                    # dry run (default)
 *   node scripts/r2-publish-schedules.js --apply            # build + upload
 *   node scripts/r2-publish-schedules.js --apply --days 3
 *   node scripts/r2-publish-schedules.js --apply --station HM339.18-EN
 *   node scripts/r2-publish-schedules.js --apply --rebuild-pools
 *
 * DRY RUN IS THE DEFAULT, matching r2-sync-music.js. Publishing a schedule is
 * how a station's day is decided; it should take a deliberate --apply.
 *
 * ── why the audio and the schedule live in the same bucket ──────────────────
 * A listener needs exactly two things: the schedule, and the tracks it names.
 * Both come from cdn.kjubilee.com, so a tuning-in browser never touches the
 * origin at all — no VPS bandwidth, no VPS request, nothing to fall over. The
 * origin's only remaining job for playback is serving the page itself.
 *
 * ── pools are cached, and that is not just speed ────────────────────────────
 * Building a pool reads the frame headers of every track in the station's
 * selection off a network share — thousands of files for the flagship. It also
 * has no reason to change between nightly runs: the pool only moves when new
 * music is ingested. So pools are cached under tmp/pools/ and reused unless
 * --rebuild-pools is passed or the file is missing. Run with --rebuild-pools
 * after every ingest, which is the same rule the station manifests already have.
 */

const fs = require('node:fs');
const path = require('node:path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { buildStation } = require('../tools/build-station-manifest');
const tenants = require('../tools/lib/tenants');
const zone = require('../tools/lib/zone');
const { build: buildSchedule } = require('../tools/build-schedule-manifest');

const ROOT = path.join(__dirname, '..');

// Minimal .env reader (no dotenv dep) — same shape as r2-sync-music.js.
function loadEnv(p) {
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
}
loadEnv(path.join(ROOT, '.env'));

const BUCKET = process.env.R2_BUCKET || process.env.R2_BUCKET_CDN || 'kjubilee-music';
const ENDPOINT = process.env.R2_S3_ENDPOINT ||
    (process.env.R2_ACCOUNT_ID ? 'https://' + process.env.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com' : null);
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
// KJ_CDN_URL, never PUBLIC_CDN_URL — see the note in build-schedule-manifest.js.
const CDN_BASE = process.env.KJ_CDN_URL || 'https://cdn.kjubilee.com';
const POOL_DIR = path.join(ROOT, 'tmp', 'pools');
const MUSIC_ROOT = process.env.MUSIC_LOCAL_ROOT || 'J:/kjubilee.com/music';
const STAGE_DIR = path.join(ROOT, 'tmp', 'schedules');

// PACIFIC, NOT UTC. The generator lays days out on the broadcast zone and the
// player asks for the Pacific date; a publisher still working in UTC is a whole
// day out for the seven hours either side of midnight — it publishes tomorrow
// while every listener is asking for today.
function today() { return zone.localDate(Date.now()); }
const addDays = zone.addDays;

/**
 * How long the edge may hold a schedule.
 *
 * A schedule for today or any past day is FROZEN — the generator is
 * deterministic, so re-running produces the same bytes and nothing can
 * legitimately change it. Those are immutable and the edge can keep them
 * forever; the origin then serves each one about once per edge, ever.
 *
 * A FUTURE day is different. It is published early on purpose (see the cron
 * note below) and could still be revised before it airs — a Feast window
 * corrected, a station's pool re-selected after an ingest. An hour is short
 * enough that a fix lands the same morning and long enough that the edge still
 * absorbs essentially all of the load.
 */
function cacheControlFor(date) {
    // TODAY IS NOT IMMUTABLE, and that is the whole point of the revision.
    //
    // It used to be, which quietly made a mid-day fix unshippable: a browser or
    // an edge holding an immutable response never revalidates, so a corrected
    // schedule sat on R2 while every listener kept playing yesterday's copy of
    // today. Five minutes is short enough that a fix lands while it still
    // matters and long enough that the edge still absorbs essentially all of it
    // — one revalidation per edge per five minutes, against a file that is
    // usually unchanged and answers 304.
    //
    // A PAST day genuinely cannot change and nothing fetches it, so it keeps the
    // immutable year. A FUTURE day is still being regenerated nightly and gets
    // the hour it always had.
    const t = today();
    if (date < t) return 'public, max-age=31536000, immutable';
    if (date === t) return 'public, max-age=300';
    return 'public, max-age=3600';
}

/** Ensure a canonical-layout pool exists for a station; returns its path. */
async function ensurePool(stationId, rebuild) {
    fs.mkdirSync(POOL_DIR, { recursive: true });
    const file = path.join(POOL_DIR, stationId + '.music.json');
    if (!rebuild && fs.existsSync(file)) return { file: file, built: false };

    // BUILDING A POOL NEEDS THE MUSIC SHARE; PUBLISHING DOES NOT.
    //
    // That split is what lets this run as a server cron. Reading a pool means
    // reading the frame headers of every selected track off J:\kjubilee.com\music,
    // which exists on the workstation and not on the Linux box. Turning a pool
    // into a schedule and pushing it to R2 needs neither the share nor the audio
    // — just the cached JSON. So pools are built where the music is, shipped,
    // and the nightly job on the server only ever reads them.
    if (!fs.existsSync(MUSIC_ROOT)) {
        throw new Error(
            'no pool at ' + file + ' and the music repository is not reachable at ' +
            MUSIC_ROOT + '.\n  Pools are built where the music lives and copied to this host:\n' +
            '    node tools/build-station-manifest.js --station ' + stationId +
            ' --url-layout canonical --out tmp/pools/' + stationId + '.music.json\n' +
            '  then copy tmp/pools/ across. Re-run after every ingest.');
    }

    // canonical, never source: a schedule must address the kJubilee copy.
    // See docs/MUSIC-REPOSITORY-SPEC.md §1a.
    // buildStation's second parameter is the layout STRING, not an options
    // object. An object stringified to "[object Object]" and threw "unknown
    // --url-layout" -- invisible until now because every station on the dial
    // already had a cached pool, so this line only runs for a NEW station or
    // under --rebuild-pools, which is precisely when a publish must not fail.
    const built = await buildStation(stationId, 'canonical');
    fs.writeFileSync(file, JSON.stringify(built.manifest));
    return { file: file, built: true };
}

async function main(argv) {
    const has = (f) => argv.includes('--' + f);
    const opt = (f, d) => { const i = argv.indexOf('--' + f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

    const apply = has('apply');
    const days = Number(opt('days', 2));
    const start = opt('date', today());
    const only = opt('station', null);
    const rebuild = has('rebuild-pools');

    const roster = tenants.ids();
    const stations = only ? [only] : roster;
    if (only && roster.indexOf(only) < 0) {
        console.error('unknown tenant "' + only + '". Known: ' + roster.join(', '));
        return 1;
    }

    if (apply && (!ENDPOINT || !ACCESS_KEY || !SECRET_KEY)) {
        console.error('Missing R2 credentials in .env — set R2_ACCOUNT_ID (or R2_S3_ENDPOINT), ' +
                      'R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY. ' +
                      'The token must be able to write to the ' + BUCKET + ' bucket.');
        return 1;
    }

    const s3 = apply ? new S3Client({
        region: 'auto',
        endpoint: ENDPOINT,
        credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    }) : null;

    console.log((apply ? 'PUBLISHING' : 'DRY RUN — nothing is uploaded') +
                '  ·  ' + days + ' day(s) from ' + start + '  ·  bucket ' + BUCKET + '\n');

    let uploaded = 0, bytes = 0, failed = 0;
    for (const stationId of stations) {
        let pool;
        try {
            pool = await ensurePool(stationId, rebuild);
        } catch (err) {
            console.log(stationId.padEnd(14) + '  pool FAILED: ' + err.message);
            failed++;
            continue;
        }

        let written;
        try {
            written = buildSchedule({
                station: stationId, date: start, days: days,
                pool: pool.file, out: STAGE_DIR, cdnBase: CDN_BASE,
                forceCdnBase: argv.includes('--force-cdn-base'),
            });
        } catch (err) {
            console.log(stationId.padEnd(14) + '  schedule FAILED: ' + err.message);
            failed++;
            continue;
        }

        console.log(stationId + '  (' + (tenants.load(stationId) || {}).name + ')' +
                    (pool.built ? '  [pool rebuilt]' : ''));
        for (const w of written) {
            const key = w.key;   // tenants.deliveryKey() — one definition, see tools/lib/tenants.js
            const body = fs.readFileSync(w.file);
            const cc = cacheControlFor(w.date);
            if (apply) {
                try {
                    await s3.send(new PutObjectCommand({
                        Bucket: BUCKET, Key: key, Body: body,
                        ContentType: 'application/json; charset=utf-8',
                        CacheControl: cc,
                    }));
                    uploaded++; bytes += body.length;
                } catch (err) {
                    console.log('   ! ' + key + '  ' + err.message);
                    failed++;
                    continue;
                }
            }
            console.log('   ' + (apply ? '→' : ' ') + ' ' + key +
                        '  ' + String(w.entries).padStart(4) + ' entries' +
                        '  ' + (body.length / 1024).toFixed(0).padStart(4) + ' KB' +
                        // The REAL header, not a guess at it. This printed a
                        // hardcoded 'max-age=3600' for anything non-immutable, so a
                        // change to the cache policy was invisible in the log that
                        // exists to show it.
                        '  ' + cc.replace('public, ', '') +
                        '  rev ' + (w.doc && w.doc.rev ? w.doc.rev : '?'));
        }
    }

    console.log('\n' + (apply
        ? uploaded + ' file(s) uploaded, ' + (bytes / 1024).toFixed(0) + ' KB total'
        : 'dry run complete — re-run with --apply to publish'));
    if (failed) console.log(failed + ' failure(s)');
    if (apply && uploaded) {
        console.log('verify:  curl -sI ' + tenants.deliveryUrl(stations[0], start, CDN_BASE));
    }
    return failed ? 1 : 0;
}

if (require.main === module) {
    main(process.argv.slice(2)).then(c => process.exit(c)).catch(e => {
        console.error(e);
        process.exit(1);
    });
}

module.exports = { cacheControlFor, ensurePool };
