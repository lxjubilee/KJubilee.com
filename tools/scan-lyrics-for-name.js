#!/usr/bin/env node
/**
 * scan-lyrics-for-name.js — find every song that SINGS a given name.
 *
 *   node tools/scan-lyrics-for-name.js --name Yeshua --out data/yeshua-selection.json
 *   node tools/scan-lyrics-for-name.js --name Yeshua --artists jubilee-inspire,caleb-inspire
 *
 * WHY THIS EXISTS
 *
 * HM 304.80 Celebrate Yeshua! is a station defined by a WORD, not by an artist,
 * a genre or a label. Nothing in the ledger records which songs sing "Yeshua"
 * rather than "Jesus" — the registry carries titles, and not one title of the
 * Inspire Family contains the name. The only place the answer exists is the
 * lyric sheets, so that is what this reads.
 *
 * IT IS A TOOL RATHER THAN A ONE-OFF ANSWER because the answer moves. Most of
 * the songs that sing the name have no audio yet: five whole albums are
 * `lyrics_only_pending_audio`. Re-run this after any ingest and the selection
 * grows on its own, which is the difference between a station that improves
 * as the catalogue fills and a hand-typed list that quietly goes stale.
 *
 * WHAT IT WRITES
 *
 *   songIds  every track that sings the name AND has audio — a `select.songs`
 *            list, exact to the song.
 *   albums   the albums those tracks live in, filtered to ones with audio — a
 *            `select.albums` list for a station that would rather play a whole
 *            record than six tracks out of four.
 *   pending  tracks that sing the name but have no audio. Not a failure; the
 *            reason the numbers look thin, written down so it is visible.
 *
 * A NOTE ON COUNTING. Every song block in a lyric sheet ends with a metadata
 * trailer whose "Song Title:" line repeats the heading in title case, so the
 * split has to be case-sensitive or every track counts twice. And a few album
 * folders hold two sheets for the same twelve tracks — an older sheet left
 * beside its renamed copy — so tracks are deduped on album + number + title.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* Where the lyric sheets and the ledger live. The lyric sheets are in the
   SOURCE tree (jubilujah.com) because they are authoring artefacts and never
   ship; the ledger is in the broadcast repository, which is what decides
   whether a song can actually be aired. */
const LYRIC_ROOT = process.env.LYRIC_ROOT || 'J:/jubilujah.com/music/inspire';
const REGISTRY = process.env.MUSIC_REGISTRY || 'J:/kjubilee.com/music/songid-registry.tsv';

function arg(flag, fallback) {
    const i = process.argv.indexOf(flag);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const NAME = arg('--name', 'Yeshua');
const OUT = arg('--out', path.join('data', NAME.toLowerCase() + '-selection.json'));
const ARTISTS = arg('--artists',
    'jubilee-inspire,melody-inspire,caleb-inspire,nova-inspire').split(',').map(s => s.trim()).filter(Boolean);

/* "Sings Yeshua INSTEAD OF Jesus" is the distinction the station is named for,
   so a song carrying both names is tracked separately and can be excluded. */
const ALSO = arg('--also', 'Jesus');
const ONLY = process.argv.indexOf('--only') > 0;

const RE_NAME = new RegExp('\\b' + NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
const RE_ALSO = ALSO ? new RegExp('\\b' + ALSO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i') : null;

// ── the ledger ───────────────────────────────────────────────────────────────
if (!fs.existsSync(REGISTRY)) {
    console.error('registry not found: ' + REGISTRY +
        '\nSet MUSIC_REGISTRY, or mount the music repository.');
    process.exit(1);
}
const byAlbumTrack = new Map();
const albumsWithAudio = new Set();
for (const line of fs.readFileSync(REGISTRY, 'utf8').split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const c = line.split('\t');
    const row = { songId: c[0], artist: c[2], album: c[3], track: parseInt(c[5], 10), title: c[6], lang: c[9] };
    byAlbumTrack.set(row.album + '|' + row.track, row);
    albumsWithAudio.add(row.album);
}

// ── the lyric sheets ─────────────────────────────────────────────────────────
function walk(dir, out) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/lyric.*\.md$/i.test(e.name)) out.push(p);
    }
    return out;
}

const hits = [];
const seen = new Set();
let sheets = 0, songs = 0, dupes = 0;

for (const artist of ARTISTS) {
    for (const file of walk(path.join(LYRIC_ROOT, artist), [])) {
        sheets++;
        const m = file.replace(/\\/g, '/').match(/\/([A-Z]{2}[A-Z0-9]{2}\d{4}[A-Z]{2})-/);
        const album = m ? m[1] : null;
        if (!album) continue;

        let text;
        try { text = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }

        // CASE-SENSITIVE: the trailing "Song Title:" of each block is metadata,
        // not a second song. See the note at the top of this file.
        for (const part of text.split(/^SONG TITLE:/m).slice(1)) {
            songs++;
            if (!RE_NAME.test(part)) continue;

            const head = part.split(/\r?\n/)[0].trim();
            const track = parseInt((head.match(/^(\d{1,2})\b/) || [])[1], 10);
            const title = head.replace(/^\d{1,2}\s*[-.]?\s*/, '').trim();
            if (!track) continue;

            const key = album + '|' + track + '|' + title.toLowerCase();
            if (seen.has(key)) { dupes++; continue; }
            seen.add(key);

            const both = RE_ALSO ? RE_ALSO.test(part) : false;
            if (ONLY && both) continue;

            const reg = byAlbumTrack.get(album + '|' + track) || null;
            hits.push({
                artist, album, track, title, both,
                songId: reg ? reg.songId : null,
                lang: album.slice(-2),
            });
        }
    }
}

// ── the selection ────────────────────────────────────────────────────────────
const withAudio = hits.filter(h => h.songId);
const pending = hits.filter(h => !h.songId);

/* Whole albums, not loose tracks. A station built on the six tracks that happen
   to have audio repeats every twenty minutes; the four complete records those
   tracks came from carry an afternoon. Only albums the ledger actually holds —
   an album with no audio would name nothing. */
const albums = [...new Set(withAudio.map(h => h.album))].filter(a => albumsWithAudio.has(a)).sort();

const doc = {
    _generated: 'tools/scan-lyrics-for-name.js — do not edit by hand',
    name: NAME,
    artists: ARTISTS,
    scanned: { sheets, songs, duplicateSheetTracks: dupes },
    counts: {
        singingTheName: hits.length,
        nameOnly: hits.filter(h => !h.both).length,
        bothNames: hits.filter(h => h.both).length,
        withAudio: withAudio.length,
        pendingAudio: pending.length,
    },
    albums,
    songIds: withAudio.map(h => h.songId).sort(),
    songs: hits.map(h => ({
        songId: h.songId, album: h.album, track: h.track,
        title: h.title, lang: h.lang, bothNames: h.both,
    })).sort((a, b) => a.album.localeCompare(b.album) || a.track - b.track),
};

const outPath = path.isAbsolute(OUT) ? OUT : path.join(ROOT, OUT);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');

console.log('scanned ' + sheets + ' lyric sheets, ' + songs + ' songs (' + dupes + ' duplicate-sheet tracks skipped)');
console.log('sings "' + NAME + '": ' + hits.length +
    '  (' + doc.counts.nameOnly + ' without "' + ALSO + '", ' + doc.counts.bothNames + ' with both)');
console.log('  with audio  : ' + withAudio.length + ' tracks across ' + albums.length + ' albums');
console.log('  pending     : ' + pending.length + ' tracks, no audio ingested yet');
if (pending.length) {
    const byAlbum = {};
    pending.forEach(p => { byAlbum[p.album] = (byAlbum[p.album] || 0) + 1; });
    console.log('    ' + Object.entries(byAlbum).sort()
        .map(([k, v]) => k + '(' + v + ')').join(' '));
}
console.log('albums for select: ' + albums.join(', '));
console.log('wrote ' + path.relative(ROOT, outPath));
