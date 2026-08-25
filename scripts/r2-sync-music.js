#!/usr/bin/env node
/**
 * r2-sync-music.js — incremental sync of the kJubilee music repository
 * (J:/kjubilee.com/music) to the R2 bucket kjubilee-music under prefix music/,
 * which is what cdn.kjubilee.com serves.
 *
 * Usage:
 *   node .claude/r2-sync-music.js              # diff-only (default, safe)
 *   node .claude/r2-sync-music.js --apply      # actually upload missing/changed files
 *   node .claude/r2-sync-music.js --apply --concurrency=8
 *
 * Filter mirrors .claude/r2-upload.filter:
 *   include: albums/**, videos/**, catalog*.json, catalog*.html, index*.html
 *   exclude: desktop.ini, Thumbs.db, .DS_Store, FINAL-*.md, *REPORT*.md, *RENAME*.md, status/report markdown, *.log
 */

const fs = require('node:fs');
const path = require('node:path');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

// Minimal .env reader (no dotenv dep)
function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv(path.join(__dirname, '..', '.env'));

// The kJubilee music repository, and the bucket cdn.kjubilee.com fronts.
// Everything that airs must be a kJubilee-owned copy served from this bucket —
// see docs/MUSIC-REPOSITORY-SPEC.md §1a. Overridable for one-off syncs.
const LOCAL_ROOT = process.env.MUSIC_LOCAL_ROOT || 'J:/kjubilee.com/music';
const R2_PREFIX = process.env.R2_PREFIX || 'music/';
const BUCKET = process.env.R2_BUCKET || process.env.R2_BUCKET_CDN || 'kjubilee-music';
const ENDPOINT = process.env.R2_S3_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? 'https://' + process.env.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com' : null);
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!ENDPOINT || !ACCESS_KEY || !SECRET_KEY) {
  console.error('Missing R2 credentials in .env — set R2_ACCOUNT_ID (or R2_S3_ENDPOINT), ' +
                'R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY. ' +
                'The token must be able to write to the ' + BUCKET + ' bucket.');
  process.exit(2);
}

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const concurrencyArg = argv.find(a => a.startsWith('--concurrency='));
const CONCURRENCY = concurrencyArg ? Math.max(1, Number(concurrencyArg.split('=')[1])) : 6;

const MIME = {
  '.mp3':  'audio/mpeg',
  '.m4a':  'audio/mp4',
  '.aac':  'audio/aac',
  '.wav':  'audio/wav',
  '.flac': 'audio/flac',
  '.ogg':  'audio/ogg',
  '.json': 'application/json',
  '.html': 'text/html; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8'
};

const EXCLUDE_BASENAMES = new Set(['desktop.ini', 'Thumbs.db', '.DS_Store', '_stage_run.log', '_quick-manifest.js']);
const EXCLUDE_PATTERNS = [
  /^FINAL-.*\.md$/i,
  /REPORT.*\.md$/i,
  /RENAME.*\.md$/i,
  /^MISSING_ASSETS\.md$/i,
  /^MP3_POLISHING_GUIDE\.md$/i,
  /^JUBILEE-COMPLETE-SUMMARY.*\.md$/i,
  /^PROJECT-STATUS-.*\.md$/i,
  /^SESSION-COMPLETION-.*\.md$/i,
  /^REN_.*\.md$/i,
  /^music-album-titles\.md$/i,
  /\.log$/i
];

// The kJubilee repository is <artist>/<lang>/<album>/HMX....mp3 plus the album.json
// sidecar beside each one, and songid-registry.tsv at the root. There is no
// albums/ or videos/ tier here — that was the shape of the upstream jubileeverse
// tree this script used to sync, and matching on it silently excluded all 6,705
// files. Include by what a file IS, not where it sits.
function isIncluded(relPath) {
  const basename = path.basename(relPath);
  if (EXCLUDE_BASENAMES.has(basename)) return false;
  if (EXCLUDE_PATTERNS.some(re => re.test(basename))) return false;
  // Canonical audio — the only thing a station actually plays.
  if (/^HMX\d{4}[A-Z]{2}\d{2}-[A-Z0-9]{12}-[A-Z0-9]{4}-[A-Z]{4}_.+\.mp3$/.test(basename)) return true;
  // Per-album provenance + descriptions, and the SongID ledger.
  if (basename === 'album.json') return true;
  if (basename === 'songid-registry.tsv') return true;
  return false;
}

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}

function bytesH(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function mimeFor(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: ENDPOINT,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  forcePathStyle: false
});

async function listAllR2() {
  const map = new Map();
  let token = undefined;
  let pages = 0;
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: R2_PREFIX, ContinuationToken: token, MaxKeys: 1000
    }));
    for (const obj of res.Contents || []) {
      map.set(obj.Key, { size: obj.Size, etag: obj.ETag, lastModified: obj.LastModified });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
    pages++;
    process.stdout.write(`\r  R2 list: ${map.size} keys (${pages} pages)`);
  } while (token);
  process.stdout.write('\n');
  return map;
}

function scanLocal() {
  const out = [];
  const skipped = { excluded: 0, hidden: 0 };
  for (const abs of walk(LOCAL_ROOT)) {
    const rel = path.relative(LOCAL_ROOT, abs).replace(/\\/g, '/');
    if (rel.split('/').some(p => p.startsWith('.'))) { skipped.hidden++; continue; }
    if (!isIncluded(rel)) { skipped.excluded++; continue; }
    let st;
    try { st = fs.statSync(abs); } catch { continue; }
    out.push({ key: R2_PREFIX + rel, abs, size: st.size, mtimeMs: st.mtimeMs, mime: mimeFor(abs) });
  }
  return { files: out, skipped };
}

async function uploadOne(file) {
  const stream = fs.createReadStream(file.abs);
  const u = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET,
      Key: file.key,
      Body: stream,
      ContentType: file.mime,
      CacheControl: (file.key.endsWith('.json') || file.key.endsWith('.html'))
        ? 'public, max-age=60'
        : 'public, max-age=31536000, immutable'
    },
    queueSize: 4,
    partSize: 8 * 1024 * 1024
  });
  await u.done();
}

async function main() {
  console.log('=== r2-sync-music ===');
  console.log(`Bucket:      ${BUCKET}`);
  console.log(`Prefix:      ${R2_PREFIX}`);
  console.log(`Local root:  ${LOCAL_ROOT}`);
  console.log(`Mode:        ${APPLY ? 'APPLY (uploads will happen)' : 'DIFF-ONLY (no writes)'}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('');

  console.log('Listing R2...');
  const remote = await listAllR2();
  console.log(`R2 has ${remote.size} keys under ${R2_PREFIX}`);

  console.log('Scanning local...');
  const { files: local, skipped } = scanLocal();
  console.log(`Local has ${local.length} candidate files (skipped ${skipped.excluded} excluded, ${skipped.hidden} hidden)`);

  const missing = [];
  const sizeMismatch = [];
  const upToDate = [];
  for (const f of local) {
    const r = remote.get(f.key);
    if (!r) missing.push(f);
    else if (r.size !== f.size) sizeMismatch.push({ ...f, remoteSize: r.size });
    else upToDate.push(f);
  }

  const orphanOnR2 = [];
  const localKeys = new Set(local.map(f => f.key));
  for (const k of remote.keys()) if (!localKeys.has(k)) orphanOnR2.push(k);

  console.log('');
  console.log('=== DIFF ===');
  console.log(`Up-to-date:        ${upToDate.length}`);
  console.log(`Missing on R2:     ${missing.length}  (${bytesH(missing.reduce((s, f) => s + f.size, 0))})`);
  console.log(`Size mismatch:     ${sizeMismatch.length}  (local: ${bytesH(sizeMismatch.reduce((s, f) => s + f.size, 0))})`);
  console.log(`Orphan on R2:      ${orphanOnR2.length}  (present on R2, absent locally; NOT deleted)`);

  const toUpload = [...missing, ...sizeMismatch];
  const totalBytes = toUpload.reduce((s, f) => s + f.size, 0);
  console.log('');
  console.log(`PLAN: upload ${toUpload.length} files (${bytesH(totalBytes)})`);

  // Mismatches are listed IN FULL, unlike the missing files. A missing file is
  // routine — it is what an ingest produces. A file whose local size no longer
  // matches the copy already on R2 means one of the two changed after the fact,
  // and which files those are is the whole question. Burying them at position
  // 367 of a "first 15" list is how a re-mastered or truncated track ships
  // unnoticed.
  if (sizeMismatch.length) {
    console.log('');
    console.log(`Size mismatches (${sizeMismatch.length}) — local vs R2:`);
    sizeMismatch.forEach(f => console.log(
      `  ! ${f.key}
      local ${f.size} B   R2 ${f.remoteSize} B   (${f.size - f.remoteSize > 0 ? '+' : ''}${f.size - f.remoteSize})`));
  }

  if (toUpload.length) {
    console.log('');
    console.log('First 15 to upload:');
    toUpload.slice(0, 15).forEach(f => console.log(`  + ${f.key}  (${bytesH(f.size)})`));
  }
  if (orphanOnR2.length) {
    console.log('First 5 orphans on R2 (not deleted):');
    orphanOnR2.slice(0, 5).forEach(k => console.log(`  ~ ${k}`));
  }

  if (!APPLY) {
    console.log('');
    console.log('Diff-only mode. Re-run with --apply to upload.');
    process.exit(0);
  }

  if (toUpload.length === 0) {
    console.log('Nothing to upload. CDN is in sync.');
    process.exit(0);
  }

  console.log('');
  console.log(`Uploading ${toUpload.length} files with concurrency=${CONCURRENCY}...`);
  let done = 0, failed = 0, bytesDone = 0;
  const t0 = Date.now();
  const queue = toUpload.slice();
  const failures = [];

  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      if (!f) return;
      try {
        await uploadOne(f);
        done++;
        bytesDone += f.size;
      } catch (e) {
        failed++;
        failures.push({ key: f.key, err: e.message || String(e) });
      }
      if ((done + failed) % 10 === 0 || done + failed === toUpload.length) {
        const el = (Date.now() - t0) / 1000;
        const mbps = (bytesDone / 1024 / 1024 / Math.max(el, 1)).toFixed(2);
        process.stdout.write(`\r  progress: ${done + failed}/${toUpload.length}  ok=${done}  fail=${failed}  ${bytesH(bytesDone)}  ${mbps} MB/s  t=${el.toFixed(0)}s`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  process.stdout.write('\n');
  console.log('');
  console.log(`=== RESULT === uploaded: ${done}, failed: ${failed}, bytes: ${bytesH(bytesDone)}`);
  if (failures.length) {
    const fp = path.join(__dirname, 'r2-sync-failures.txt');
    fs.writeFileSync(fp, failures.map(f => `${f.key}\t${f.err}`).join('\n') + '\n');
    console.log(`Failures written to ${fp}`);
    process.exit(1);
  }
  console.log('All uploads succeeded.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });