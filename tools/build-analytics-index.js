#!/usr/bin/env node
/**
 * build-analytics-index.js — writes public/data/analytics-stations.json, the
 * index behind /analytics/start.html.
 *
 * The analytics page answers one question per station — WHAT DOES THIS
 * FREQUENCY PLAY — and two questions about the network: how much is on air, and
 * how much is written down and waiting. The song rows themselves are not in
 * here. The page fetches each station's `delivery/music.json` when you click it,
 * so the track list is the same bytes the broadcast playlist is generated from
 * rather than a copy that can drift. What this file carries is everything you
 * need BEFORE clicking: the dial, the counts, and the planned side of the
 * ledger, which no manifest records.
 *
 *   node tools/build-analytics-index.js            # write it
 *   node tools/build-analytics-index.js --dry-run  # print the summary only
 *
 * Run it after `node tools/build-home-data.js`, because it reads that file's
 * output for the dial. Running it before means a station added today is missing
 * from the panel — not wrong, just a build behind.
 *
 * THE THREE SOURCES, AND WHY IT TAKES ALL THREE.
 *
 *   public/js/stations-data.js   the dial: every frequency, on air or not.
 *   <CDN>/radio/<ID>/delivery/     what each on-air station actually plays.
 *   build-station-manifest.js    the STATIONS table — the only place that
 *                                records `pending`: albums that are WRITTEN and
 *                                not yet recorded. They select no tracks (there
 *                                are none), so they appear in no manifest and
 *                                the planned column cannot be derived from the
 *                                delivery tree at all.
 *
 * The music ledger is read for one number the manifests cannot give: how many
 * ingested songs are on NO station. A track that landed nowhere means a
 * selection rule did not match it — see import-report.js, which makes the same
 * point at greater length. It is a rule to look at, not a file to re-copy.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CDN_ROOT = process.env.CDN_LOCAL_ROOT || 'J:\\kjubilee.com';
const RADIO_ROOT = path.join(CDN_ROOT, 'radio');
const MUSIC_ROOT = process.env.MUSIC_LOCAL_ROOT || path.join(CDN_ROOT, 'music');
const STATIONS_DATA = path.join(ROOT, 'public', 'js', 'stations-data.js');
const OUT = path.join(ROOT, 'public', 'data', 'analytics-stations.json');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');

// ── The dial ─────────────────────────────────────────────────────────────
// stations-data.js is a generated browser script, one `window.X = <json>;` per
// line. Reading the JSON off the assignment rather than eval'ing the file keeps
// this tool out of the business of executing generated code.
function readDial() {
    const src = fs.readFileSync(STATIONS_DATA, 'utf8');
    const anchor = src.indexOf('window.KJ_STATIONS = ');
    if (anchor < 0) {
        throw new Error('KJ_STATIONS not found in public/js/stations-data.js — '
            + 'run `node tools/build-home-data.js` first');
    }
    const start = src.indexOf('[', anchor);
    const end = src.indexOf('\n', start);
    return JSON.parse(src.slice(start, end).replace(/;\s*$/, ''));
}

// ── What each station plays ──────────────────────────────────────────────
// Keyed by HM frequency for the same reason build-home-data.js does it: the
// site slug and the manifest slug are allowed to differ (HM 305.40 is
// `jubilee-praise` on the dial and `torah-sings` in the manifest), but a
// frequency identifies exactly one station.
function readManifests() {
    const byHm = new Map();
    let dirs = [];
    try { dirs = fs.readdirSync(RADIO_ROOT); }
    catch (e) {
        console.error('! ' + RADIO_ROOT + ' is unreachable (' + e.code + ') — '
            + 'every station will be written as planned. Check CDN_LOCAL_ROOT.');
        return byHm;
    }
    for (const id of dirs) {
        let m;
        try { m = JSON.parse(fs.readFileSync(path.join(RADIO_ROOT, id, 'delivery', 'music.json'), 'utf8')); }
        catch (e) { continue; }              // no delivery tree: not on air
        if (!m.hm) continue;
        byHm.set(String(m.hm), { id: id, manifest: m });
    }
    return byHm;
}

// ── What is written and not yet recorded ─────────────────────────────────
// `pending` names album codes that belong on a station the day their audio is
// ingested. Requiring the builder rather than re-parsing its table means the
// planned column cannot drift from the thing that actually selects tracks.
function readPending() {
    const byId = new Map();
    let STATIONS;
    try { ({ STATIONS } = require('./build-station-manifest.js')); }
    catch (e) {
        console.error('! could not read the STATIONS table (' + e.message + ') — '
            + 'planned albums will be reported as 0');
        return byId;
    }
    for (const [id, st] of Object.entries(STATIONS)) {
        const pending = (st.select && st.select.pending) || [];
        byId.set(id, { pending: pending.slice(), mount: st.mount || null, pool: st.pool || null });
    }
    return byId;
}

// ── The ledger ───────────────────────────────────────────────────────────
// Every SongID that EXISTS. The manifests say what plays; the gap between the
// two is the number worth printing.
function readLedgerIds() {
    const ids = new Set();
    let text;
    try { text = fs.readFileSync(path.join(MUSIC_ROOT, 'songid-registry.tsv'), 'utf8'); }
    catch (e) { return null; }              // no ledger reachable: skip the check
    const lines = text.split('\n').filter(Boolean);
    const col = lines[0].split('\t').indexOf('SongID');
    if (col < 0) return null;
    for (let i = 1; i < lines.length; i++) {
        const id = lines[i].split('\t')[col];
        if (id) ids.add(id.trim());
    }
    return ids;
}

// ── The voice scripts ────────────────────────────────────────────────────
// Everything the station SAYS between the songs: legal and persona IDs, the
// six break categories, the scripture treatments, the donation copy, the
// delight templates, the beds and the clock. It is the other half of a station
// — music.json says what plays, this says what is said over and around it —
// and no other tool reports on it at all.
//
// ONLY THE FILE LIST IS INDEXED, NOT THE TEXT. The console fetches a script
// when you click it, the same way it fetches a manifest when you click a
// station. Inlining 133 scripts would put the flagship's whole spoken layer
// into a file every visitor downloads to see the dial.
//
// README.txt is kept rather than skipped. It carries the section's gate item
// and whether that gate is cleared, which is the first thing an operator
// opening a category wants to know.
const SCRIPT_EXT = '.txt';

// "01-anchor-passage" -> "Anchor Passage"; "legal-id" -> "Legal ID".
function labelFor(segment) {
    return segment
        .replace(/^\d+[-_]/, '')
        .split(/[-_]/)
        .map(function (w) {
            if (w === 'id') return 'ID';
            return w.charAt(0).toUpperCase() + w.slice(1);
        })
        .join(' ');
}

function readScripts(stationId) {
    const root = path.join(RADIO_ROOT, stationId);
    const groups = new Map();
    let total = 0;

    (function walk(dir, rel) {
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch (e) { return; }
        for (const e of entries) {
            // `delivery` is the music manifest, which has its own tab.
            if (e.isDirectory()) {
                if (e.name === 'delivery') continue;
                walk(path.join(dir, e.name), rel ? rel + '/' + e.name : e.name);
                continue;
            }
            if (!e.name.toLowerCase().endsWith(SCRIPT_EXT)) continue;
            const key = rel || '.';
            if (!groups.has(key)) {
                groups.set(key, {
                    id: key,
                    label: key === '.' ? 'Station' : key.split('/').map(labelFor).join(' · '),
                    files: [],
                });
            }
            let bytes = 0;
            try { bytes = fs.statSync(path.join(dir, e.name)).size; } catch (err) { /* raced */ }
            groups.get(key).files.push({
                name: e.name,
                // The URL the console fetches. Relative, so it is correct in dev
                // and in production without knowing which CDN is in front.
                url: '/cdn/radio/' + stationId + '/' + (rel ? rel + '/' : '') + e.name,
                bytes: bytes,
                readme: /^readme\./i.test(e.name),
            });
            total++;
        }
    })(root, '');

    const out = [...groups.values()].sort(function (a, b) { return a.id.localeCompare(b.id); });
    for (const g of out) {
        // README first, then the scripts in their own numeric order.
        g.files.sort(function (a, b) {
            if (a.readme !== b.readme) return a.readme ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true });
        });
    }
    return { total: total, groups: out };
}

// ─────────────────────────────────────────────────────────────────────────
const dial = readDial();
const played = readManifests();
const planned = readPending();
const ledger = readLedgerIds();

const airedSongs = new Set();       // distinct SongIDs reachable on any station
let pendingSeen = new Set();        // distinct album codes awaiting audio
let scriptsTotal = 0;               // voice scripts across the whole dial
let stationsWithScripts = 0;

const stations = dial.map(function (s) {
    const hit = played.get(String(s.hm));
    const m = hit ? hit.manifest : null;
    const id = hit ? hit.id : (s.tenant || null);
    const p = (id && planned.get(id)) || null;

    // A pending album that HAS gained audio is no longer planned — it is on
    // air, and counting it in both columns would overstate the backlog for as
    // long as nobody tidied the table. Graduated entries are dropped here the
    // same way the builder reports them.
    const albumsOnAir = new Set(m ? (m.albums || []).map(function (a) { return a.album_id; }) : []);
    const awaiting = p ? p.pending.filter(function (code) { return !albumsOnAir.has(code); }) : [];
    for (const code of awaiting) pendingSeen.add(code);

    if (m) {
        for (const album of m.albums || []) {
            for (const t of album.tracks || []) airedSongs.add(t.track_id);
        }
    }

    // The spoken layer. Indexed for any station with a delivery tree, whether
    // or not it is on air — a station being written has scripts before it has
    // music, and the console is where you would look to see that.
    const scripts = id ? readScripts(id) : { total: 0, groups: [] };
    scriptsTotal += scripts.total;
    if (scripts.total) stationsWithScripts++;

    return {
        id: id,
        hm: s.hm,
        freq: s.freq,
        slug: s.slug,
        name: s.name,
        band: s.band,
        pill: s.pill || null,
        format: s.format || null,
        lang: s.lang || null,
        flag: s.flag || null,
        region: s.region || null,
        host: s.host || null,
        gradient: s.gradient || null,
        mode: s.mode || null,
        phase: s.phase || null,
        description: s.description || null,
        onAir: Boolean(m && m.totals && m.totals.tracks > 0),
        manifest: s.manifest || (id ? '/cdn/radio/' + id + '/delivery/music.json' : null),
        stream: s.stream || null,
        mount: (m && m.mount) || (p && p.mount) || null,
        pool: (p && p.pool) || null,
        hostCity: (m && m.host_city) || null,
        // Straight from the manifest the broadcast playlist is generated from,
        // so the panel badge is the number actually on air.
        songs: (m && m.totals && m.totals.tracks) || 0,
        albums: (m && m.totals && m.totals.albums) || 0,
        artists: (m && m.totals && m.totals.artists) || 0,
        duration_s: (m && m.totals && m.totals.duration_s) || 0,
        // Written, not recorded. Songs are deliberately absent: an album with no
        // audio has no track count anywhere, and inventing one would put a
        // number on the page that nothing can be checked against.
        planned_albums: awaiting.length,
        planned_album_ids: awaiting,
        selection: (m && m.selection && m.selection.rule) || null,
        built_at: (m && m.generated_at) || null,
        scripts: scripts,
    };
});

const onAir = stations.filter(function (s) { return s.onAir; });

const doc = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    generator: 'tools/build-analytics-index.js',
    source: {
        dial: 'public/js/stations-data.js',
        delivery: RADIO_ROOT,
        ledger: ledger ? path.join(MUSIC_ROOT, 'songid-registry.tsv') : null,
    },
    network: {
        stations_total: stations.length,
        stations_on_air: onAir.length,
        stations_planned: stations.length - onAir.length,
        // The sum, with overlap counted — ONE SONG ON SEVERAL STATIONS IS THE
        // DESIGN (AGENTS.md). This is "slots on the dial", and it is larger than
        // the number of songs that exist on purpose.
        songs_scheduled: onAir.reduce(function (n, s) { return n + s.songs; }, 0),
        songs_distinct: airedSongs.size,
        songs_in_ledger: ledger ? ledger.size : null,
        // Ingested and on no station at all: a selection rule that did not fire.
        songs_unaired: ledger ? [...ledger].filter(function (id) { return !airedSongs.has(id); }).length : null,
        albums_on_air: onAir.reduce(function (n, s) { return n + s.albums; }, 0),
        albums_planned: pendingSeen.size,
        duration_s: onAir.reduce(function (n, s) { return n + s.duration_s; }, 0),
        voice_scripts: scriptsTotal,
        // The number that makes the last one mean something. A dial where one
        // station has a spoken layer and forty do not is not "133 scripts" —
        // it is one station written and forty silent between the songs.
        stations_with_scripts: stationsWithScripts,
    },
    stations: stations,
};

const n = doc.network;
console.log('dial: ' + n.stations_total + ' stations — ' + n.stations_on_air + ' on air, '
    + n.stations_planned + ' planned');
console.log('songs: ' + n.songs_distinct + ' distinct on air, ' + n.songs_scheduled
    + ' scheduled slots across the dial (overlap is the design)');
if (n.songs_in_ledger !== null) {
    console.log('ledger: ' + n.songs_in_ledger + ' ingested, ' + n.songs_unaired
        + ' on no station' + (n.songs_unaired ? ' — a selection rule did not fire' : ''));
}
console.log('planned: ' + n.albums_planned + ' album(s) written and awaiting audio');
console.log('voice:   ' + n.voice_scripts + ' script(s) across ' + n.stations_with_scripts
    + ' station(s)' + (n.stations_on_air > n.stations_with_scripts
        ? ' — ' + (n.stations_on_air - n.stations_with_scripts) + ' on-air station(s) say nothing between the songs'
        : ''));

if (DRY) { console.log('\n--dry-run: nothing written'); process.exit(0); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log('\nwrote ' + path.relative(ROOT, OUT) + ' (' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB)');
