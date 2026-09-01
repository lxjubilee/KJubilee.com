#!/usr/bin/env node
/* publish-artist-audio.js - upload ONE artist's tracks to the CDN.
 *
 *   node tools/publish-artist-audio.js jubilee-prayers
 *
 * Upload ONE artist's tracks to R2.
 *
 * r2-sync-music.js syncs the whole music root and has no way to scope it, and
 * right now the root also holds seven stray Torah Sings files from a bad ingest
 * that has not been repaired yet. Pushing those would put objects on the CDN
 * that no manifest references and that would have to be deleted again, so this
 * uploads only what was asked for: jubilee-prayers.
 *
 * Same bucket, same key shape and the same skip-if-identical rule the real sync
 * uses — this is a narrower door into the same room, not a different room.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const ROOT = 'W:/kJubilee.com';
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const ARTIST = process.argv[2] || 'jubilee-prayers';
const MUSIC = 'J:/kjubilee.com/music';
const BUCKET = process.env.R2_BUCKET || process.env.R2_BUCKET_CDN || 'kjubilee-music';
const ENDPOINT = process.env.R2_S3_ENDPOINT ||
    'https://' + process.env.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com';

const s3 = new S3Client({
    region: 'auto', endpoint: ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

function walk(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(mp3|json)$/i.test(e.name)) out.push(p);
    }
    return out;
}

(async () => {
    const base = path.join(MUSIC, ARTIST);
    if (!fs.existsSync(base)) throw new Error('no such artist folder: ' + base);
    const files = walk(base, []);
    console.log(ARTIST + ': ' + files.length + ' local file(s)');

    let up = 0, same = 0, failed = 0, bytes = 0;
    let i = 0;
    const worker = async () => {
        for (;;) {
            const k = i++;
            if (k >= files.length) return;
            const f = files[k];
            const key = 'music/' + path.relative(MUSIC, f).split(path.sep).join('/');
            const body = fs.readFileSync(f);
            // Skip what is already there and identical, exactly as the full
            // sync does — re-uploading 500MB to publish 22 files helps nobody.
            try {
                const h = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
                if (Number(h.ContentLength) === body.length) { same++; continue; }
            } catch (e) { /* absent: upload it */ }
            try {
                await s3.send(new PutObjectCommand({
                    Bucket: BUCKET, Key: key, Body: body,
                    ContentType: /\.mp3$/i.test(f) ? 'audio/mpeg' : 'application/json',
                }));
                up++; bytes += body.length;
                if (up % 10 === 0) console.log('  uploaded ' + up + '…');
            } catch (e) { failed++; console.error('  FAILED ' + key + ': ' + e.message); }
        }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    console.log('\nuploaded: ' + up + '  already present: ' + same + '  failed: ' + failed
        + '  ' + (bytes / 1048576).toFixed(1) + ' MB');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(2); });
