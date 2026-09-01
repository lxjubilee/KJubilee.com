#!/usr/bin/env node
/**
 * publish-album-player.js — put an album's standalone player on the website.
 *
 *   node tools/publish-album-player.js \
 *     --src "J:\jubileeprayers.com\cantillation\2-the-kingdom\JEIPX7133EN The Upper Room Experience\player.html" \
 *     --album JEIPX7133EN \
 *     --out public/prayers/upper-room.html
 *
 * ── WHY THIS IS NOT A COPY ──────────────────────────────────────────────────
 *
 * The authored player is built to run from inside the album folder: it sets
 * `AUDIO_BASE = "tracks/"` and names each song by its WORKING filename —
 * `01 Send the Fire on Every Shore.mp3`. Those names exist only on the music
 * share. Nothing in the catalogue is published under them, because the ingest
 * renames every track to its canonical SongID form:
 *
 *   01 Send the Fire on Every Shore.mp3
 *     -> HMX2026EN01-<SONGID>-PRAY-HCAH_the-upper-room-experience_send-the-fire…mp3
 *
 * So a straight copy would render perfectly and play nothing — 72 silent rows,
 * every one a 404, and no error anywhere on the page to say why. The file names
 * are rewritten here from the SongID ledger, which is the only thing that knows
 * which working title became which published object.
 *
 * Matched on TRACK NUMBER and not on title. The two disagree in the catalogue
 * already — track 68 is "Fire Across the Sahel" in the player and
 * "68 Light Across the Savannah.mp3" on disk — and a title match would silently
 * drop it. The number is the one thing both sides agree on.
 *
 * REFUSES TO WRITE unless every track maps. A player that is 71 songs correct
 * and one song wrong is worse than one that was never published, because the
 * gap is invisible until somebody presses the row.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REGISTRY = path.join(process.env.MUSIC_LOCAL_ROOT
    || path.join(process.env.CDN_LOCAL_ROOT || 'J:\\kjubilee.com', 'music'), 'songid-registry.tsv');
const CDN = process.env.KJ_CDN_URL || 'https://cdn.kjubilee.com';

function arg(name, fallback) {
    const i = process.argv.indexOf('--' + name);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const SRC = arg('src', null);
const ALBUM = arg('album', null);
const OUT = arg('out', null);
const DRY = process.argv.indexOf('--dry-run') > 0;

if (!SRC || !ALBUM || !OUT) {
    console.error('usage: --src <player.html> --album <CODE> --out <public/path.html>');
    process.exit(2);
}

// ── the ledger: track number -> published filename ──────────────────────
const rows = fs.readFileSync(REGISTRY, 'utf8').split(/\r?\n/).slice(1)
    .filter(Boolean).map(l => l.split('\t'))
    .filter(r => r[3] === ALBUM);

if (!rows.length) { console.error('no ledger rows for ' + ALBUM); process.exit(1); }

const byTrack = new Map();
let artistSlug = '', albumSlug = '';
for (const r of rows) {
    const n = parseInt(r[5], 10);
    if (!byTrack.has(n)) byTrack.set(n, r[1]);      // Filename
    artistSlug = artistSlug || r[2];
    albumSlug = albumSlug || r[4];
}
console.log(ALBUM + ': ' + byTrack.size + ' track(s) in the ledger');

/* The folder the ingest publishes into: <artist>/<lang>/<album-slug>. Language
   is taken off the filename rather than assumed, because this album is 72
   languages sung by one act and the LEDGER language is the act's, not the
   song's. */
const sample = byTrack.get([...byTrack.keys()][0]) || '';
const langM = /^HMX\d{4}([A-Z]{2})/.exec(sample);
const lang = (langM ? langM[1] : 'EN').toLowerCase();
const BASE = CDN + '/music/' + artistSlug + '/' + lang + '/' + albumSlug + '/';
console.log('audio base: ' + BASE);

// ── rewrite ─────────────────────────────────────────────────────────────
let html = fs.readFileSync(SRC, 'utf8');

/* ── THE DECLARATION, NOT THE EXAMPLE ────────────────────────────────────
   The source file explains how to point the player at a CDN, and the
   explanation is itself a line of code inside a comment:

       To serve from the CDN instead, set AUDIO_BASE to the published folder URL,
         const AUDIO_BASE = "https://cdn.example.com/upper-room/tracks/";
     const AUDIO_BASE = "tracks/";          <- the real one

   A first-match replace rewrites the COMMENT and leaves the real declaration
   saying "tracks/", so every request goes to a relative path that does not
   exist on the website. The page still renders, the row still highlights, the
   artwork still animates — and nothing plays, with the failure swallowed by
   the player's own .catch(). That shipped once.

   The real declaration is the one at the start of a line; the example is
   indented inside the comment. Anchor on that, and then PROVE it. */
const decls = [...html.matchAll(/^const AUDIO_BASE = "([^"]*)";/gm)];
if (decls.length !== 1) {
    console.error('expected exactly one top-level AUDIO_BASE declaration, found '
        + decls.length + ' — refusing to guess which one runs.');
    process.exit(1);
}
html = html.replace(decls[0][0], 'const AUDIO_BASE = ' + JSON.stringify(BASE) + ';');

// It must now be the CDN, and no relative base may survive at top level.
const after = [...html.matchAll(/^const AUDIO_BASE = "([^"]*)";/gm)];
if (after.length !== 1 || after[0][1] !== BASE) {
    console.error('AUDIO_BASE did not take: ' + JSON.stringify(after.map(m => m[1])));
    process.exit(1);
}
console.log('audio base set on the live declaration (' + decls.length + ' found, 1 rewritten)');

let mapped = 0;
const missing = [];
html = html.replace(/\{"n":(\d+),((?:[^{}]|\{[^{}]*\})*?)"file":"([^"]+)"/g,
    (whole, n, mid, file) => {
        const num = parseInt(n, 10);
        const real = byTrack.get(num);
        if (!real) { missing.push(num + '  ' + file); return whole; }
        mapped++;
        return '{"n":' + n + ',' + mid + '"file":' + JSON.stringify(real);
    });

console.log('rewrote ' + mapped + ' track filename(s)');
if (missing.length) {
    console.error('\nNOT IN THE LEDGER — refusing to publish a player with silent rows:');
    missing.forEach(m => console.error('   ' + m));
    process.exit(1);
}
if (mapped !== byTrack.size) {
    console.error('\nmapped ' + mapped + ' but the ledger holds ' + byTrack.size
        + ' — the page and the album disagree; refusing to publish.');
    process.exit(1);
}

// A published page is a site page: let it be found, and let it say where it is.
html = html.replace(/<title>([^<]*)<\/title>/,
    '<title>$1 — kJubilee</title>');

if (DRY) { console.log('\ndry run — nothing written'); process.exit(0); }

const dest = path.join(ROOT, OUT);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, html);
console.log('\nwrote ' + OUT + '  (' + (html.length / 1024).toFixed(0) + ' KB)');
