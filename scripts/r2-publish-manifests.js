#!/usr/bin/env node
/**
 * r2-publish-manifests.js — put each station's music.json on the CDN.
 *
 *   node scripts/r2-publish-manifests.js            # diff only (default)
 *   node scripts/r2-publish-manifests.js --apply    # upload
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * A station's manifest and its SCHEDULING POOL are the same artifact. The pool
 * cached at tmp/pools/<ID>.music.json is byte-for-byte the manifest written to
 * <CDN_LOCAL_ROOT>/radio/<ID>/delivery/music.json — same keys, same albums,
 * same per-track duration_s. r2-publish-schedules.js says as much in its own
 * error message, which tells you to build a manifest and save it AS the pool.
 *
 * Building one needs the music share, because it reads frame headers off
 * J:\kjubilee.com\music. That is why the nightly publish on the Linux host can
 * only ever READ pools someone shipped it, and why a station the host has no
 * pool for cannot be scheduled there at all.
 *
 * On 2026-08-29 that was not a theoretical limit. The scheduler's checkout knew
 * 41 stations against the dial's 43; Gospel By Music had never had a single day
 * file published, and the station simply would not play. Nothing detected it,
 * because everything that could have detected it was reading the same stale
 * list.
 *
 * Publishing manifests to the CDN breaks that circle. Once a station's manifest
 * is at a public address, ANY machine can fetch it, write it as a pool, and
 * schedule that station — without the music share and without waiting for
 * somebody to remember to copy tmp/pools/ across. That is what lets
 * scripts/kj-watchdog.js repair a station it has never heard of, which is the
 * one repair that actually matters.
 *
 * Manifests change only when the catalogue does, so this belongs with Phase 2
 * of setup/import-refresh.md, not on a timer.
 */
const fs = require('node:fs');
const path = require('node:path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const ROOT = path.resolve(__dirname, '..');

// Minimal .env reader — same shape as r2-publish-schedules.js and r2-sync-music.js.
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
const CDN_ROOT = process.env.CDN_LOCAL_ROOT || 'J:\\kjubilee.com';
const RADIO_ROOT = path.join(CDN_ROOT, 'radio');

const apply = process.argv.includes('--apply');
const only = (function () {
    const i = process.argv.indexOf('--station');
    return i >= 0 ? process.argv[i + 1] : null;
})();

/* max-age is a day. A manifest changes only on an ingest or a station edit, and
   the watchdog re-fetches on demand rather than polling, so a long cache costs
   nothing and keeps the repair path off the origin. */
const CACHE = 'public, max-age=86400';

(async () => {
    if (!fs.existsSync(RADIO_ROOT)) {
        console.error('no delivery tree at ' + RADIO_ROOT + ' — run tools/build-station-manifest.js --all first');
        process.exit(2);
    }
    const ids = fs.readdirSync(RADIO_ROOT)
        .filter((d) => /^HM\d{3}\.\d{2}-[A-Z]{2}$/.test(d))
        .filter((d) => !only || d === only)
        .sort();

    if (!ids.length) { console.error('no stations found' + (only ? ' matching ' + only : '')); process.exit(2); }

    const s3 = apply ? new S3Client({
        region: 'auto',
        endpoint: ENDPOINT,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    }) : null;

    console.log((apply ? 'PUBLISHING' : 'DRY RUN — nothing is uploaded')
        + '  ·  ' + ids.length + ' station(s)  ·  bucket ' + BUCKET + '\n');

    let sent = 0, bytes = 0, skipped = 0, failed = 0;
    for (const id of ids) {
        const local = path.join(RADIO_ROOT, id, 'delivery', 'music.json');
        if (!fs.existsSync(local)) { console.log('  --  ' + id.padEnd(14) + 'no manifest built'); skipped++; continue; }
        const body = fs.readFileSync(local);
        let tracks = '?';
        try { tracks = String((JSON.parse(body.toString('utf8')).totals || {}).tracks); } catch (e) { /* report anyway */ }
        const key = 'radio/' + id + '/delivery/music.json';

        if (!apply) {
            console.log('      ' + id.padEnd(14) + String(tracks).padStart(5) + ' tracks   '
                + (body.length / 1024).toFixed(0).padStart(4) + ' KB   ' + key);
            bytes += body.length; sent++;
            continue;
        }
        try {
            await s3.send(new PutObjectCommand({
                Bucket: BUCKET, Key: key, Body: body,
                ContentType: 'application/json; charset=utf-8',
                CacheControl: CACHE,
            }));
            console.log('   →  ' + id.padEnd(14) + String(tracks).padStart(5) + ' tracks   '
                + (body.length / 1024).toFixed(0).padStart(4) + ' KB   ' + key);
            sent++; bytes += body.length;
        } catch (err) {
            console.error('   ✗  ' + id + '  ' + (err && err.message));
            failed++;
        }
    }

    console.log('\n' + (apply ? sent + ' manifest(s) uploaded, ' : sent + ' manifest(s) would upload, ')
        + (bytes / 1024).toFixed(0) + ' KB'
        + (skipped ? '  ·  ' + skipped + ' skipped' : '')
        + (failed ? '  ·  ' + failed + ' FAILED' : ''));
    if (!apply) console.log('dry run — re-run with --apply to publish.');
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
