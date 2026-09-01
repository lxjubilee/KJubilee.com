'use strict';
/**
 * build-broadcast-bases.js — resolve the base recommendations against the
 * tower roster, and refuse to ship a base nobody can broadcast from.
 *
 * data/broadcast-bases.json is editorial: it names cities. This joins those
 * names to public/data/hm-towers.json (Cloudflare's published edge, which is
 * what the HM transmitters actually are) so every base carries its coordinates
 * and an honest tower flag, and writes public/data/station-bases.json for the
 * site to read.
 *
 * IT FAILS RATHER THAN GUESSES, for the same reason build-hm-towers.js does:
 * a base quietly resolving to the wrong continent is not something anyone would
 * catch by looking at the page. Specifically it refuses to write when
 *
 *   - a station slug is not in the catalogue, or a catalogue station has no
 *     bases (a station with no base is a station with no origin);
 *   - a base names a city absent from the `cities` gazetteer;
 *   - a gazetteer city is not on the tower roster AND has not been marked
 *     `"tower": false` by hand. Being off-tower is allowed — Jerusalem carries
 *     seven stations — but it has to be a decision somebody made, not a typo
 *     that silently downgraded a city;
 *   - a city claims a country the tower roster disagrees with;
 *   - a timezone the platform's IANA database does not recognise;
 *   - a station's bases do not cover at least two distinct UTC offsets. The
 *     entire point of multiple bases is time-zone coverage, so three bases in
 *     one zone is a mistake by definition.
 *
 * It REPORTS rather than fails where a human should look but nothing is broken:
 * anchors that disagree with a tenant's origin.city, and off-tower bases.
 *
 *   node tools/build-broadcast-bases.js
 *   node tools/build-broadcast-bases.js --check    (validate, write nothing)
 */

const fs = require('fs');
const path = require('path');

const tenants = require('./lib/tenants');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'broadcast-bases.json');
const TOWERS = path.join(ROOT, 'public', 'data', 'hm-towers.json');
// The catalogue moved with radio.html's inline script when the pages became
// Next routes; it is the same array, now at public/js/pages/radio.js.
const CATALOGUE = path.join(ROOT, 'public', 'js', 'pages', 'radio.js');
const OUT = path.join(ROOT, 'public', 'data', 'station-bases.json');

const CHECK_ONLY = process.argv.indexOf('--check') >= 0;

const problems = [];
const notices = [];
function fail(msg) { problems.push(msg); }

/** Accent- and punctuation-insensitive, matching build-hm-towers.js fold(). */
function fold(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Where a tenant writes the city in its own language and the tower roster uses
 * the English exonym. Both name the same place, so comparing them raw would
 * report a difference that is not one. Left is what a tenant may carry.
 */
const EXONYM = {
    'bucuresti': 'bucharest',
    'moskva': 'moscow',
    'roma': 'rome',
    'wien': 'vienna',
    'lisboa': 'lisbon',
    'ciudad de mexico': 'mexico city',
    'sao paulo': 'sao paulo',
    'kiev': 'kyiv',
    'koln': 'cologne',
    'praha': 'prague',
    'warszawa': 'warsaw',
    'yerushalayim': 'jerusalem',
};
function sameCity(a, b) {
    const x = fold(a), y = fold(b);
    return x === y || (EXONYM[x] || x) === (EXONYM[y] || y);
}

/**
 * The catalogue, read from radio.html rather than from the generated
 * stations-data.js.
 *
 * THIS IS DELIBERATE AND LOAD-BEARING. build-home-data.js merges this tool's
 * output into stations-data.js, so reading stations-data.js here would make
 * the two tools depend on each other's output and neither could be run first
 * on a clean checkout. radio.html is upstream of both.
 *
 * Only the slug and name are needed — the full eval that build-home-data.js
 * does to resolve stream constants is unnecessary for validation.
 */
function siteCatalogue() {
    const src = fs.readFileSync(CATALOGUE, 'utf8');
    const anchor = src.indexOf('const stations = [');
    if (anchor < 0) throw new Error('station array not found in radio.html');
    const start = src.indexOf('[', anchor);
    let depth = 0, end = -1;
    for (let i = start; i < src.length; i++) {
        if (src[i] === '[') depth++;
        else if (src[i] === ']' && --depth === 0) { end = i; break; }
    }
    if (end < 0) throw new Error('unbalanced station array in radio.html');
    const body = src.slice(start, end + 1);

    const out = [];
    const re = /slug:\s*"([a-z0-9-]+)"[\s\S]{0,400}?name:\s*"((?:[^"\\]|\\.)*)"/g;
    for (let m; (m = re.exec(body)) !== null;) out.push({ slug: m[1], name: m[2] });
    return out;
}

/**
 * Current UTC offset for a zone, in minutes. Used only to prove that a
 * station's bases sit in genuinely different zones — an exact instant is
 * irrelevant, the question is whether two cities keep the same clock.
 */
function offsetMinutes(zone) {
    const at = new Date('2026-07-01T12:00:00Z');
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = {};
    for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
    const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
    return (asIfUTC - at.getTime()) / 60000;
}

function validZone(zone) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; }
    catch (e) { return false; }
}

// ── load ─────────────────────────────────────────────────────────────────
const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const towers = JSON.parse(fs.readFileSync(TOWERS, 'utf8')).towers;
const catalogue = siteCatalogue();

const towerBy = new Map();
for (const t of towers) towerBy.set(fold(t.city) + '|' + t.cc, t);

// ── resolve the gazetteer ────────────────────────────────────────────────
const city = {};
for (const [name, meta] of Object.entries(src.cities)) {
    if (!meta.tz || !validZone(meta.tz)) {
        fail('city "' + name + '": timezone "' + meta.tz + '" is not an IANA zone');
        continue;
    }
    const hit = towerBy.get(fold(name) + '|' + meta.cc);
    const claimsTower = meta.tower !== false;

    if (!hit && claimsTower) {
        // Is the name on the roster under a different country? That is a real
        // mistake worth naming precisely rather than reporting as "not found".
        const anyCc = towers.filter(t => fold(t.city) === fold(name));
        fail('city "' + name + '" (' + meta.cc + ') is not on the tower roster'
            + (anyCc.length ? ' — the roster has it as ' + anyCc.map(t => t.cc).join('/') : '')
            + '. Mark it "tower": false if that is deliberate.');
        continue;
    }
    if (hit && meta.tower === false) {
        fail('city "' + name + '" is marked "tower": false but IS on the roster — drop the flag');
        continue;
    }

    // Carried through to the cards, which print "Sacramento, California". A
    // notice rather than a failure: a city with no state or country still
    // renders, as the bare city name, and refusing to write the whole roster
    // over one missing label would be the wrong trade.
    if (!meta.place) notices.push('city "' + name + '" has no "place" (its state, or its country outside the US)');

    city[name] = {
        city: name,
        // The state for a US city, the country for every other — what a reader
        // needs after the comma to know where the station actually is.
        place: meta.place,
        cc: meta.cc,
        tz: meta.tz,
        tower: !!hit,
        lat: hit ? hit.lat : null,
        lon: hit ? hit.lon : null,
        region: hit ? hit.region : null,
        offset: offsetMinutes(meta.tz),
    };
    if (!hit) notices.push('off-tower base: ' + name + ' (' + meta.cc + ') — deliberate, no edge there');
}

// ── resolve the stations ─────────────────────────────────────────────────
const bySlug = new Map(catalogue.map(s => [s.slug, s]));
const tenantOrigin = {};
for (const t of tenants.all()) {
    if (t.origin && t.origin.city) tenantOrigin[t.slug] = t.origin.city;
}

const out = {};
for (const [slug, entry] of Object.entries(src.stations)) {
    if (!bySlug.has(slug)) { fail('unknown station slug: ' + slug); continue; }
    const list = entry.bases || [];
    if (list.length < 2) { fail(slug + ': needs at least two bases, has ' + list.length); continue; }

    const resolved = [];
    for (const name of list) {
        if (!city[name]) { fail(slug + ': base "' + name + '" is not in the cities gazetteer'); continue; }
        resolved.push(city[name]);
    }
    if (resolved.length !== list.length) continue;

    const zones = new Set(resolved.map(b => b.offset));
    if (zones.size < 2) {
        fail(slug + ': all ' + resolved.length + ' bases keep the same clock ('
            + list.join(', ') + ') — that defeats the purpose');
        continue;
    }

    // The anchor is the first base. Where a tenant already asserts an origin,
    // a disagreement is a proposal that a human needs to accept, not an error.
    const origin = tenantOrigin[slug];
    if (origin && !sameCity(origin, resolved[0].city)) {
        notices.push('anchor differs from tenant origin: ' + slug
            + ' — tenant says ' + origin + ', proposed anchor is ' + resolved[0].city);
    }

    out[slug] = {
        why: entry.why || '',
        bases: resolved.map(b => ({
            city: b.city, place: b.place, cc: b.cc, tz: b.tz, tower: b.tower,
            lat: b.lat, lon: b.lon, region: b.region,
        })),
    };
}

/* ── EVERY STATION GETS A HOME, WITHOUT ANYONE REMEMBERING TO GIVE IT ONE ──
   A station with no base is a station with no origin, and until now that was
   caught here and nowhere else: this tool refused to write, somebody read the
   error, and the station stayed base-less until they got round to it. Fifteen
   of them had been sitting like that, including one added the same day.

   So a station that reaches this point with no bases is SEEDED rather than
   rejected. The anchor is the station's own declared origin — the tenant's
   `origin.city`, which sync-tenants.js writes from the STATIONS table's
   hostCity, so a new frequency already knows where it is from before this ever
   runs. Relays are taken from DEFAULT_RELAYS: the first gazetteer cities that
   add a UTC offset the anchor does not have, which is the minimum the schema
   demands and no more.

   A SEEDED ENTRY IS WRITTEN BACK to data/broadcast-bases.json marked
   `"auto": true`, and its `why` says it was seeded and wants a human. The point
   is that a station is never broadcast-less, not that the guess is good: the
   guess is a placeholder, and it is written down so replacing it is editing a
   line rather than starting from nothing.

   `--check` NEVER WRITES. It reports what would be seeded and still fails, so
   the validation gate keeps its meaning in CI and nobody's "check" quietly
   mutates an editorial file. */
const seeded = [];

/* Gazetteer cities only, in the order they are tried. Between the American
   coasts, western Europe and east Asia, any anchor on earth finds a second
   offset within the first few. */
const DEFAULT_RELAYS = ['Newark', 'Los Angeles', 'Frankfurt', 'Tokyo',
                        'Chicago', 'Dubai', 'Honolulu', 'Sydney'];

function gazetteerCity(name) {
    if (!name) return null;
    for (const c of Object.values(city)) {
        if (sameCity(c.city, name)) return c;
    }
    return null;
}

function seedBases(slug) {
    const anchor = gazetteerCity(tenantOrigin[slug]);
    if (!anchor) return null;            // nothing to anchor on — still a failure

    const bases = [anchor.city];
    const offsets = new Set([anchor.offset]);
    for (const name of DEFAULT_RELAYS) {
        if (offsets.size >= 2 && bases.length >= 3) break;
        const c = city[name];
        if (!c || bases.indexOf(c.city) >= 0 || offsets.has(c.offset)) continue;
        bases.push(c.city);
        offsets.add(c.offset);
    }
    return offsets.size >= 2 ? bases : null;
}

// Every station on the dial needs somewhere to broadcast from.
for (const s of catalogue) {
    if (out[s.slug] || problems.some(p => p.startsWith(s.slug + ':'))) continue;

    const bases = seedBases(s.slug);
    if (!bases) {
        fail('station has no bases and none could be seeded: ' + s.slug + ' (' + s.name + ')'
            + ' — give it a hostCity in the STATIONS table (sync-tenants writes it to the'
            + ' tenant origin), or an entry in data/broadcast-bases.json');
        continue;
    }

    const why = 'SEEDED AUTOMATICALLY from the station origin — replace this with a real'
        + ' anchor-and-relay rationale. The anchor is where the station says it is from;'
        + ' the relays only guarantee the two time zones the schema requires.';
    seeded.push({ slug: s.slug, name: s.name, bases: bases, why: why });

    const resolved = bases.map(n => city[n]);
    out[s.slug] = {
        why: why,
        auto: true,
        bases: resolved.map(b => ({
            city: b.city, place: b.place, cc: b.cc, tz: b.tz, tower: b.tower,
            lat: b.lat, lon: b.lon, region: b.region,
        })),
    };
}

/* Write the seeds back into the editorial file, so the next run reads a real
   entry rather than seeding again — and so the placeholder is somewhere a
   person can find and fix. Skipped under --check, which must stay read-only. */
if (seeded.length && !CHECK_ONLY) {
    for (const sd of seeded) {
        src.stations[sd.slug] = { bases: sd.bases, why: sd.why, auto: true };
    }
    fs.writeFileSync(SRC, JSON.stringify(src, null, 2) + '\n');
}

// ── report ───────────────────────────────────────────────────────────────
/* Under --check a seed is a FAILURE, not a fix. The seed keeps a live deploy
   from shipping a station with no origin; the gate exists to make sure nobody
   leaves the placeholder rationale in place. Both are true at once, and this
   is the line that keeps them from cancelling each other out. */
if (seeded.length && CHECK_ONLY) {
    for (const sd of seeded) {
        fail('station has no bases in data/broadcast-bases.json: ' + sd.slug
            + ' — a normal run would seed it as ' + sd.bases.join(', ')
            + '; write a real anchor and relays instead');
    }
}

if (seeded.length) {
    console.log('\n  ' + seeded.length + ' station(s) had no base and were SEEDED from their origin —');
    console.log('  edit data/broadcast-bases.json to replace the placeholder rationale:');
    for (const sd of seeded) {
        console.log('    · ' + sd.slug + '  ->  ' + sd.bases.join(', '));
    }
}

for (const n of notices) console.log('  · ' + n);

if (problems.length) {
    console.error('\n✗ ' + problems.length + ' problem' + (problems.length === 1 ? '' : 's') + ':');
    for (const p of problems) console.error('  - ' + p);
    console.error('\nNothing written.\n');
    process.exit(1);
}

const doc = {
    schema: 'kj.station.bases/1',
    note: 'Generated by tools/build-broadcast-bases.js from data/broadcast-bases.json. Do not edit.',
    stations: out,
};

const towered = Object.values(out).flatMap(s => s.bases).filter(b => b.tower).length;
const total = Object.values(out).flatMap(s => s.bases).length;
const cities = new Set(Object.values(out).flatMap(s => s.bases.map(b => b.city)));

console.log('\n  ' + Object.keys(out).length + ' stations, ' + total + ' bases, '
    + cities.size + ' distinct cities');
console.log('  ' + towered + '/' + total + ' bases sit on an HM tower');

if (CHECK_ONLY) { console.log('\n  --check: nothing written\n'); process.exit(0); }

fs.writeFileSync(OUT, JSON.stringify(doc, null, 1));
console.log('  wrote ' + path.relative(ROOT, OUT) + '\n');
