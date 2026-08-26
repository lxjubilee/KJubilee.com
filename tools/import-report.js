#!/usr/bin/env node
/**
 * import-report.js — what actually changed on the dial after an ingest.
 *
 * Reads every station's built manifest and compares it against a snapshot taken
 * before the ingest, then prints a grid: which stations gained tracks, which
 * lost them, and — the part no other tool answers — WHICH STATIONS EACH NEW SONG
 * REACHED.
 *
 * ONE SONG IS NORMALLY ON SEVERAL STATIONS, AND THAT IS THE DESIGN.
 *
 * Station selections overlap on purpose. A Caleb track belongs on the flagship
 * because Caleb is one of its four voices, and on Gospel Country if it is a
 * country record, and on a language edition if it was recorded in that language.
 * Nothing here treats that as duplication to be resolved — the fan-out column is
 * the point of the report, not a warning. A new song that reaches six stations
 * is six stations' worth of value from one ingest, and the only number that
 * would be suspicious is one: a track that landed nowhere means a selection rule
 * did not match it, which is a rule to look at, not a file to re-copy.
 *
 * Usage:
 *   node tools/import-report.js --snapshot     # before the ingest (Phase 0)
 *   node tools/import-report.js                # after the manifests build (Phase 2)
 *   node tools/import-report.js --json         # same data, machine-readable
 *   node tools/import-report.js --snapshot --label "before nova ingest"
 *
 * The snapshot lives at tmp/import-snapshot.json, which is gitignored. Taking a
 * new one overwrites the last; the report is always "since the last snapshot".
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CDN_ROOT = process.env.CDN_LOCAL_ROOT || 'J:\\kjubilee.com';
const RADIO_ROOT = path.join(CDN_ROOT, 'radio');
const SNAPSHOT = path.join(ROOT, 'tmp', 'import-snapshot.json');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

/**
 * Every SongID the ledger knows, as { id -> {title, artist, lang} }.
 *
 * The ledger is the authority on what EXISTS; the manifests say what PLAYS. The
 * gap between them is the thing no other tool reports: a track ingested into the
 * repository that no station's selection rule matched. It is not a missing file
 * and not a failed copy — it is a rule that did not fire, and it is silent
 * everywhere else.
 */
function readLedger() {
    const MUSIC_ROOT = process.env.MUSIC_LOCAL_ROOT || path.join(CDN_ROOT, 'music');
    const out = new Map();
    let text;
    try { text = fs.readFileSync(path.join(MUSIC_ROOT, 'songid-registry.tsv'), 'utf8'); }
    catch (e) { return out; }                 // no ledger reachable: skip the check
    const lines = text.split('\n').filter(Boolean);
    const head = lines[0].split('\t');
    const iId = head.indexOf('SongID'), iT = head.indexOf('Title');
    const iA = head.indexOf('Artist'), iL = head.indexOf('Lang');
    if (iId < 0) return out;
    for (const line of lines.slice(1)) {
        const c = line.split('\t');
        if (c[iId]) out.set(c[iId], { title: c[iT] || '', artist: c[iA] || '', lang: c[iL] || '' });
    }
    return out;
}

/** Every built station manifest, as { tenant -> {name, hm, slug, ids:Set, titles:Map} }. */
function readManifests() {
    const out = new Map();
    let dirs = [];
    try { dirs = fs.readdirSync(RADIO_ROOT); } catch (e) {
        console.error('Cannot read ' + RADIO_ROOT + ' — is CDN_LOCAL_ROOT set?');
        process.exit(1);
    }
    for (const id of dirs) {
        if (!/^HM\d+\.\d+-[A-Z]{2}$/.test(id)) continue;   // tenant directories only
        const p = path.join(RADIO_ROOT, id, 'delivery', 'music.json');
        let m;
        try { m = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
        const ids = new Set(), titles = new Map();
        for (const al of m.albums || []) {
            for (const t of al.tracks || []) {
                if (!t.track_id) continue;
                ids.add(t.track_id);
                titles.set(t.track_id, { title: t.title, artist: t.artist, album: al.title });
            }
        }
        out.set(id, {
            name: m.station_name || id, hm: m.hm || '', slug: m.station_slug || '',
            lang: m.language || '', ids, titles,
            generated: m.generated_at || '',
        });
    }
    return out;
}

// ---- snapshot --------------------------------------------------------------
if (has('--snapshot')) {
    const now = readManifests();
    const payload = {
        label: valueOf('--label') || '',
        stations: {},
    };
    for (const [id, s] of now) payload.stations[id] = { name: s.name, hm: s.hm, ids: [...s.ids] };
    fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
    fs.writeFileSync(SNAPSHOT, JSON.stringify(payload), 'utf8');
    const total = [...now.values()].reduce((n, s) => n + s.ids.size, 0);
    console.log(`snapshot taken: ${now.size} station(s), ${total.toLocaleString()} station-track rows`);
    if (payload.label) console.log(`  label: ${payload.label}`);
    console.log(`  -> ${path.relative(ROOT, SNAPSHOT)}`);
    process.exit(0);
}

// ---- report ----------------------------------------------------------------
let before = null;
try { before = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')); } catch (e) { /* first run */ }
const now = readManifests();

if (!before) {
    console.log('No snapshot found — nothing to compare against.');
    console.log('Run `node tools/import-report.js --snapshot` BEFORE the next ingest.');
    console.log('');
    console.log('Current state:');
    for (const [id, s] of [...now].sort()) {
        console.log('  ' + id.padEnd(14) + String(s.ids.size).padStart(6) + '  ' + s.name);
    }
    process.exit(0);
}

const beforeIds = (id) => new Set((before.stations[id] || {}).ids || []);

const rows = [];
const gainedBy = new Map();      // songId -> [tenant, ...]
for (const [id, s] of now) {
    const was = beforeIds(id);
    const gained = [...s.ids].filter(x => !was.has(x));
    const lost = [...was].filter(x => !s.ids.has(x));
    rows.push({ id, name: s.name, hm: s.hm, before: was.size, after: s.ids.size, gained, lost, s });
    for (const g of gained) {
        if (!gainedBy.has(g)) gainedBy.set(g, []);
        gainedBy.get(g).push(id);
    }
}
// Stations that existed at snapshot time and no longer have a manifest at all.
for (const id of Object.keys(before.stations)) {
    if (!now.has(id)) rows.push({
        id, name: (before.stations[id].name || id), hm: '', gone: true,
        before: (before.stations[id].ids || []).length, after: 0, gained: [], lost: [],
    });
}
rows.sort((a, b) => (b.gained.length - a.gained.length) || a.id.localeCompare(b.id));

const newSongs = [...gainedBy.keys()];
const touched = rows.filter(r => r.gained.length || r.lost.length);

if (has('--json')) {
    console.log(JSON.stringify({
        snapshotLabel: before.label || '',
        newSongs: newSongs.length,
        stationsUpdated: touched.length,
        placements: [...gainedBy.values()].reduce((n, v) => n + v.length, 0),
        stations: rows.map(r => ({
            tenant: r.id, station: r.name, hm: r.hm,
            before: r.before, after: r.after,
            gained: r.gained.length, lost: r.lost.length,
        })),
        fanOut: newSongs.map(sid => ({ songId: sid, stations: gainedBy.get(sid) })),
    }, null, 2));
    process.exit(0);
}

// ---- the grid --------------------------------------------------------------
const bar = '─'.repeat(78);
console.log('');
console.log('IMPORT REPORT' + (before.label ? '   (since: ' + before.label + ')' : ''));
console.log(bar);

if (!touched.length) {
    console.log('  No station gained or lost a track since the snapshot.');
    console.log('  ' + rows.length + ' station(s) checked, all unchanged.');
    console.log(bar);
    process.exit(0);
}

console.log('  TENANT          FREQ       STATION                     WAS    NOW    NEW');
console.log('  ' + '-'.repeat(74));
for (const r of rows) {
    const flag = r.gone ? '  ** manifest missing **' : r.lost.length ? '  ** -' + r.lost.length + ' **' : '';
    const mark = r.gained.length ? '+' + r.gained.length : (r.lost.length || r.gone ? '' : '·');
    console.log('  ' + r.id.padEnd(15) + ('HM ' + r.hm).padEnd(11) + r.name.slice(0, 26).padEnd(27) +
        String(r.before).padStart(6) + String(r.after).padStart(7) + String(mark).padStart(7) + flag);
}
console.log(bar);

// ---- fan-out: the same song across stations --------------------------------
const multi = newSongs.filter(s => gainedBy.get(s).length > 1);
const solo = newSongs.filter(s => gainedBy.get(s).length === 1);
const placements = newSongs.reduce((n, s) => n + gainedBy.get(s).length, 0);

console.log('');
console.log(`  ${newSongs.length} new song(s) → ${placements} placement(s) across ${touched.length} station(s)`);
if (newSongs.length) {
    console.log(`  ${multi.length} reached more than one station · ${solo.length} reached exactly one`);
}

if (multi.length) {
    console.log('');
    console.log('  WHERE EACH NEW SONG LANDED  (overlap is intended — see the header)');
    console.log('  ' + '-'.repeat(74));
    const named = (sid) => {
        for (const [, s] of now) if (s.titles.has(sid)) return s.titles.get(sid);
        return { title: sid, artist: '' };
    };
    const show = multi.slice(0, 40);
    for (const sid of show) {
        const meta = named(sid);
        const on = gainedBy.get(sid).map(t => (now.get(t) || {}).hm || t);
        console.log('  ' + String(meta.title).slice(0, 38).padEnd(39) +
            String(meta.artist).slice(0, 16).padEnd(17) + on.join(' '));
    }
    if (multi.length > show.length) console.log(`  … and ${multi.length - show.length} more`);
}

// ---- orphans: in the ledger, on no station ---------------------------------
//
// Checked against the WHOLE ledger rather than only what changed, because an
// orphan is not created by this ingest alone — a selection rule narrowed months
// ago can strand tracks that were playing fine before.
const ledger = readLedger();
if (ledger.size) {
    const placed = new Set();
    for (const [, st] of now) for (const id of st.ids) placed.add(id);
    const orphans = [...ledger.keys()].filter(id => !placed.has(id));
    console.log('');
    if (!orphans.length) {
        console.log(`  Every one of the ${ledger.size.toLocaleString()} ledger tracks is on at least one station.`);
    } else {
        const byArtist = {};
        for (const id of orphans) {
            const m = ledger.get(id);
            const k = m.artist + '  [' + m.lang + ']';
            byArtist[k] = (byArtist[k] || 0) + 1;
        }
        console.log(`  ⚠ ${orphans.length} track(s) in the ledger are on NO station:`);
        Object.entries(byArtist).sort((a, b) => b[1] - a[1]).slice(0, 12)
            .forEach(([k, n]) => console.log('      ' + String(n).padStart(5) + '  ' + k));
        console.log('    A rule did not match them — check the pool, the language and the');
        console.log('    select for the station that should carry them. The files are fine.');
    }
}

console.log('');
console.log('  NEXT: Phase 3 (audio to CDN) → Phase 4 (schedules, --rebuild-pools) →');
console.log('        Phase 5 (site data) → Phase 6 (deploy) → Phase 7 (verify)');
console.log(bar);
