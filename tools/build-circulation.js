#!/usr/bin/env node
/**
 * build-circulation.js — potential outreach per station, and an honest total.
 *
 * Reads data/circulation.json (the research) and the station catalogue, and
 * writes public/js/circulation-data.js for the dial to read. Re-run it after
 * editing the research or adding a station; it never needs the research done
 * again, which is the whole reason the inputs live in a file.
 *
 *   node tools/build-circulation.js            # report, write nothing
 *   node tools/build-circulation.js --apply    # write circulation-data.js
 *
 * ── WHY THE TOTAL IS NOT THE SUM ────────────────────────────────────────────
 * A person who likes worship and country is in the circulation of both those
 * stations, and should be — each station really could reach them. Adding the
 * stations up would then count that person twice, and adding all 116 up would
 * produce a number larger than the human population, which is the standard way
 * this kind of figure becomes a lie.
 *
 * So the total is a UNION, computed per language and capped:
 *
 *     segment total = min( sum of that language's stations,
 *                          online population of that language x ceiling )
 *
 * and the global total is the sum of those capped segments. Two consequences
 * worth stating plainly:
 *   - The English segment saturates. Seventy-six stations against one online
 *     English population means the cap binds, and it should.
 *   - Per-station numbers use total speakers (L1+L2) because a bilingual
 *     listener really is reachable; the total uses first-language speakers
 *     only, because otherwise that same listener is counted under two
 *     languages. The two bases are deliberately different. See the methodology.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'circulation.json');
const OUT = path.join(ROOT, 'public', 'js', 'circulation-data.js');
const APPLY = process.argv.includes('--apply');

const model = JSON.parse(fs.readFileSync(DATA, 'utf8'));

// The catalogue, read the same way every other tool reads it.
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'js', 'stations-data.js'), 'utf8'), sandbox);
const STATIONS = sandbox.window.KJ_STATIONS || [];

const CEIL = model.assumptions.unionCeiling;

function langOf(s) { return s.lang || 'English'; }

function genreOf(s) {
  const g = model.genres[s.format];
  if (g && g.audience) return g;
  // A family-friendly or mainstream station with no entry is a general-audience
  // station; anything else is assumed to be for the faith audience.
  const general = s.familyFriendly || s.primary === 'mainstream';
  return model.genreFallback[general ? 'general' : 'faith'];
}

/* WHICH AUDIENCE a station is actually programmed for. The format alone cannot
   answer this — Pentecostal Shout's format is 'Praise & Worship', identical to
   a generic worship station — so tradition-bound stations are named one by one
   in stationOverrides and everything else takes its genre's tier. */
function audienceOf(s, g) {
  const o = model.stationOverrides[s.slug];
  return (o && o.audience) || g.audience;
}

/** Addressable people for one language, on one basis, in one audience tier. */
function pool(lang, basis, audience) {
  const L = model.languages[lang];
  if (!L) return null;
  const speakers = basis === 'l1' ? L.l1 : L.total;
  const online = speakers * L.online;                 // the device gate, always

  const tier = model.audiences[audience];
  if (!tier) return online;

  if (tier.of === 'online')   return online * tier.share;
  if (tier.of === 'christian') return online * L.christianShare * tier.share;
  if (tier.of === 'children') {
    // Children with a device they can actually reach, not children in general
    // and not their parents.
    const kids = speakers * (L.childShare || 0.2) * L.online * model.assumptions.childDeviceFactor;
    return kids * tier.share;
  }
  return online * tier.share;
}

const unknownLangs = new Set();
const unknownFormats = new Set();

/* A LANGUAGE EDITION is the only station on this dial in its language, so its
   potential outreach is everyone who speaks it and has a device — no belief
   filter, no genre filter. See assumptions.languageEditionWhy: applying them
   stacked three narrowings and gave Israel Inspire 1,337 people. */
function isLanguageEdition(s) {
  return s.primary === 'multilanguage' || s.band === 'multi';
}

const rows = STATIONS.map((s) => {
  const lang = langOf(s);
  const g = genreOf(s);
  if (!model.languages[lang]) unknownLangs.add(lang);
  if (!model.genres[s.format]) unknownFormats.add(s.format);

  let aud, share, circulation;
  if (isLanguageEdition(s) && model.assumptions.languageEditionFullReach) {
    aud = 'general'; share = 1;
    const base = pool(lang, model.assumptions.reachBasisPerStation, 'general');
    circulation = base === null ? 0 : Math.round(base);
  } else {
    aud = audienceOf(s, g); share = g.share;
    const base = pool(lang, model.assumptions.reachBasisPerStation, aud);
    circulation = base === null ? 0 : Math.round(base * share);
  }
  return { slug: s.slug, hm: s.hm, name: s.name, lang, format: s.format,
           live: !!s.prototype, audience: aud, share, circulation };
});

// ── the union, per language, then summed ───────────────────────────────────
const bySegment = new Map();
for (const r of rows) {
  const seg = bySegment.get(r.lang) || { lang: r.lang, stations: 0, sum: 0, liveSum: 0, liveStations: 0 };
  seg.stations++; seg.sum += r.circulation;
  if (r.live) { seg.liveStations++; seg.liveSum += r.circulation; }
  bySegment.set(r.lang, seg);
}
for (const seg of bySegment.values()) {
  // The cap is the whole online population of that language on the
  // first-language basis — faith and general listeners alike, since a person
  // reachable by any station is reachable, whatever they believe.
  const cap = pool(seg.lang, model.assumptions.reachBasisForTotal, 'general');
  seg.cap = cap === null ? 0 : Math.round(cap * CEIL);
  seg.total = Math.min(seg.sum, seg.cap);
  seg.liveTotal = Math.min(seg.liveSum, seg.cap);
  seg.saturated = seg.sum > seg.cap;
}

const segments = [...bySegment.values()].sort((a, b) => b.total - a.total);
const grand = segments.reduce((n, s) => n + s.total, 0);
const grandLive = segments.reduce((n, s) => n + s.liveTotal, 0);
const naiveSum = rows.reduce((n, r) => n + r.circulation, 0);

/* THE HEADLINE — everyone this band could ever reach.
   Every person with a device who speaks one of the languages on the dial,
   believer or not, because the band carries stations for both. First-language
   basis so nobody is counted twice, and no genre or belief filter at all: this
   is the ceiling the band is aiming at, not what today's stations cover. */
const deviceReachable = Object.keys(model.languages).reduce(
  (n, lang) => n + (pool(lang, 'l1', 'general') || 0), 0);

const towers = (() => {
  try { return (JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'hm-towers.json'), 'utf8')).towers || []).length; }
  catch (e) { return null; }
})();

const liveStations = rows.filter((r) => r.live).length;
const totalSongs = STATIONS.reduce((n, s) => n + (s.tracks || 0), 0);
// Songs are counted once per station, and a track legitimately airs on several
// stations, so the catalogue figure is the distinct count and the sum is not.
const distinctSongs = (() => {
  try {
    const reg = fs.readFileSync(path.join(process.env.CDN_LOCAL_ROOT || 'J:/kjubilee.com', 'music', 'songid-registry.tsv'), 'utf8');
    return Math.max(0, reg.split(/\r?\n/).filter((l) => l.trim()).length - 1);
  } catch (e) { return null; }
})();

const N = (n) => n.toLocaleString('en-US');

console.log(`\ncirculation model — ${model.updated}   ceiling ${CEIL}\n`);
console.log('  segment        stations  live        per-station sum          capped total  ');
console.log('  ' + '-'.repeat(76));
for (const s of segments.slice(0, 12)) {
  console.log('  ' + s.lang.padEnd(14) + String(s.stations).padStart(6) + String(s.liveStations).padStart(6) +
              N(s.sum).padStart(22) + N(s.total).padStart(22) + (s.saturated ? '  (capped)' : ''));
}
if (segments.length > 12) console.log(`  ... and ${segments.length - 12} smaller segments`);
console.log('  ' + '-'.repeat(76));
console.log('  naive sum of every station     ' + N(naiveSum).padStart(22) + '   <- what NOT to publish');
console.log('  de-duplicated total            ' + N(grand).padStart(22));
console.log('  de-duplicated, live only       ' + N(grandLive).padStart(22));
console.log('');
console.log('  every device on earth          ' + N(model.assumptions.worldDeviceUsers).padStart(22) + '   <- the dial headline');
console.log('  ...in a language we carry      ' + N(Math.round(deviceReachable)).padStart(22));
console.log('    every person with a device who speaks a language on this dial,');
console.log("    believer or not — the ceiling, not what today's stations cover.");
console.log('');
console.log(`  towers: ${towers === null ? '?' : towers}`);
console.log(`  stations: ${STATIONS.length} (${liveStations} live)   songs on air: ${N(totalSongs)}` +
            (distinctSongs !== null ? `   distinct in ledger: ${N(distinctSongs)}` : ''));
console.log(`  overlap removed: ${N(naiveSum - grand)} (${((1 - grand / naiveSum) * 100).toFixed(1)}% of the naive sum)`);

if (unknownLangs.size) console.log(`\n  WARNING languages with no model entry: ${[...unknownLangs].join(', ')}`);
if (unknownFormats.size) console.log(`  note: ${unknownFormats.size} format(s) fell back to a default share: ${[...unknownFormats].slice(0, 8).join(', ')}${unknownFormats.size > 8 ? ' …' : ''}`);

if (!APPLY) { console.log('\n  report only — re-run with --apply to write circulation-data.js\n'); process.exit(0); }

const out = {
  schema: 'kj.circulation.computed/1',
  updated: model.updated,
  generated: new Date().toISOString().slice(0, 10),
  ceiling: CEIL,
  totals: {
    stations: STATIONS.length,
    liveStations,
    songs: totalSongs,
    distinctSongs,
    worldDevice: model.assumptions.worldDeviceUsers,
    towers,
    deviceReachable: Math.round(deviceReachable),
    reachedToday: grand,
    reachedTodayLive: grandLive,
    naiveSum,
  },
  segments: segments.map((s) => ({ lang: s.lang, stations: s.stations, sum: s.sum, cap: s.cap, total: s.total, saturated: s.saturated })),
  stations: Object.fromEntries(rows.map((r) => [r.slug, r.circulation])),
};

fs.writeFileSync(OUT,
  '/* GENERATED by tools/build-circulation.js from data/circulation.json — do not edit.\n' +
  '   Potential outreach per station, and the de-duplicated total. See\n' +
  '   docs/CIRCULATION-METHODOLOGY.md for what these numbers do and do not claim. */\n' +
  'window.KJ_CIRCULATION = ' + JSON.stringify(out) + ';\n', 'utf8');
console.log(`\n  wrote ${path.relative(ROOT, OUT)} (${fs.statSync(OUT).size} bytes)\n`);
