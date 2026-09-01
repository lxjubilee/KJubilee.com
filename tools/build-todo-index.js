#!/usr/bin/env node
/**
 * build-todo-index.js — writes the index behind /analytics/todo.html, the page
 * that answers ONE question: which written songs are still waiting for an mp3.
 *
 *   node tools/build-todo-index.js              # write it
 *   node tools/build-todo-index.js --dry-run    # print the summary only
 *   node tools/build-todo-index.js --no-lyrics  # index only, skip the bundles
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The catalogue is written far ahead of what is recorded. Roughly six hundred
 * album folders hold a finished lyric sheet and an empty `tracks/` directory —
 * a record that exists as words and has never been rendered. Nothing in this
 * repository could name them. The ledger only knows songs that HAVE audio, the
 * manifests only carry what the ledger holds, and `/analytics/start.html` is
 * built on the manifests, so the entire waiting half of the catalogue was
 * invisible to every tool we had. The only place the answer exists is the
 * source trees, which is what this reads.
 *
 * THE THREE STATES A WRITTEN TRACK CAN BE IN, and why all three are counted:
 *
 *   needs-audio  a lyric sheet, no mp3 anywhere. THE TODO. This is the number
 *                the page leads with and the reason it exists.
 *   recorded     an mp3 sits in the source `tracks/` folder and the ledger has
 *                never seen it. Not a writing job — an INGEST job, one command
 *                away from airing, and worth separating precisely because it is
 *                so cheap to finish. See setup/import-refresh.md Phase 1.
 *   ingested     in songid-registry.tsv. Done. Counted only so the fractions on
 *                the page mean something.
 *
 * WHY IT IS STATION-SHAPED. A count of six hundred unrecorded albums is not
 * actionable; "Melody's Sparkle is 22 of 84 recorded" is. Every album is run
 * through the SAME selection rules the manifest builder uses — `tools/build-
 * station-manifest.js` exports STATIONS and this imports it, so a station's
 * todo list cannot drift from what that station will actually play once the
 * audio lands. An album matching no station is not dropped; it lands in the
 * `_unassigned` row, which is its own useful signal — a record nobody has
 * given a frequency to.
 *
 * ONE LIMIT, STATED PLAINLY. Selection by SongID cannot be evaluated against an
 * album that has no SongIDs yet, so a station curated track-by-track (HM304.80
 * Celebrate Yeshua!) sees only its album-level matches. Its written backlog is
 * real and this page under-reports it. `select.pending` is the fix and is what
 * the other curated stations use.
 *
 * ── WHAT IT WRITES ──────────────────────────────────────────────────────────
 *
 *   public/data/todo-index.json      the dial, the album rows, the counts.
 *                                    Small, ships with public/data.
 *   <CDN_LOCAL_ROOT>/lyrics/<CODE>.json
 *                                    one bundle per album: every track's lyric
 *                                    body, its Styles prompt and its metadata
 *                                    trailer.
 *
 * THE BUNDLES ARE NOT IN public/. Sixty megabytes of lyric sheets do not belong
 * in a git repository that is deployed as a tarball, and they are exactly the
 * shape the CDN already serves — the analytics console fetches station
 * manifests and voice scripts from `/cdn/...` the same way. Everything under
 * `/cdn/` that is not `/cdn/music/` is Express static from CDN_LOCAL_ROOT, on
 * this workstation `J:\kjubilee.com` and on the VPS `/var/www/kjubilee.com/
 * cdn-local`, so the bundles deploy by copying that one directory across.
 *
 * A bundle is rewritten only when its bytes change, so a re-run after one album
 * was edited touches one file and the deploy stays small.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CDN_ROOT = process.env.CDN_LOCAL_ROOT || 'J:\\kjubilee.com';
const MUSIC_ROOT = process.env.MUSIC_LOCAL_ROOT || path.join(CDN_ROOT, 'music');
const REGISTRY = path.join(MUSIC_ROOT, 'songid-registry.tsv');
const OUT_INDEX = path.join(ROOT, 'public', 'data', 'todo-index.json');
const OUT_LYRICS = path.join(CDN_ROOT, 'lyrics');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const NO_LYRICS = argv.includes('--no-lyrics');

const { STATIONS } = require('./build-station-manifest.js');

/* ── The source trees ────────────────────────────────────────────────────
   Every tree that holds album folders with a `lyrics/` directory. These are
   AUTHORING trees on other properties, not this repository — the lyric sheet
   for a Gravel Road Gospel record lives on gravelroadgospel.com because that
   is where it was written.

   `artist` fixes the credit for a whole tree (one property, one act). Without
   it the credit is the first path segment under the root, which is how the
   Inspire tree and singitdone.com are laid out — a folder per persona. The
   slug MUST match the ledger's Artist column and the pool tables in
   build-station-manifest.js, or the album lands on no station. */
const TREES = [
    { root: 'J:\\jubilujah.com\\music\\inspire',        byArtistFolder: true },
    { root: 'J:\\singitdone.com\\music',                byArtistFolder: true },
    { root: 'J:\\cornercipher.com\\music',              byArtistFolder: true },
    { root: 'J:\\gopartygiggles.com\\music',            byArtistFolder: true },
    { root: 'J:\\mytinytiggles.com\\music',             byArtistFolder: true },
    { root: 'J:\\gravelroadgospel.com\\music',          artist: 'hollis-ferriday' },
    { root: 'J:\\gospelbymusic.com\\music',             artist: 'gospel-by-music' },
    { root: 'J:\\torahsings.com\\music',                artist: 'torah-sings' },
    { root: 'J:\\jubileeprayers.com\\cantillation',     artist: 'jubilee-prayers' },
];

/* An album folder is named `<CODE><separator><anything>`, and the separator is
   a dash on most properties and a SPACE on Torah Sings and Jubilee Prayers.
   The code itself is letters, digits, and an optional two-letter language tail:
   JEIM1001EN, ANSMX01001EN, GBMX4012EN, IX420EN, TTX302 (no language — the
   children's catalogues are English and the ledger records them as EN).

   The language tail is TWO letters everywhere except Cantonese, which the
   catalogue writes as the three-letter `YUE` — ISO 639-1 has no code for it.
   Matching only two dropped Caleb's two Cantonese records on the floor. */
const RE_ALBUM_DIR = /^([A-Z]{2,6}\d{3,5}(?:[A-Z]{2,3})?)[-_ ]/;
const RE_CODE = /^([A-Z]{2,6})(\d{3,5})([A-Z]{2,3})?$/;

function langOf(code) {
    const m = RE_CODE.exec(code);
    return (m && m[3]) || 'EN';
}

// ── The ledger ───────────────────────────────────────────────────────────
// What HAS audio. Keyed album+track because that tuple — not the title — is a
// track's stable identity; see docs/MUSIC-REPOSITORY-SPEC.md §2.
function readRegistry() {
    const byAlbumTrack = new Map();
    const artistOf = new Map();
    const raw = fs.readFileSync(REGISTRY, 'utf8').split(/\r?\n/);
    for (const line of raw.slice(1)) {
        if (!line.trim()) continue;
        const c = line.split('\t');
        const code = c[3], track = parseInt(c[5], 10);
        byAlbumTrack.set(code + '|' + track, { songId: c[0], title: c[6], lang: c[9] });
        artistOf.set(code, c[2]);
    }
    return { byAlbumTrack, artistOf };
}

// ── Walking a tree ───────────────────────────────────────────────────────
// An album is any directory holding a `lyrics/` child. Depth is bounded at
// three because every tree is at most <root>/<group>/<album>/ and an unbounded
// walk would descend into artwork and stem folders for no gain.
function findAlbums(dir, depth, out) {
    if (depth < 0) return out;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (const e of entries) {
        if (e.isDirectory() && e.name === 'lyrics') { out.push(dir); return out; }
    }
    for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
        findAlbums(path.join(dir, e.name), depth - 1, out);
    }
    return out;
}

function listFiles(dir) {
    try { return fs.readdirSync(dir); } catch (e) { return []; }
}

// ── The lyric sheet ──────────────────────────────────────────────────────
/* Every sheet on every property has the same spine: an album header, then one
   block per song introduced by `SONG TITLE:` at the start of a line, then the
   lyric body under `LYRICS:`, then the `Styles:` prompt and a metadata trailer.
   The trailer repeats the heading as `Song Title:` in title case — which is why
   the split MUST be case-sensitive, or every track is counted twice. */
function parseSheet(text) {
    const parts = text.split(/^SONG TITLE:/m);
    const header = parts[0].trim();
    const tracks = [];
    for (const part of parts.slice(1)) {
        const lines = part.split(/\r?\n/);
        const head = (lines.shift() || '').trim();
        const n = parseInt((head.match(/^(\d{1,3})\b/) || [])[1], 10);
        const title = head.replace(/^\d{1,3}\s*[-.:]?\s*/, '').trim();
        if (!n || !title) continue;

        // Above `LYRICS:` is the block's own header — ARTIST, ARCHETYPE, BEAT,
        // CASTING. Below it, the words.
        const iLyrics = lines.findIndex(l => /^LYRICS:\s*$/i.test(l.trim()));
        const intro = (iLyrics < 0 ? [] : lines.slice(0, iLyrics)).join('\n').trim();
        const body = (iLyrics < 0 ? lines.slice(0) : lines.slice(iLyrics + 1));

        // Drop the block separator the sheets put between songs.
        while (body.length && /^(-{3,}|\s*)$/.test(body[body.length - 1])) body.pop();

        /* The trailer starts at `Styles:` where there is one. Where there is
           not, walk back from the end over `Key: value` lines — a run of them
           at the foot of a block is metadata, never lyric. Lyric lines are
           prose or bracketed production cues and do not take that shape. */
        let cut = body.findIndex(l => /^Styles:/i.test(l));
        if (cut < 0) {
            cut = body.length;
            while (cut > 0) {
                const l = body[cut - 1];
                if (!l.trim() || /^[A-Za-z][^:]{0,48}:\s*\S/.test(l)) cut--;
                else break;
            }
            // An all-metadata block is a parse failure, not a song with no words.
            if (cut === 0) cut = body.length;
        }

        const lyrics = body.slice(0, cut).join('\n').replace(/\n{3,}/g, '\n\n').trim();
        const meta = [];
        let styles = null;
        let key = null, val = [];
        const flush = function () {
            if (!key) return;
            const v = val.join(' ').trim();
            if (/^styles$/i.test(key)) styles = v; else meta.push([key, v]);
            key = null; val = [];
        };
        for (const l of body.slice(cut)) {
            const m = /^([A-Za-z][^:]{0,48}):\s*(.*)$/.exec(l);
            if (m) { flush(); key = m[1].trim(); val = [m[2]]; }
            else if (key && l.trim()) val.push(l.trim());   // a Styles block wrapped over lines
            else flush();
        }
        flush();

        tracks.push({ n: n, title: title, intro: intro, lyrics: lyrics, styles: styles, meta: meta });
    }
    return { header: header, tracks: tracks };
}

/* Some albums keep an older sheet beside its renamed copy, so the same twelve
   tracks parse twice. The album-level `<Artist>-<Album>-lyrics.md` sheet is read
   first and wins; anything a second sheet repeats is counted and reported, never
   merged. */
function readAlbumLyrics(albumDir) {
    const dir = path.join(albumDir, 'lyrics');
    const files = listFiles(dir)
        .filter(function (f) { return /\.md$/i.test(f) && !/^blueprint\.md$/i.test(f); })
        .sort(function (a, b) {
            const rank = function (f) { return /-lyrics\.md$/i.test(f) ? 0 : 1; };
            return rank(a) - rank(b) || a.localeCompare(b);
        });

    const byNum = new Map();
    const sheets = [];
    let header = '';
    let dupes = 0;
    for (const f of files) {
        let text;
        try { text = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { continue; }
        const parsed = parseSheet(text);
        if (!parsed.tracks.length) continue;
        sheets.push({ file: f, tracks: parsed.tracks.length });
        if (!header) header = parsed.header;
        for (const t of parsed.tracks) {
            if (byNum.has(t.n)) { dupes++; continue; }
            // Which sheet this track was read out of. An album with two sheets
            // resolves per track, so "where is this song written down" has an
            // answer that names a file rather than a folder and a guess.
            t.file = f;
            byNum.set(t.n, t);
        }
    }
    const tracks = Array.from(byNum.values()).sort(function (a, b) { return a.n - b.n; });
    return { header: header, sheets: sheets, dupes: dupes, tracks: tracks };
}

// ── Collect every written album ──────────────────────────────────────────
function collect() {
    const reg = readRegistry();
    const byAlbumTrack = reg.byAlbumTrack;
    const artistOf = reg.artistOf;
    const albums = [];
    const problems = [];

    for (const tree of TREES) {
        if (!fs.existsSync(tree.root)) { problems.push('tree not mounted: ' + tree.root); continue; }
        for (const dir of findAlbums(tree.root, 3, [])) {
            const base = path.basename(dir);
            const m = RE_ALBUM_DIR.exec(base);
            if (!m) { problems.push('no album code in folder name: ' + dir); continue; }
            const code = m[1];

            let artist = tree.artist;
            if (!artist) artist = path.relative(tree.root, dir).split(path.sep)[0];
            // The ledger is the authority on credit wherever it has an opinion:
            // it is what the manifests and the pool tables are keyed on.
            if (artistOf.has(code)) artist = artistOf.get(code);

            const mp3 = new Set();
            for (const f of listFiles(path.join(dir, 'tracks'))) {
                const t = /^(\d{1,3})\D/.exec(f);
                if (/\.mp3$/i.test(f) && t) mp3.add(parseInt(t[1], 10));
            }

            const lyric = readAlbumLyrics(dir);
            const hasBlueprint = listFiles(path.join(dir, 'lyrics')).some(function (f) { return /^blueprint\.md$/i.test(f); })
                || listFiles(dir).some(function (f) { return /^blueprint\.md$/i.test(f); });

            let title = null;
            try {
                title = JSON.parse(fs.readFileSync(path.join(dir, 'album.meta.json'), 'utf8')).album_title || null;
            } catch (e) { /* most albums have no sidecar */ }
            if (!title) {
                const tail = base.slice(code.length + 1);
                title = tail.indexOf(' ') < 0
                    ? tail.split('-').map(function (w) { return w ? w[0].toUpperCase() + w.slice(1) : w; }).join(' ')
                    : tail;
            }

            const tracks = lyric.tracks.map(function (t) {
                const r = byAlbumTrack.get(code + '|' + t.n) || null;
                return {
                    n: t.n,
                    title: t.title,
                    status: r ? 'ingested' : (mp3.has(t.n) ? 'recorded' : 'needs-audio'),
                    songId: r ? r.songId : null,
                    intro: t.intro,
                    lyrics: t.lyrics,
                    styles: t.styles,
                    meta: t.meta,
                    sheet: t.file || null,
                };
            });

            // A track with audio and no lyric-sheet entry still exists. Count it
            // so an album never reads as smaller than it is.
            const covered = new Set(tracks.map(function (t) { return t.n; }));
            mp3.forEach(function (n) {
                if (covered.has(n)) return;
                const r = byAlbumTrack.get(code + '|' + n) || null;
                tracks.push({
                    n: n, title: r ? r.title : 'Track ' + n,
                    status: r ? 'ingested' : 'recorded',
                    songId: r ? r.songId : null,
                    intro: '', lyrics: '', styles: null, meta: [], sheet: null,
                });
            });
            tracks.sort(function (a, b) { return a.n - b.n; });

            const count = function (s) { return tracks.filter(function (t) { return t.status === s; }).length; };
            const first = byAlbumTrack.get(code + '|1');
            albums.push({
                code: code, artist: artist, title: title,
                lang: first ? first.lang : langOf(code),
                /* THE ABSOLUTE PATH, carried rather than reconstructed. Three
                   of the nine trees file their albums under an intervening
                   book or group directory — torahsings.com/music/01_Genesis/,
                   gospelbymusic.com/music/40_matthew/, jubileeprayers.com/
                   cantillation/1-the-name/ — so `<property>/music/<folder>`
                   would be a wrong path for about a quarter of the catalogue,
                   and a wrong path is worse than none: it sends somebody to a
                   directory that does not exist and reads like a missing file. */
                dir: dir,
                folder: base,
                // The property the words were written on — the domain segment of
                // the root, not the drive letter. It is the only part of the path
                // that tells an operator whose tree to go and edit.
                property: (tree.root.split(/[\\/]/).filter(function (x) { return x.indexOf('.') > 0; })[0] || tree.root),
                sheets: lyric.sheets,
                duplicateSheetTracks: lyric.dupes,
                blueprint: hasBlueprint,
                header: lyric.header,
                tracks: tracks,
                counts: {
                    tracks: tracks.length,
                    needs: count('needs-audio'),
                    recorded: count('recorded'),
                    ingested: count('ingested'),
                },
            });
        }
    }
    /* ONE CODE, ONE ALBUM. A re-cut sometimes gets its own folder under the
       same album code — IMIM1009EN is both `healing-streams` (recorded) and
       `healing-streams-river-pocket` (not). The ledger can only hold one, so
       counting both would invent twelve songs that need an mp3 for a record
       that is already finished. The folder furthest along wins; the other is
       reported rather than silently dropped, because a duplicate code is a
       thing somebody should go and resolve. */
    const best = new Map();
    for (const a of albums) {
        const rank = a.counts.ingested * 1e6 + a.counts.recorded * 1e3 + a.counts.tracks;
        const held = best.get(a.code);
        if (!held) { best.set(a.code, { a: a, rank: rank }); continue; }
        const loser = rank > held.rank ? held.a : a;
        if (rank > held.rank) best.set(a.code, { a: a, rank: rank });
        problems.push('duplicate album code ' + a.code + ' — ignoring ' + loser.folder);
    }
    const deduped = Array.from(best.values()).map(function (e) { return e.a; });
    deduped.sort(function (a, b) { return a.code.localeCompare(b.code); });
    return { albums: deduped, problems: problems };
}

// ── Which stations would carry it ────────────────────────────────────────
/* The same rules build-station-manifest.js applies to the ledger, applied to
   albums that are not in the ledger yet. Kept as one small function here rather
   than exported from there because that one filters ROWS — it needs a SongID
   and a language per track, and a written album has neither. What is shared is
   the STATIONS table it reads, which is the part that goes stale. */
const INSPIRE_FAMILY = new Set(['jubilee-inspire', 'melody-inspire', 'zariah-inspire',
    'elias-inspire', 'eliana-inspire', 'caleb-inspire', 'imani-inspire', 'zev-inspire',
    'amir-inspire', 'nova-inspire', 'santiago-inspire', 'tahoma-inspire']);
const CATALOGUES = new Set(['torah-sings', 'marcus-reed', 'radiant-stones', 'party-giggles',
    'tiny-tiggles', 'gospel-by-music', 'jubilee-prayers', 'hollis-ferriday']);

function inPool(poolName, artist) {
    if (poolName === 'inspire-family') return INSPIRE_FAMILY.has(artist);
    if (poolName === 'catalogues') return CATALOGUES.has(artist);
    if (poolName === 'all') return INSPIRE_FAMILY.has(artist) || CATALOGUES.has(artist);
    return false;
}

function takes(station, album, songIdsOnAlbum) {
    if (station.language !== null && album.lang !== station.language) return false;
    if (!inPool(station.pool, album.artist)) return false;
    const sel = station.select;
    if (!sel) return true;
    const included =
        (sel.artists || []).indexOf(album.artist) >= 0 ||
        (sel.albums || []).indexOf(album.code) >= 0 ||
        (sel.pending || []).indexOf(album.code) >= 0 ||
        (sel.albumPattern ? new RegExp(sel.albumPattern).test(album.code) : false) ||
        (sel.songs || []).some(function (id) { return songIdsOnAlbum.has(id); });
    if (!included) return false;
    const exc = sel.exclude || {};
    if ((exc.artists || []).indexOf(album.artist) >= 0) return false;
    if ((exc.albums || []).indexOf(album.code) >= 0) return false;
    return true;
}

// ── Build ────────────────────────────────────────────────────────────────
function main() {
    const collected = collect();
    const albums = collected.albums;
    const problems = collected.problems;

    const stationRows = [];
    const assigned = new Set();
    for (const id of Object.keys(STATIONS)) {
        const st = STATIONS[id];
        const mine = [];
        for (const a of albums) {
            const ids = new Set(a.tracks.map(function (t) { return t.songId; }).filter(Boolean));
            if (takes(st, a, ids)) { mine.push(a); assigned.add(a.code); }
        }
        const sum = function (k) { return mine.reduce(function (n, a) { return n + a.counts[k]; }, 0); };
        stationRows.push({
            id: id,
            hm: st.hm,
            freq: 'HM ' + st.hm,
            name: st.name,
            slug: st.slug,
            lang: st.language,
            langName: st.languageName,
            pool: st.pool,
            hostCity: st.hostCity || null,
            // A station curated track-by-track cannot be evaluated against an
            // album with no SongIDs. Say so on the row rather than let the page
            // present an under-count as the whole truth.
            songCurated: !!(st.select && st.select.songs && st.select.songs.length),
            planned: false,
            counts: {
                albums: mine.length,
                albumsNeeding: mine.filter(function (a) { return a.counts.needs > 0; }).length,
                tracks: sum('tracks'),
                needs: sum('needs'),
                recorded: sum('recorded'),
                ingested: sum('ingested'),
            },
            albums: mine.map(function (a) { return a.code; }),
        });
    }

    /* ── The rest of the dial ────────────────────────────────────────────
       STATIONS holds the 44 frequencies that have a selection rule. The dial
       carries 119. The other 75 are named, numbered and on the shelf, and they
       select nothing because nobody has written their rule yet — so this tool
       can compute no backlog for them at all.

       They are listed anyway, and NOT silently. A left panel that stops at 44
       does not disagree with /analytics/start.html so much as quietly contradict
       it, and the first honest question anyone asks of this page is "where is
       the rest of the dial". The answer — "planned, no rule, nothing selected"
       — is worth a row, because it names the thing that is actually blocking:
       an entry in the STATIONS table, not a recording session.

       Read from build-analytics-index.js's output, which is why that tool runs
       first; see setup/import-refresh.md Phase 5. If it has not been built, the
       planned side is simply absent rather than fatal. */
    const DIAL = path.join(ROOT, 'public', 'data', 'analytics-stations.json');
    let plannedRows = [];
    try {
        const dial = JSON.parse(fs.readFileSync(DIAL, 'utf8'));
        const known = new Set(Object.keys(STATIONS));
        plannedRows = dial.stations.filter(function (s) {
            return !s.id || !known.has(s.id);
        }).map(function (s) {
            return {
                id: 'plan:' + s.hm,
                hm: s.hm,
                freq: s.freq,
                name: s.name,
                slug: s.slug || null,
                lang: null,
                langName: s.lang || null,
                pool: null,
                hostCity: s.hostCity || null,
                songCurated: false,
                planned: true,
                format: s.format || null,
                counts: { albums: 0, albumsNeeding: 0, tracks: 0, needs: 0, recorded: 0, ingested: 0 },
                albums: [],
            };
        });
    } catch (e) {
        problems.push('dial index not built (' + path.relative(ROOT, DIAL) +
            ') — the 75 planned frequencies are missing from the panel. ' +
            'Run tools/build-analytics-index.js first.');
    }
    stationRows.push.apply(stationRows, plannedRows);

    // Up the dial, ONCE, with the planned frequencies already in — sorting
    // before they are appended is how they end up in a block at the end,
    // which is exactly the "where is the rest of the dial" problem again.
    // The page pins the flagship to the foot for its own reasons; the FILE
    // is in frequency order, the order the dial is in and the only one that
    // stays stable as the backlog moves.
    stationRows.sort(function (a, b) {
        return parseFloat(a.hm) - parseFloat(b.hm);
    });

    // Written, on no frequency. Its own row, because "nobody has given this
    // record a station" is a different job from "nobody has recorded it".
    const orphans = albums.filter(function (a) { return !assigned.has(a.code); });
    const osum = function (k) { return orphans.reduce(function (n, a) { return n + a.counts[k]; }, 0); };
    stationRows.push({
        id: '_unassigned', hm: '—', freq: 'Unassigned', name: 'On no station',
        slug: null, lang: null, langName: null, pool: null, hostCity: null,
        songCurated: false, planned: false,
        counts: {
            albums: orphans.length,
            albumsNeeding: orphans.filter(function (a) { return a.counts.needs > 0; }).length,
            tracks: osum('tracks'), needs: osum('needs'),
            recorded: osum('recorded'), ingested: osum('ingested'),
        },
        albums: orphans.map(function (a) { return a.code; }),
    });

    const albumIndex = {};
    for (const a of albums) {
        albumIndex[a.code] = {
            code: a.code, artist: a.artist, title: a.title, lang: a.lang,
            folder: a.folder, property: a.property,
            sheets: a.sheets.length, blueprint: a.blueprint, dupes: a.duplicateSheetTracks,
            tracks: a.counts.tracks, needs: a.counts.needs,
            recorded: a.counts.recorded, ingested: a.counts.ingested,
            lyrics: a.tracks.some(function (t) { return !!t.lyrics; }),
        };
    }

    const total = function (k) { return albums.reduce(function (n, a) { return n + a.counts[k]; }, 0); };
    const doc = {
        schema_version: 1,
        generated_at: new Date().toISOString(),
        generator: 'tools/build-todo-index.js — do not edit by hand',
        lyrics_base: '/cdn/lyrics',
        network: {
            trees: TREES.length,
            albums: albums.length,
            albums_needing_audio: albums.filter(function (a) { return a.counts.needs > 0; }).length,
            albums_silent: albums.filter(function (a) { return a.counts.ingested === 0 && a.counts.recorded === 0; }).length,
            tracks: total('tracks'),
            needs: total('needs'),
            recorded: total('recorded'),
            ingested: total('ingested'),
            stations: stationRows.length - 1,
            stations_with_rules: stationRows.filter(function (s) {
                return !s.planned && s.id !== '_unassigned';
            }).length,
            stations_planned: stationRows.filter(function (s) { return s.planned; }).length,
        },
        stations: stationRows,
        albums: albumIndex,
        problems: problems,
    };

    console.log('trees      : ' + TREES.length);
    console.log('albums     : ' + doc.network.albums + '  (' + doc.network.albums_needing_audio + ' waiting on audio)');
    console.log('tracks     : ' + doc.network.tracks);
    console.log('  needs mp3: ' + doc.network.needs);
    console.log('  recorded : ' + doc.network.recorded + '  (mp3 on disk, never ingested)');
    console.log('  ingested : ' + doc.network.ingested);
    console.log('');
    for (const s of stationRows.slice(0, 14)) {
        console.log('  ' + s.freq.padEnd(13) + String(s.counts.needs).padStart(5) + ' needing  ' +
            String(s.counts.albumsNeeding).padStart(4) + ' albums   ' + s.name);
    }
    if (problems.length) {
        console.log('\nproblems (' + problems.length + '):');
        problems.slice(0, 12).forEach(function (p) { console.log('  ' + p); });
    }

    if (DRY) { console.log('\n(dry run — nothing written)'); return 0; }

    fs.mkdirSync(path.dirname(OUT_INDEX), { recursive: true });
    fs.writeFileSync(OUT_INDEX, JSON.stringify(doc) + '\n');
    console.log('\nwrote ' + path.relative(ROOT, OUT_INDEX) +
        '  (' + (fs.statSync(OUT_INDEX).size / 1024).toFixed(0) + ' KB)');

    if (NO_LYRICS) return 0;

    fs.mkdirSync(OUT_LYRICS, { recursive: true });
    let written = 0, unchanged = 0, bytes = 0;
    for (const a of albums) {
        const bundle = JSON.stringify({
            code: a.code, artist: a.artist, title: a.title, lang: a.lang,
            folder: a.folder, property: a.property, dir: a.dir,
            blueprint: a.blueprint, sheets: a.sheets, dupes: a.duplicateSheetTracks,
            header: a.header,
            tracks: a.tracks,
        }) + '\n';
        const file = path.join(OUT_LYRICS, a.code + '.json');
        let prev = null;
        try { prev = fs.readFileSync(file, 'utf8'); } catch (e) { /* new */ }
        bytes += bundle.length;
        if (prev === bundle) { unchanged++; continue; }
        fs.writeFileSync(file, bundle);
        written++;
    }
    console.log('wrote ' + written + ' lyric bundle(s), ' + unchanged + ' unchanged, ' +
        (bytes / 1048576).toFixed(1) + ' MB total → ' + OUT_LYRICS);
    return 0;
}

if (require.main === module) process.exit(main());
module.exports = { parseSheet: parseSheet, TREES: TREES };
