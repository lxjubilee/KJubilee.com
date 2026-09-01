#!/usr/bin/env node
/**
 * build-weeatingood-index.js — the recording queue for weeatingood.com.
 *
 *   node tools/build-weeatingood-index.js
 *   node tools/build-weeatingood-index.js --dry-run
 *
 * Writes:
 *   public/data/todo-weeatingood.json      the album rows and the counts
 *   <CDN_LOCAL_ROOT>/lyrics/<CODE>.json    one bundle per album, same shape as
 *                                          tools/build-todo-index.js emits
 *
 * ── WHY THIS IS NOT JUST A TENTH ENTRY IN build-todo-index.js's TREES ───────
 *
 * Because the sheets are a different document. Every one of the nine trees that
 * tool walks keeps ONE markdown file per ALBUM, with plain `KEY: value` lines
 * and a `SONG TITLE: 01 …` divider between tracks; its parser is built around
 * exactly that. weeatingood.com keeps ONE FILE PER TRACK, with markdown-bold
 * metadata (`- **Music Styles:** …`), an `## Lyrics` heading, and the track
 * number inside a `**Track:** 01 of 12` line. Nothing in the existing parser
 * reads any of that, so the format needs its own reader either way.
 *
 * And the project sits outside everything the main index joins against: it has
 * no HM frequency, so no station selects it, and none of its songs are in
 * songid-registry.tsv, so the ledger cannot say anything about them. Folding it
 * into the network index would mean a station row that is not a station and a
 * ledger join that always misses — while forcing a rebuild of the whole
 * 488KB network index, and the console that reads it, every time this one
 * project changes.
 *
 * So it gets its own index, in the SAME SHAPE, read by the SAME console. The
 * page passes `window.TD_INDEX_URL` and everything else — the album pane, the
 * lyric sheet, the rail, the copy buttons — is the code already there.
 *
 * ── WHAT COUNTS AS DONE HERE ────────────────────────────────────────────────
 *
 * `ingested` means a row in the ledger, and this project has none, so nothing
 * here can honestly claim it. A track with an mp3 beside its words is
 * `recorded` — written, rendered, and waiting to be ingested — and a track
 * without one is `needs-audio`. That is the true state of this catalogue and
 * the console already has the vocabulary for it.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = process.env.WEG_ROOT || 'J:\\weeatingood.com\\music';
const CDN_ROOT = process.env.CDN_LOCAL_ROOT || 'J:\\kjubilee.com';
const OUT_INDEX = path.join(ROOT, 'public', 'data', 'todo-weeatingood.json');
const OUT_LYRICS = path.join(CDN_ROOT, 'lyrics');
const DRY = process.argv.indexOf('--dry-run') > 0;

const PROPERTY = 'weeatingood.com';
/* A synthetic station row. The console's left pane is "albums for a station",
   and rather than teach it a second grouping this hands it one station whose
   albums are the project's. `planned:false` because the work is real; the
   frequency fields are blank because there is no frequency and inventing one
   would put a lie on the dial. */
const STATION_ID = 'WEG-EN';

function read(p) { return fs.readFileSync(p, 'utf8'); }
function dirs(p) {
    try {
        return fs.readdirSync(p, { withFileTypes: true })
            .filter(e => e.isDirectory()).map(e => e.name).sort();
    } catch (e) { return []; }
}
function files(p) {
    try {
        return fs.readdirSync(p, { withFileTypes: true })
            .filter(e => e.isFile()).map(e => e.name).sort();
    } catch (e) { return []; }
}

/* `S1A01-check-day` -> code `S1A01`, slug `check-day`. Letters and digits up to
   the first dash, matching how every other property in the network names an
   album folder: <CODE><separator><anything>. */
function splitFolder(name) {
    const m = /^([A-Za-z0-9]+)[-_ ](.+)$/.exec(name);
    return m ? { code: m[1].toUpperCase(), slug: m[2] } : { code: name.toUpperCase(), slug: '' };
}

function titleCase(slug) {
    return String(slug || '').split(/[-_]/).filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * One track, out of one markdown file.
 *
 * ── THE SHEETS WERE REWRITTEN, AND THIS READS THE NEW ONES ─────────────────
 *
 * The first version of this property kept its production notes as prose
 * sections — `## Production Metadata`, `- **Music Styles:** …`, `## Lyrics`.
 * They are now published straight out of the Suno blocks the songs are
 * generated from, which is a different document:
 *
 *     # Check Day                        <- the song
 *     **Album Code:** S1A01              <- bold pairs, the header block
 *     **Track:** 01 of 12
 *     **Artist:** Micah Tate — "Deuce Two-Five"
 *     **Design:** euphoric celebration · 104 BPM · F major · hook-first
 *
 *     ## Suno Generation Block
 *     ```
 *     Song Title: 01 Check Day
 *     Artist: Deuce Two-Five
 *     Lyrics:                            <- everything until the next label
 *     [Hook] …
 *     Styles: Detroit boom-bap, 104 BPM… <- the generation prompt
 *     Vocal Gender: Male Lead
 *     ```
 *
 * Read against the old shape every one of the 216 sheets yielded no lyrics, no
 * styles and seven metadata pairs instead of thirty-two — the page rendered a
 * title and a J: path and nothing else worth having.
 *
 * ── EVERY VALUE RUNS TO THE NEXT LABEL, NOT TO THE END OF ITS LINE ─────────
 *
 * This is the part that was reported as "cut off". A line-anchored capture
 * takes one line and drops the rest, and in a document where `Lyrics:` is
 * followed by sixty lines of song and `Styles:` can wrap, that silently
 * truncates the two fields the page exists to show. So a field ends where the
 * NEXT field begins, and a value spanning forty lines survives whole.
 */
function parseTrack(text, file) {
    const lines = text.split(/\r?\n/);

    // `# Check Day` — the first heading is the song.
    let title = '';
    for (const l of lines) {
        const m = /^#\s+(.+?)\s*$/.exec(l);
        if (m) { title = m[1].trim(); break; }
    }

    /* The bold header pairs. `**Label:** x · **Station:** y` puts two on one
       line, so each line is scanned for all of them rather than matched once. */
    const meta = [];
    const seen = Object.create(null);
    const push = (k, v) => {
        k = String(k).trim().toUpperCase();
        v = String(v).trim().replace(/\s*·\s*$/, '').trim();
        if (!k || !v || seen[k]) return;
        seen[k] = true;
        meta.push([k, v]);
    };
    const BOLD = /\*\*([^*:]+):\*\*\s*([^*]*)/g;
    for (const l of lines) {
        if (/^\s*>/.test(l)) continue;              // the craft-law blockquote
        let m;
        BOLD.lastIndex = 0;
        while ((m = BOLD.exec(l))) push(m[1], m[2]);
    }

    /* ── inside the fence ────────────────────────────────────────────────
       The generation block is the authority on the song and the prompt. Its
       fields are `Label: value`, and a value continues until the next label —
       which is what makes Lyrics work at all, since the song is sixty lines
       with no label of its own. */
    const fence = [];
    let inFence = false;
    for (const l of lines) {
        if (/^\s*```/.test(l)) { inFence = !inFence; continue; }
        if (inFence) fence.push(l);
    }

    /* ── A LABEL IS ONE OF NINE WORDS, NOT ANY WORD WITH A COLON ────────
       "any capitalised phrase followed by a colon" looked like a safe way to
       find the fields, and it silently ate the songs. Rap lyrics are full of
       lines that match it:

           Aisle fourteen: paper goods. Bulk. Heavy but light.
           She said: ...
           Step one: ...

       Each one ended the Lyrics field where it appeared, so sixteen tracks
       came through with between 34 and 380 characters of song instead of the
       whole thing — a truncation that looks exactly like a short lyric and
       reports no error at all.

       The block's vocabulary is fixed and small, so it is stated. Counted
       across all 216 sheets, every one of these appears exactly 216 times
       (Song Title twice per sheet, at the head and the foot); the next most
       frequent colon-phrase appears twice, and it is a lyric. */
    const FIELDS = new Set(['song title', 'artist', 'lyrics', 'styles',
        'vocal gender', 'weirdness', 'style influence', 'audio influence', 'save to']);
    const LABEL = /^([A-Za-z][A-Za-z ]{1,24}):\s*(.*)$/;
    const fields = [];
    for (const l of fence) {
        const m = LABEL.exec(l);
        if (m && FIELDS.has(m[1].trim().toLowerCase())) {
            fields.push({ key: m[1].trim(), first: m[2], body: [] });
        } else if (fields.length) {
            fields[fields.length - 1].body.push(l);
        }
    }
    const whole = (f) => (f.first ? [f.first] : []).concat(f.body).join('\n')
        .replace(/^\s*[\r\n]+/, '').replace(/\s+$/, '');
    const valueOf = (name) => {
        for (const f of fields) if (f.key.toLowerCase() === name) return whole(f);
        return '';
    };

    const lyrics = valueOf('lyrics');
    const styles = valueOf('styles');

    /* The block's own scalars are production facts worth showing, so they join
       the header pairs. Lyrics and Styles are excluded because they are
       rendered in their own right and would otherwise appear twice — once as a
       field and again as a metadata row sixty lines long. */
    for (const f of fields) {
        const k = f.key.toLowerCase();
        if (k === 'lyrics' || k === 'styles') continue;
        push(f.key, whole(f).replace(/\s*\n\s*/g, ' '));
    }

    /* The credit the console reads with performerOf(), which looks for an
       `ARTIST:` line. The header states it as

           **Artist:** Micah Tate — "Deuce Two-Five"

       and both halves are wanted: the person who is credited and the name the
       records are released under. Restated as `Micah Tate (Deuce Two-Five)`,
       because an em dash and a pair of typographic quotes inside a byline read
       as punctuation gone wrong at 12px, where parentheses read as an alias.

       The alias used to be dropped outright, which lost the half of the credit
       the listener would recognise. */
    let performer = '';
    const am = /\*\*Artist:\*\*\s*(.+?)\s*$/im.exec(text);
    if (am) {
        const raw = am[1].trim();
        const split = /^(.+?)\s*[\u2014\u2013-]\s*["\u201c\u2018']?([^"\u201d\u2019']+)["\u201d\u2019']?\s*$/.exec(raw);
        performer = split ? split[1].trim() + ' (' + split[2].trim() + ')' : raw;
    }
    const headBits = [];
    if (performer) headBits.push('ARTIST: ' + performer);
    const dm = /\*\*Design:\*\*\s*(.+?)\s*$/im.exec(text);
    if (dm) headBits.push('DESIGN: ' + dm[1].trim());

    // `**Track:** 01 of 12`; the filename's leading digits are the fallback.
    let n = 0;
    const tm = /\*\*Track:\*\*\s*(\d+)\s*of\s*\d+/i.exec(text);
    if (tm) n = parseInt(tm[1], 10);
    if (!n) { const fm = /^(\d+)/.exec(file); if (fm) n = parseInt(fm[1], 10); }

    return {
        n: n,
        title: title || titleCase(file.replace(/^\d+[-_ ]?/, '').replace(/\.md$/i, '')),
        styles: styles,
        lyrics: lyrics,
        meta: meta,
        intro: headBits.join('\n'),
        sheet: file,
    };
}

// ── walk ────────────────────────────────────────────────────────────────
const albums = {};
const bundles = [];
const problems = [];
let artistFolders = dirs(SRC);

if (!artistFolders.length) {
    console.error('nothing under ' + SRC + ' — is the music share mounted?');
    process.exit(1);
}

for (const artist of artistFolders) {
    const artistDir = path.join(SRC, artist);
    for (const folder of dirs(artistDir)) {
        const dir = path.join(artistDir, folder);
        const { code, slug } = splitFolder(folder);
        const lyricDir = path.join(dir, 'lyrics');
        const sheets = files(lyricDir).filter(f => /\.md$/i.test(f));
        if (!sheets.length) {
            problems.push({ code: code, why: 'no lyric sheets in ' + dir });
            continue;
        }

        // Which songs already have audio beside them. Matched on the leading
        // track number, because the mp3 is named "01 Check Day.mp3" and the
        // sheet "01-check-day.md" — same number, different spelling of the title.
        const mp3 = new Set();
        for (const f of files(path.join(dir, 'tracks'))) {
            const m = /^(\d+)/.exec(f);
            if (m && /\.mp3$/i.test(f)) mp3.add(parseInt(m[1], 10));
        }

        /* THE ALBUM'S NAME COMES FROM THE SHEETS, not from its folder.
           Title-casing the slug gets the words right and the punctuation
           wrong — "Ruthie Maes Kitchen" for Ruthie Mae's Kitchen, "They Told
           Me What Id Be", "No Skills No Nothing" — because a folder name has
           no room for an apostrophe or a comma, and no way to know that
           "to" stays lowercase in What If He Lied to Me. Every sheet states
           the album outright, so the authored title is right there. */
        let albumTitle = '';

        const tracks = [];
        for (const f of sheets) {
            let t, raw;
            try { raw = read(path.join(lyricDir, f)); t = parseTrack(raw, f); }
            catch (e) { problems.push({ code: code, why: 'unreadable sheet ' + f + ': ' + e.message }); continue; }
            if (!albumTitle) {
                const am = /\*\*Album:\*\*\s*(.+?)\s*$/im.exec(raw);
                if (am) albumTitle = am[1].trim();
            }
            // Nothing here is in songid-registry.tsv, so nothing can be
            // 'ingested' — see the note at the head of this file.
            t.status = mp3.has(t.n) ? 'recorded' : 'needs-audio';
            t.songId = '';
            tracks.push(t);
        }
        tracks.sort((a, b) => a.n - b.n);

        const count = (s) => tracks.filter(t => t.status === s).length;
        const blueprint = files(dir).some(f => /^blueprint\.md$/i.test(f));

        albums[code] = {
            code: code,
            artist: artist,
            title: albumTitle || titleCase(slug) || code,
            lang: 'EN',
            folder: folder,
            property: PROPERTY,
            sheets: sheets.length,
            blueprint: blueprint,
            dupes: 0,
            tracks: tracks.length,
            needs: count('needs-audio'),
            recorded: count('recorded'),
            ingested: 0,
            lyrics: true,
        };

        bundles.push({
            code: code,
            artist: artist,
            title: albums[code].title,
            lang: 'EN',
            folder: folder,
            property: PROPERTY,
            dir: dir,
            blueprint: blueprint,
            sheets: sheets.map(f => ({ file: f })),
            dupes: 0,
            header: '',
            tracks: tracks,
        });
    }
}

const codes = Object.keys(albums).sort();
const sum = (f) => codes.reduce((n, c) => n + f(albums[c]), 0);
const totals = {
    albums: codes.length,
    albumsNeeding: codes.filter(c => albums[c].needs > 0).length,
    tracks: sum(a => a.tracks),
    needs: sum(a => a.needs),
    recorded: sum(a => a.recorded),
    ingested: 0,
};

const index = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    generator: 'tools/build-weeatingood-index.js',
    lyrics_base: '/cdn/lyrics',
    network: {
        needs: totals.needs,
        albums: totals.albums,
        albums_needing_audio: totals.albumsNeeding,
        recorded: totals.recorded,
        ingested: 0,
    },
    stations: [{
        id: STATION_ID,
        hm: '', freq: 'We Eatin Good',
        name: 'We Eatin Good',
        slug: 'we-eatin-good',
        lang: 'EN', langName: 'English',
        pool: 'catalogues',
        hostCity: '',
        songCurated: false,
        planned: false,
        counts: totals,
        albums: codes,
    }],
    albums: albums,
    problems: problems,
};

console.log('weeatingood.com — ' + codes.length + ' album(s), ' + totals.tracks + ' track(s)');
for (const c of codes) {
    const a = albums[c];
    console.log('  ' + c.padEnd(10) + a.title.slice(0, 30).padEnd(32)
        + (a.tracks - a.needs) + '/' + a.tracks + ' with audio');
}
problems.forEach(p => console.log('  ! ' + p.code + ': ' + p.why));

if (DRY) { console.log('\ndry run — nothing written'); process.exit(0); }

fs.mkdirSync(path.dirname(OUT_INDEX), { recursive: true });
fs.writeFileSync(OUT_INDEX, JSON.stringify(index, null, 0));
console.log('\nwrote ' + path.relative(ROOT, OUT_INDEX));

fs.mkdirSync(OUT_LYRICS, { recursive: true });
for (const b of bundles) {
    fs.writeFileSync(path.join(OUT_LYRICS, b.code + '.json'), JSON.stringify(b, null, 0));
}
console.log('wrote ' + bundles.length + ' lyric bundle(s) to ' + OUT_LYRICS);
