#!/usr/bin/env node
/**
 * build-home-data.js - regenerates public/js/stations-data.js
 *
 * Source of truth is the station catalog embedded in public/radio.html (the
 * `const stations = [...]` array). This script lifts that array out, enriches
 * each entry with the presentation metadata the home page needs (display
 * format, ident gradient, host persona, shelf placement) and writes it back
 * out as a plain browser script defining window.KJ_MEMBERS / KJ_STATIONS /
 * KJ_SECTIONS / KJ_FEATURED.
 *
 * Re-run after editing the station list in radio.html:
 *   node tools/build-home-data.js
 */
const fs = require('fs');
const tenants = require('./lib/tenants');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// The catalogue moved with radio.html's inline script when the pages became
// Next routes; it is the same array, now at public/js/pages/radio.js.
const RADIO = path.join(ROOT, 'public', 'js', 'pages', 'radio.js');
const OUT = path.join(ROOT, 'public', 'js', 'stations-data.js');
const BASES = path.join(ROOT, 'public', 'data', 'station-bases.json');

// --- 1. lift the catalog out of radio.html -------------------------------
function readStations() {
  const src = fs.readFileSync(RADIO, 'utf8');
  const anchor = src.indexOf('const stations = [');
  if (anchor < 0) throw new Error('station array not found in radio.html');
  const start = src.indexOf('[', anchor);
  let depth = 0, end = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']' && --depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error('unbalanced station array in radio.html');
  // Resolve the STREAM_* constants to the URLs they hold rather than nulling
  // them: the footer player on the static pages needs somewhere to point, and
  // it only has stations-data.js to read. Any constant the catalog references
  // but radio.html does not define still becomes null, so a typo surfaces as a
  // station that cannot play rather than as a crash here.
  const streams = {};
  const declRe = /const\s+(STREAM_[A-Z_0-9]+)\s*=\s*"([^"]+)"/g;
  for (let m; (m = declRe.exec(src)) !== null;) streams[m[1]] = m[2];
  const literal = src.slice(start, end + 1).replace(/STREAM_[A-Z_0-9]+/g, function (name) {
    return streams[name] ? JSON.stringify(streams[name]) : 'null';
  });
  return eval(literal); // eslint-disable-line no-eval
}

// --- 2. Inspire Family personas ------------------------------------------
// Roster, focus lines and ident gradients as used across the Inspire network.
const MEMBERS = [
  { id: 'nova',     name: 'Nova Inspire',     short: 'Nova',     focus: 'For the doubting',            gradient: ['#463B78', '#7566B4'] },
  { id: 'jubilee',  name: 'Jubilee Inspire',  short: 'Jubilee',  focus: 'The whole house sings',       gradient: ['#4B47C7', '#8481F2'] },
  { id: 'melody',   name: 'Melody Inspire',   short: 'Melody',   focus: 'Everyday family faith',       gradient: ['#BE4F86', '#E88AB4'] },
  { id: 'zariah',   name: 'Zariah Inspire',   short: 'Zariah',   focus: 'Caribbean and diaspora',      gradient: ['#A82E6E', '#E36FA6'] },
  { id: 'caleb',    name: 'Caleb Inspire',    short: 'Caleb',    focus: 'Young, courageous worship',   gradient: ['#1E7A6E', '#42B6A4'] },
  { id: 'zev',      name: 'Zev Inspire',      short: 'Zev',      focus: 'Hebrew roots and the feasts', gradient: ['#274C9B', '#5A82DE'] },
  { id: 'imani',    name: 'Imani Inspire',    short: 'Imani',    focus: 'Pentecostal fire',            gradient: ['#9E2F52', '#E0A24E'] },
  { id: 'santiago', name: 'Santiago Inspire', short: 'Santiago', focus: 'Latino heart',                gradient: ['#B2472A', '#E8913C'] },
  { id: 'tahoma',   name: 'Tahoma Inspire',   short: 'Tahoma',   focus: 'Native voice and healing',    gradient: ['#9C4E2A', '#C67A4E'] },
  { id: 'amir',     name: 'Amir Inspire',     short: 'Amir',     focus: 'South Asian soul',            gradient: ['#7E3A72', '#C071A8'] },
  { id: 'elias',    name: 'Elias Inspire',    short: 'Elias',    focus: 'Appalachian repentance',      gradient: ['#8F5626', '#C98A42'] },
  { id: 'eliana',   name: 'Eliana Inspire',   short: 'Eliana',   focus: 'Folk wisdom, a sister voice', gradient: ['#5A7446', '#8FB06A'] },
  // The two children's music brands. NOT Inspire Family voices — they are
  // catalogues with their own sites (mytinytiggles.com, gopartygiggles.com) that
  // front a station each, so they carry their own artwork rather than a
  // Jubilee<Name>-Circle-200 portrait and are excluded from the host rota below.
  { id: 'tiny-tiggles',  name: 'Tiny Tiggles',  short: 'Tiny Tiggles', focus: 'Little ones, big songs',   gradient: ['#2E6F8E', '#63B4D1'],
    image: '/images/members/TinyTiggles-Circle-200.png' },
  { id: 'party-giggles', name: 'Party Giggles', short: 'Party Giggles', focus: 'Kids party praise',        gradient: ['#B8474F', '#E8888C'],
    image: '/images/members/PartyGiggles-Circle-200.png' }
];
const AVATAR = {
  nova: 'Nova', jubilee: 'Inspire', melody: 'Melody', zariah: 'Zariah', caleb: 'Caleb',
  zev: 'Zev', imani: 'Imani', santiago: 'Santiago', tahoma: 'Tahoma', amir: 'Amir',
  elias: 'Elias', eliana: 'Elina'
};
MEMBERS.forEach(function (m) {
  // A member with its own artwork keeps it; the twelve derive theirs from AVATAR.
  if (!m.image) m.image = '/images/members/Jubilee' + AVATAR[m.id] + '-Circle-200.png';
});

// --- 3. presentation lookups ---------------------------------------------
// One ident palette per programming type, so a cover reads as its format
// before you get to the title.
/* WHAT THE FORMAT COLUMN IS FOR: the primary music genre, or the kind of talk.
   Two groups of stations were answering a different question entirely.

   THE LANGUAGE EDITIONS used to print their language — "Spanish", "Japanese" —
   which is what the LANGUAGE column beside it already says, so thirty rows spent
   their format on a duplicate and told a reader nothing about what they would
   hear. They split cleanly on prayerLine: ten are continuous prayer, twenty are
   worship music.

   THE MAINSTREAM BAND used to print "AI Format", which is a production note
   rather than a genre — it describes how the music was made, not what it sounds
   like. Nineteen stations, each with its genre already stated plainly in its own
   name and description; those are transcribed below rather than invented.

   The table also carries any OTHER station whose genre is narrower than its
   programming type. Gospel Country is "music" like a dozen others, and calling
   it Praise & Worship is true but useless — Christian Country is what a listener
   is choosing. Add a slug here whenever the type label is not the answer. */
const STATION_GENRE = {
    // Christian music, more specific than the type label
    'country-gospel':       'Christian Country',

    // The mainstream band

    'inspire-family-pop':   'Family Pop',
    'inspire-kids':         'Kids',
    'inspire-cafe':         'Coffeehouse',
    'inspire-active':       'Workout',
    'inspire-focus':        'Focus & Study',
    'inspire-drive':        'Drive Time',
    'inspire-celebrations': 'Celebration',
    'inspire-chill':        'Chill',
    'inspire-classical':    'Classical',
    'inspire-throwback':    'Throwback',
    'inspire-jazz':         'Jazz',
    'inspire-latin':        'Latin',
    'inspire-country':      'Country',
    'inspire-80s-90s':      '80s & 90s',
    'inspire-wellness':     'Wellness',
    'inspire-holiday':      'Holiday',
    'inspire-stories':      'Storytelling',
    'inspire-live':         'Live Sessions',
    'inspire-rising':       'New & Rising',
};

/**
 * Whether this is one of the continuous prayer lines.
 *
 * ONE DEFINITION, because there are two callers and they must not disagree.
 * genreFor runs while the output record is still being built, so it cannot read
 * the prayerLine field — that field is assigned from this same predicate a few
 * dozen lines further down. Asking the name twice in two places is how the
 * prayer lines silently came out labelled "Praise & Worship".
 */
function isPrayerLine(s) { return /^Jubilee Prayers in /.test(s.name); }

/**
 * The genre this station is listed under.
 *
 * Order matters. A hand-written formatLabel wins over everything — it is the
 * editorial answer for the stations that have one. Then the two groups above.
 * Everything else keeps the label for its programming type, which for a Bible
 * study or a prayer line already IS the format.
 */
function genreFor(s, intl) {
    if (s.formatLabel) return s.formatLabel;
    if (intl && intl[0]) return isPrayerLine(s) ? 'Prayer' : 'Praise & Worship';
    if (STATION_GENRE[s.slug]) return STATION_GENRE[s.slug];
    return (FORMAT[s.primary] || {}).label || 'Praise & Worship';
}

const FORMAT = {
  music:         { label: 'Praise & Worship', gradient: ['#3E2430', '#7A4560'] },
  devotionals:   { label: 'Devotional',       gradient: ['#1A2440', '#33538F'] },
  bible_studies: { label: 'Bible Study',      gradient: ['#38301C', '#6E5A2E'] },
  online_church: { label: 'Online Church',    gradient: ['#1C3630', '#2F6B5C'] },
  prayer:        { label: 'Prayer',           gradient: ['#2A1F3E', '#584180'] },
  children:      { label: 'Kids',             gradient: ['#153A46', '#2E7E92'] },
  sleep_rest:    { label: 'Sleep & Rest',     gradient: ['#151C33', '#2B3766'] },
  talk_podcasts: { label: 'Talk',             gradient: ['#332020', '#6E4040'] },
  hebrew_roots:  { label: 'Hebrew Roots',     gradient: ['#1E2E1C', '#436B3A'] },
  radio_theater: { label: 'Radio Theater',    gradient: ['#301A2E', '#6B3A62'] },
  multilanguage: { label: 'International',    gradient: ['#1C2C3A', '#3A6180'] },
  mainstream:    { label: 'AI Format',        gradient: ['#2C2418', '#6B5630'] }
};

// International stations: language, flag, region and host, keyed by slug so
// this table stays pure ASCII while the station names carry native script.
const INTL = {
  'familia-inspire-espanol':      ['Spanish',    'es', 'americas', 'santiago'],
  'jubilee-prayers-spanish':      ['Spanish',    'es', 'americas', 'santiago'],
  'brasil-inspire-portugues':     ['Portuguese', 'br', 'americas', 'santiago'],
  'jubilee-prayers-portuguese':   ['Portuguese', 'pt', 'americas', 'santiago'],
  'asia-inspire-zhongwen':        ['Mandarin',   'cn', 'asia',     'eliana'],
  'jubilee-prayers-mandarin':     ['Mandarin',   'cn', 'asia',     'eliana'],
  'inspire-india-hindi':          ['Hindi',      'in', 'south',    'amir'],
  'jubilee-prayers-hindi':        ['Hindi',      'in', 'south',    'amir'],
  'inspire-crown-arabic':         ['Arabic',     'sa', 'middle',   'amir'],
  'jubilee-prayers-arabic':       ['Arabic',     'sa', 'middle',   'amir'],
  'france-inspire-francais':      ['French',     'fr', 'europe',   'zariah'],
  'jubilee-prayers-french':       ['French',     'fr', 'europe',   'zariah'],
  'jubilee-praise-romana':        ['Romanian',   'ro', 'europe',   'elias'],
  'korea-inspire-hangugeo':       ['Korean',     'kr', 'asia',     'eliana'],
  'jubilee-prayers-korean':       ['Korean',     'kr', 'asia',     'eliana'],
  'deutschland-inspire-deutsch':  ['German',     'de', 'europe',   'elias'],
  'russia-inspire-russkiy':       ['Russian',    'ru', 'europe',   'zev'],
  'jubilee-prayers-russian':      ['Russian',    'ru', 'europe',   'zev'],
  'italia-inspire-italiano':      ['Italian',    'it', 'europe',   'elias'],
  'pilipinas-inspire-tagalog':    ['Tagalog',    'ph', 'asia',     'eliana'],
  'jubilee-prayers-tagalog':      ['Tagalog',    'ph', 'asia',     'eliana'],
  'vietnam-inspire-tieng-viet':   ['Vietnamese', 'vn', 'asia',     'eliana'],
  'africa-inspire-kiswahili':     ['Swahili',    'tz', 'africa',   'imani'],
  'jubilee-prayers-swahili':      ['Swahili',    'tz', 'africa',   'imani'],
  'west-africa-inspire-yoruba':   ['Yoruba',     'ng', 'africa',   'imani'],
  'ethiopia-inspire-amharic':     ['Amharic',    'et', 'africa',   'imani'],
  'polska-inspire-polski':        ['Polish',     'pl', 'europe',   'zev'],
  'indonesia-inspire-bahasa':     ['Indonesian', 'id', 'asia',     'eliana'],
  'japan-inspire-nihongo':        ['Japanese',   'jp', 'asia',     'eliana'],
  'bengal-inspire-bangla':        ['Bengali',    'bd', 'south',    'amir']
};

// Domestic stations: a host rota per programming type, so a station always
// draws the same voice.
const HOST_ROTA = {
  music:         ['melody', 'jubilee', 'caleb', 'nova'],
  devotionals:   ['nova', 'zev', 'tahoma'],
  bible_studies: ['zev', 'caleb', 'elias', 'jubilee'],
  online_church: ['tahoma', 'nova', 'eliana', 'melody'],
  prayer:        ['imani', 'jubilee'],
  children:      ['melody', 'jubilee', 'caleb'],
  sleep_rest:    ['nova', 'eliana', 'tahoma'],
  talk_podcasts: ['caleb'],
  hebrew_roots:  ['zev', 'amir', 'elias'],
  radio_theater: ['elias'],
  mainstream:    ['jubilee', 'melody', 'caleb', 'nova', 'santiago', 'zariah', 'tahoma', 'imani', 'eliana', 'elias']
};
// Jubilee fronts the flagship station - she is the face of the home page.
// Without an entry here a station takes the next name off HOST_ROTA, which is
// fine for a generic shelf but wrong for a station built around one persona's
// catalog: Country Gospel plays Elias and Eliana, and Gospel Fire is Imani's
// record collection end to end.
const HOST_OVERRIDE = {
    'jubilee-radio': 'jubilee', 'jubilee-praise': 'zev', 'logos': 'nova',
    // Stations built around one persona's catalog, so the host is the artist
    // actually on air rather than the next name off the rota.
    'country-gospel': 'elias',        // Elias & Eliana Inspire — HM335.16-EN
    'jubilee-gospel-fire': 'imani',   // Imani Inspire — HM339.18-EN
    'latin-worship': 'santiago',      // Santiago Inspire — HM376.15-EN
    'hebraic-celebrations': 'zev',    // Zev Inspire — HM377.70-EN
    'jubilee-ccm': 'jubilee',         // Celebrate Yeshua! — HM313.12, fronted by Jubilee
    // The two children's catalogues front their own stations.
    'gods-little-lambs': 'tiny-tiggles',    // HM325.18 — plays the Tiny Tiggles catalogue
    'jubilee-kids-party': 'party-giggles',  // HM329.12 — plays the Party Giggles catalogue
    // Pinned to the host it already had: the two entries above take two slots
    // out of the `children` rota, which re-dealt this one. Its cover is
    // already rendered with Caleb in it.
    'bedtime-blessings': 'caleb',
    // Pinned to the host they already had. The two entries above take two slots
    // out of the `music` rota, which would otherwise re-deal the avatar on these
    // six unrelated stations. Nothing significant about these pairings — they
    // are simply what the rotation had already produced.
    'inspire-hymns-heritage': 'nova', 'riddim-and-rhyme': 'zariah',
    'radiant-stones-radio': 'jubilee', 'inspire-acapella': 'caleb',
    'midnight-praise': 'nova', 'island-hallelujah': 'tahoma',
    'ancient-paths': 'amir',          // Amir Inspire — HM345.24-EN
    // Yes and Amen plays all twelve of them, so no artist is 'the artist on
    // air'. Elias fronts it because the property opens with his record and
    // apostolic commission is the register the whole catalogue declares in.
    'yes-and-amen': 'elias',          // Yes and Amen — HM314.88-EN
};

// Family-friendly picks out of the mainstream band.
const FAMILY_MAINSTREAM = ['inspire-kids', 'inspire-celebrations',
  'inspire-stories', 'inspire-classical', 'inspire-holiday', 'inspire-family-pop'];

// A whole shelf of one format would otherwise be a wall of identical covers,
// so each station's ident is nudged off its format palette by a fixed amount
// derived from its own frequency - same station, same colour, every build.
function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return '#' + seg.map(function (v) {
    return Math.round((v + m) * 255).toString(16).padStart(2, '0');
  }).join('').toUpperCase();
}
function varyGradient(pair, hm) {
  const digits = hm.replace(/\D/g, '');
  const seed = parseInt(digits, 10) || 0;
  const hueShift = ((seed % 29) - 14) * 1.6;   // roughly -22deg .. +22deg
  const lightShift = (((seed >> 2) % 7) - 3) * 0.012;
  return pair.map(function (hex) {
    const hsl = hexToHsl(hex);
    return hslToHex(hsl[0] + hueShift, hsl[1], Math.min(0.72, Math.max(0.07, hsl[2] + lightShift)));
  });
}

// --- 3b. which stations are genuinely programmed ---------------------------
// A station is ON AIR when it has a catalog of its own on the dial — a built
// station manifest with tracks in it. That manifest is the same artifact the
// Liquidsoap playlist is generated from, so "has a manifest" and "its mount
// plays its own music" are the same fact, and the badge cannot drift from the
// broadcast.
//
// The alternative — trusting `streamUrl` — is what produced 102 ON AIR badges
// for 5 programmed stations: the other 97 pointed at a shared mount running a
// 1-2 track loop out of a local /songs folder. A station with a stream URL but
// no catalog is a placeholder, and the card should say so.
const RADIO_ROOT = path.join(process.env.CDN_LOCAL_ROOT || 'J:\kjubilee.com', 'radio');

function programmedStations() {
  const byHm = new Map();
  let dirs = [];
  try { dirs = fs.readdirSync(RADIO_ROOT); } catch (e) { return byHm; }
  for (const id of dirs) {
    const p = path.join(RADIO_ROOT, id, 'delivery', 'music.json');
    let m;
    try { m = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
    const tracks = (m.totals && m.totals.tracks) || 0;
    // Join on the HM frequency, not the slug. The site slug and the manifest
    // slug are allowed to differ — HM 305.12 is `jubilee-praise` in the station
    // catalog and `torah-sings` in the manifest — but a frequency identifies
    // exactly one station on the dial, by definition (BR-B2).
    if (tracks > 0 && m.hm) byHm.set(String(m.hm), { id, tracks, mount: m.mount, slug: m.station_slug });
  }
  return byHm;
}

const PROGRAMMED = programmedStations();
function isProgrammed(s) { return PROGRAMMED.has(String(s.hm)); }
// How many songs are in this station's rotation. Straight from the manifest the
// broadcast playlist is generated from, so the number on the page is the number
// actually on air — not an estimate, and not a figure anyone has to maintain.
function trackCount(s) {
  const p = PROGRAMMED.get(String(s.hm));
  return p ? p.tracks : 0;
}

// --- 4. enrich ------------------------------------------------------------
// Tenants keyed by frequency, so the catalogue can advertise which stations
// publish a daily programming file.
const tenantByHm = {};
for (const t of tenants.all()) tenantByHm[t.hm] = t.id;

// --- 3c. where each station broadcasts from -------------------------------
// Resolved by tools/build-broadcast-bases.js against the tower roster, so by
// the time it gets here every city is either a known HM edge or a deliberate
// off-tower choice. Missing file is fatal rather than silently shipping a dial
// where no station says where it comes from — run that tool first.
const BASES_BY_SLUG = (function () {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(BASES, 'utf8')); }
  catch (e) {
    throw new Error('public/data/station-bases.json is missing or unreadable — '
      + 'run `node tools/build-broadcast-bases.js` first (' + e.message + ')');
  }
  return doc.stations || {};
})();

const raw = readStations();
const counters = {};
const stations = raw.map(function (s, i) {
  const fmt = FORMAT[s.primary] || FORMAT.mainstream;
  const intl = INTL[s.slug] || [];

  // NOTE: an overridden station does not consume a rota slot, so adding an
  // entry to HOST_OVERRIDE re-deals the host of every later station in the
  // same format. When you pin a station, re-run and diff stations-data.js —
  // and pin anything that moved that you did not mean to move.
  let host = HOST_OVERRIDE[s.slug] || intl[3];
  if (!host) {
    const rota = HOST_ROTA[s.primary] || HOST_ROTA.mainstream;
    counters[s.primary] = (counters[s.primary] || 0) + 1;
    host = rota[(counters[s.primary] - 1) % rota.length];
  }

  return {
    slug: s.slug,
    hm: s.hm,
    freq: s.frequency,
    name: s.name,
    band: s.band,
    primary: s.primary,
    format: genreFor(s, intl),
    gradient: varyGradient(fmt.gradient, s.hm),
    mode: s.mode,
    phase: s.phase,
    rank: s.bestseller,
    reach: s.reach,
    description: s.description,
    listeners: s.listeners,
    // ON AIR means the station broadcasts ITS OWN programming — verified, not
    // asserted. Keying this on "is a URL configured" made all 102 stations
    // claim to be on air while 88 of them shared one mount playing the same
    // two songs on a loop. A badge that is always true tells a listener
    // nothing. See programmedStations() for what counts as programmed.
    prototype: isProgrammed(s),
    tracks: trackCount(s),
    // What the footer player actually connects to. A catalog station plays its
    // manifest; everything else points at an Icecast mount.
    // THE TENANT ID, where this station has one.
    //
    // Without it the player cannot find the station's daily programming file —
    // that file is keyed by tenant id (HM305.12-EN), and the catalogue only
    // carries the frequency (305.12) and the language name. The player was
    // therefore showing the station name where the song title belongs, because
    // for a stream-backed station it had no way to know what was playing.
    // Matched on hm, which is unambiguous; slug is not (see HM 305.12).
    tenant: tenantByHm[s.hm] || null,
    manifest: s.musicManifestUrl || null,
    stream: s.streamUrl || null,
    host: host,
    show: s.currentShow || null,
    schedule: s.schedule || [],
    // The pill carries the band, which the format line no longer duplicates.
    pill: intl[0] ? 'International' : (s.band === 'fivefold' ? 'Five-Fold' : 'Mainstream'),
    lang: intl[0] || 'English',
    flag: intl[1] || 'us',
    region: intl[2] || 'domestic',
    // WHERE THIS STATION BROADCASTS FROM. The first base is the anchor — the
    // city the station belongs to — and the rest are relays in other time
    // zones, so a listener is inside a base's own clock rather than shifted
    // into somebody else's. See data/broadcast-bases.json for the reasoning
    // behind each pick; `why` carries it through to the page.
    bases: (BASES_BY_SLUG[s.slug] || {}).bases || [],
    basesWhy: (BASES_BY_SLUG[s.slug] || {}).why || '',
    prayerLine: isPrayerLine(s),
    familyFriendly: ['children', 'sleep_rest', 'radio_theater'].indexOf(s.primary) >= 0
      || FAMILY_MAINSTREAM.indexOf(s.slug) >= 0,
    order: i
  };
});

// --- 5. shelves per category ---------------------------------------------
const bySlug = new Map(stations.map(function (s) { return [s.slug, s]; }));
// pick() is strict on purpose: a typo in a shelf list should fail the build,
// not silently ship a short shelf.
const pick = function () {
  return Array.prototype.slice.call(arguments).map(function (slug) {
    if (!bySlug.has(slug)) throw new Error('unknown slug on a shelf: ' + slug);
    return slug;
  });
};
const where = function (fn) { return stations.filter(fn).map(function (s) { return s.slug; }); };
const top = function (slugs, n) {
  return slugs.slice().sort(function (a, b) { return bySlug.get(b).rank - bySlug.get(a).rank; }).slice(0, n);
};
const intlOf = function (region) {
  return where(function (s) { return s.primary === 'multilanguage' && s.region === region && !s.prayerLine; });
};
const hostedBy = function (ids, limit) {
  const list = where(function (s) { return ids.indexOf(s.host) >= 0; });
  return limit ? list.slice(0, limit) : list;
};

// The home page: every English Christian music station in one flat list.
// `music` is the worship/praise band; `mainstream` is the AI music formats
// (Cafe, Drive, Jazz, Country, Throwback...). International stations are
// excluded — they have their own section, and this list is the English dial.
//
// Live stations sort to the front. `prototype` is the on-air flag: it is true
// exactly when a station has a manifest to play, so this ordering follows the
// catalog automatically as more stations come on air. Within each group the
// order is by rank, the same measure the other shelves sort on.
const FLAGSHIP = 'jubilee-radio';

// Order any set of stations the way the flat pages present them: whatever is
// actually on air first, then by rank. `prototype` is the on-air flag, so a
// station rises to the top of its page the moment it gets a manifest.
const flatOrder = function (slugs) {
  return slugs.slice().sort(function (a, b) {
    const A = bySlug.get(a), B = bySlug.get(b);
    if (!!A.prototype !== !!B.prototype) return A.prototype ? -1 : 1;
    if (a === FLAGSHIP) return -1;
    if (b === FLAGSHIP) return 1;
    return B.rank - A.rank;
  });
};
// Stations that belong on the home dial despite not being music by `primary`,
// each pinned directly after a station already on the shelf.
//
// Jubilee Kids Party is programming for children, so the filter below keeps it
// out — but it is ON AIR with a full catalogue, and a home page that lists the
// stations you can actually listen to should not omit one of them. It is placed
// explicitly rather than left to rank: it ties with Gospel Country on 90, and a
// tie would drop it into the middle of the live block instead of the end.
const HOME_PINNED = [
  { slug: 'jubilee-kids-party', after: 'jubilee-gospel-fire' },   // HM329.12 after HM339.18
  /* God's Little Lambs is primary 'children', so it lands on Family Friendly on
     its own and would never reach Home — but it is Bible songs, which is
     Christian music by any reading, and a parent looking for it arrives at the
     front door like everyone else. Anchored to the other kids station rather
     than dropped among the adult worship formats, so the two sit together.
     It keeps its Family Friendly place as well; the shelves overlap by design. */
  { slug: 'gods-little-lambs',  after: 'jubilee-kids-party' },    // HM325.18 after HM329.12
];

// The opening twelve cards, in the order they are meant to be read. Rank
// decides the rest of the shelf, but the top of Home is a shop window and its
// order is an editorial call that no score can express — Gospel Country and
// Jubilee Kids Party tie on 90, and Torah Sings outranks stations that should
// not lead. Anything listed here must already qualify for the shelf (or be
// pinned onto it above); the build fails rather than silently drop one.
const HOME_LEAD = [
  'jubilee-radio',            // KJubilee
  'jubilee-praise',           // Torah Sings
  'jubilee-gospel-fire',      // Pentecostal Shout
  'latin-worship',            // Latin Worship (Sung in English)
  'riddim-and-rhyme',         // Riddim and Rhyme
  'island-hallelujah',        // Island Hallelujah, format 'Hawaiian Praise' (was Many Waters)
  'jubilee-kids-party',       // Jubilee Kids Party
  'ancient-paths',            // The Ancient Paths
  'midnight-praise',          // Midnight Praise
  'hebraic-celebrations',     // Hebraic Celebrations
  'inspire-hymns-heritage',   // Inspire Hymns & Heritage
  'country-gospel',           // Gospel Country
  'yes-and-amen',             // Yes and Amen — HM 314.88, the SingItDone declarations
];

// The closing card(s), in order. God's Little Lambs is pinned onto Home above
// (it is primary 'children', so it never qualifies on its own) and rank then
// drops it into the middle of the shelf; this puts it at the end where it was
// asked for. Same strictness as HOME_LEAD — a bad slug fails the build.
const HOME_TAIL = [
  'gods-little-lambs',        // HM 325.18 — last card on Home
];

const englishMusic = function () {
  // MAINSTREAM IS NOT ON HOME. The nineteen Inspire mainstream formats — Cafe,
  // Drive, Chill, Jazz and the rest — are general-audience music rather than
  // Christian music, and Home is the Christian music page. They live on Family
  // Friendly instead; see the 'kids' section below, which now claims the whole
  // band rather than hand-picking six of them.
  const MUSIC_PRIMARIES = ['music'];
  const list = where(function (s) {
    return MUSIC_PRIMARIES.indexOf(s.primary) >= 0 && s.lang === 'English';
  }).sort(function (a, b) {
    const A = bySlug.get(a), B = bySlug.get(b);
    if (!!A.prototype !== !!B.prototype) return A.prototype ? -1 : 1;
    // The flagship leads the live block. Its rank is 50 ("Featured") rather
    // than a real score, so ranking alone would bury it behind the others.
    if (a === FLAGSHIP) return -1;
    if (b === FLAGSHIP) return 1;
    return B.rank - A.rank;
  });

  HOME_PINNED.forEach(function (pin) {
    if (!bySlug.has(pin.slug)) throw new Error('HOME_PINNED: no such station ' + pin.slug);
    if (list.indexOf(pin.slug) >= 0) return;          // already qualifies on its own
    const at = list.indexOf(pin.after);
    if (at < 0) throw new Error('HOME_PINNED: anchor ' + pin.after + ' is not on the home shelf');
    list.splice(at + 1, 0, pin.slug);
  });

  // Lift the hand-ordered opening out of wherever rank put it, then let the
  // remainder follow in its automatic order.
  const lead = [];
  HOME_LEAD.forEach(function (slug) {
    if (!bySlug.has(slug)) throw new Error('HOME_LEAD: no such station ' + slug);
    const at = list.indexOf(slug);
    if (at < 0) throw new Error('HOME_LEAD: ' + slug + ' is not on the home shelf');
    list.splice(at, 1);
    lead.push(slug);
  });

  // ...and the hand-ordered closing out of the other end. Same idea as
  // HOME_LEAD, opposite end of the shelf: rank decides the middle, the first
  // and last cards are editorial.
  const tail = [];
  HOME_TAIL.forEach(function (slug) {
    if (!bySlug.has(slug)) throw new Error('HOME_TAIL: no such station ' + slug);
    const at = list.indexOf(slug);
    if (at < 0) throw new Error('HOME_TAIL: ' + slug + ' is not on the home shelf');
    list.splice(at, 1);
    tail.push(slug);
  });

  return lead.concat(list, tail);
};

// --- 5a. Heavenly Modulation editorial ------------------------------------
// The HM tab is articles, not a shelf of stations. Every number in the copy is
// COMPUTED from the catalog rather than typed, so the page cannot quietly go
// stale as stations come on air. Claims are drawn from what the project
// actually specifies — docs/Radio-BRD.md and docs/KJubilee_Radio_Website_Spec.md —
// rather than invented reach or listener figures.
const hmFacts = (function () {
  const live = stations.filter(function (s) { return s.prototype; });
  const freqs = stations.map(function (s) { return parseFloat(s.hm); })
    .filter(function (n) { return !isNaN(n); }).sort(function (a, b) { return a - b; });
  return {
    total: stations.length,
    live: live.length,
    liveNames: live.map(function (s) { return s.name; }),
    intl: stations.filter(function (s) { return s.primary === 'multilanguage'; }).length,
    languages: Object.keys(INTL).reduce(function (set, k) { set[INTL[k][0]] = 1; return set; }, {}),
    low: freqs[0].toFixed(2),
    high: freqs[freqs.length - 1].toFixed(2),
    members: MEMBERS.length,
    // The Inspire Family VOICES only. MEMBERS also carries the two children's
    // music brands, which front a station each but host nothing, so counting
    // MEMBERS here made the copy claim fourteen personas under a headline that
    // says twelve. AVATAR is the roster of the twelve that actually go on air.
    personas: Object.keys(AVATAR).length,
  };
})();
const langCount = Object.keys(hmFacts.languages).length;

/* Every article carries a slug (it is addressable at #hm/<slug>), the station
   whose cover art fronts its card, and the persona whose beat it sits on. The
   card grid is the Backstage grid from JubiLujah: five columns with one wide
   card per five, so the ORDER below is load-bearing — see isWide() in home.js.
   Twelve articles tile into exactly three rows, with the wide card falling on
   indexes 0, 6 and 11. */
const HM_CORE = [
  {
    slug: 'what-heavenly-modulation-is',
    kicker: 'The band',
    title: 'What Heavenly Modulation actually is',
    dek: 'A broadcast band that no regulator allocated, because a ministry allocated it instead.',
    image: 'jubilee-radio',
    author: 'jubilee',
    stands: 'A frequency is a promise that the same thing is in the same place every time you tune there.',
    body: [
      'AM modulates amplitude. FM modulates frequency. HM — Heavenly Modulation — is a band that ' +
      'does not exist on any tuner you can buy, because it was never allocated by a regulator. It ' +
      'was allocated by a ministry.',
      'The dial runs from HM ' + hmFacts.low + ' to HM ' + hmFacts.high + ', and it currently carries ' +
      hmFacts.total + ' stations. Every station holds one frequency and no two stations share a ' +
      'number, exactly as on a real broadcast band. That constraint is deliberate: a frequency is a ' +
      'promise that the same thing is in the same place every time you tune there.',
      'The band is partitioned the way a broadcast band is — a five-fold band for the ministry ' +
      'stations, a multilanguage band for the nations, a mainstream band for the always-on formats. ' +
      'You are not scrolling a content library. You are turning a dial.',
      'That difference is not decoration. A library asks you what you want before it will play ' +
      'anything, which means it can only ever hand back something you already knew to ask for. A ' +
      'dial plays whether or not you chose. It is the format that lets a song find someone who was ' +
      'not looking for it, and that is the entire point of putting the gospel on the air.',
    ],
  },
  {
    slug: 'why-it-had-to-be-music',
    kicker: 'Why music',
    title: 'Why it had to be music',
    dek: 'Scripture teaches itself in songs, and a song is the only sermon anyone repeats on purpose.',
    image: 'inspire-hymns-heritage',
    author: 'melody',
    stands: 'Moses was told to teach Israel a song, not a lecture — because a song is what they would still have when everything else had been forgotten.',
    body: [
      'When a generation had to remember a warning long after the man who delivered it was gone, ' +
      'Moses was not handed an outline. He was told to write a song and teach it to the children ' +
      'of Israel, to put it in their mouths. The longest book in Scripture is a songbook. Paul, ' +
      'writing to churches under real pressure, told them to teach and admonish one another in ' +
      'psalms and hymns and spiritual songs.',
      'That is not sentiment. It is a transmission strategy, and it is in the text because it ' +
      'works. An argument has to get past the part of a person that is standing guard. A melody ' +
      'does not knock. It is already inside before anyone decides whether to let it in, and it ' +
      'stays for years after the argument that lost has been forgotten.',
      'A sermon is heard once. A chorus is carried around all week — in a car, over a sink, at ' +
      'three in the morning when nothing else will come. Ask almost any believer what Scripture ' +
      'they can say from memory, and most of it arrives with a tune attached. That is the medium ' +
      'doing the work.',
      'So the question was never whether to build another Christian streaming service. It was how ' +
      'to get the Word into the form people actually keep. Music is that form, and radio is how ' +
      'music reaches someone who did not go looking for it.',
    ],
  },
  {
    slug: 'free-and-built-to-stay-free',
    kicker: 'What it costs',
    title: 'Free, and built to stay free',
    dek: 'No subscription, no advertising, no pledge drive — and a structural reason it can stay that way.',
    image: 'gods-little-lambs',
    author: 'jubilee',
    stands: 'Free is not a launch promotion here. It is what is left once you remove the two costs that normally force a price.',
    body: [
      'Every station on this band is free to listen to. There is no subscription tier, no advert ' +
      'between songs, no pledge week, and no account required before the audio will start. You ' +
      'open the page, you press play, and it plays.',
      'That is easy to promise and hard to keep, so it is worth saying exactly why it can be kept. ' +
      'Internet radio is normally squeezed by two costs. The first is licensing: every play of ' +
      'every song owes a fee to a rights body, which is why such services must either sell ' +
      'subscriptions or sell your attention. The second is production — the studios, the ' +
      'presenters, the engineers, the artwork, the hours.',
      'This band does not carry the first cost at all. The music was made for this band and is ' +
      'owned outright by the ministry, so there is no per-play fee sitting between a song and the ' +
      'person who needs to hear it. The second cost has been collapsed rather than dodged, and how ' +
      'that was done is its own article. What is left is bandwidth and machines — the one bill in ' +
      'this business that gets cheaper every year instead of dearer.',
      'An account does exist, and it is genuinely optional. It remembers your favourites and ' +
      'carries them across the Jubilee sites. It does not unlock anything, because nothing here ' +
      'is locked.',
    ],
  },
  {
    slug: 'ai-pointed-at-the-kingdom',
    kicker: 'The tools',
    title: 'AI, pointed at the Kingdom',
    dek: 'The music, the voices and the artwork on this band are AI-made. Here is why that is said out loud.',
    image: 'jubilee-ccm',
    author: 'amir',
    stands: 'A tool is judged by what it is pointed at. The same technology filling the world with noise can be turned to carry the Word into it.',
    body: [
      'The songs on this band were generated. The hosts are synthesised voices. The station art ' +
      'was made by a model. None of that is buried in a footnote, because a ministry that will not ' +
      'be straight about how it works has already given away the thing it came to protect.',
      'The honest case for it is arithmetic. A network of ' + hmFacts.total + ' stations, hosted ' +
      'around the clock, carrying ' + langCount + ' languages beyond English, with original music ' +
      'and artwork for every one, is a project that used to require a staff of hundreds and a ' +
      'budget no small ministry has ever had. That is precisely why gospel radio has always been ' +
      'concentrated in wealthy countries and majority languages — not because the need was there, ' +
      'but because the money was. AI does not make this work good. It makes it possible.',
      'It is worth being equally clear about what the technology is not doing. It does not decide ' +
      'what is true. Every station has a remit set by people, every song stands on a passage of ' +
      'Scripture chosen by people, and nothing reaches the air that is not in a catalogue a person ' +
      'approved. The model is a printing press, and a printing press has never once been the ' +
      'author of what it prints.',
      'There is a great deal of fear about these tools and a good deal of it is earned. But the ' +
      'argument that the Church should stand back and let this generation of technology be shaped ' +
      'entirely by people with no interest in the Kingdom is not caution — it is surrender. The ' +
      'commission was to go into all the world. For the first time, the cost of going into all of ' +
      'it has fallen to something a ministry can actually carry.',
    ],
  },
  {
    slug: 'everywhere-there-is-a-signal',
    kicker: 'The reach',
    title: 'Everywhere there is a signal',
    dek: 'Served from the edge, built for cheap phones and thin connections, with no app to install.',
    image: 'africa-inspire-kiswahili',
    author: 'zariah',
    stands: 'Free at the point of listening is a small detail where everyone has a card on file, and an enormous one everywhere else.',
    body: [
      'A terrestrial transmitter has a horizon. Whatever a broadcaster spends, there is a ring on ' +
      'the map beyond which the signal simply is not, and everyone outside it is somebody else’s ' +
      'problem. This band has no horizon, and that is the single biggest thing it changes.',
      'The audio and the artwork are served from a global edge network rather than from one ' +
      'machine in one country, so a listener in Nairobi or Manila is served from somewhere near ' +
      'Nairobi or Manila. The site is built to survive a slow connection and a five-year-old ' +
      'phone, because that is the device most of the world is actually holding.',
      'There is no application to install and no store to be removed from. A browser and a link is ' +
      'the whole requirement, which also means a station can be handed from one person to another ' +
      'as a message rather than as an instruction to go and download something first.',
      'And it is free at the point of listening — a small detail in a country where everyone has a ' +
      'card on file, and an enormous one everywhere else. The places where a subscription is ' +
      'impossible are, with grim reliability, the same places where the gospel has the least ' +
      'commercial radio carrying it.',
    ],
  },
  {
    slug: 'voices-not-strangers',
    kicker: 'The difference',
    title: 'Twelve voices, and none of them are strangers',
    dek: 'A playlist has no host, which is why a playlist never becomes a habit.',
    image: 'inspire-live',
    author: 'nova',
    stands: 'A listener in a hard week is not handed an algorithm. They are handed a voice that sounds like it already knows what kind of week it has been.',
    body: [
      'A playlist has no host. That is the whole reason a playlist never becomes a habit — nobody ' +
      'waits all week for a playlist. The thing listeners bond to is the person behind the mic.',
      'Every station on this band is hosted by one of the ' + hmFacts.personas + ' Inspire Family ' +
      'personas, and they are not interchangeable. Elias carries the Appalachian country lane; ' +
      'Imani carries Pentecostal fire; Zev keeps the Hebrew roots and the feasts; Nova holds space ' +
      'for the de-churched before she says anything true at them. They do real on-air breaks — ' +
      'station IDs, song intros, a Scripture drop, a word of encouragement.',
      'Each of them keeps the same beat across every station they hold, which is what makes them ' +
      'worth knowing rather than merely hearing. Tune to a frequency Zev holds and the feasts will ' +
      'be kept there, whichever station it happens to be.',
      'It means a listener in a hard week is not handed an algorithm. They are handed a voice that ' +
      'sounds like it already knows what kind of week it has been.',
    ],
  },
  {
    slug: 'a-frequency-nobody-pays-to-reach',
    kicker: 'Why it matters',
    title: 'A frequency nobody has to pay to reach',
    dek: 'Terrestrial Christian radio runs on an auction. This band removes the auction.',
    image: 'jubilee-praise',
    author: 'elias',
    stands: 'A station exists here because someone needed that station to exist — not because of what it could sell against.',
    body: [
      'Terrestrial Christian radio has always run into the same wall: transmitters are expensive, ' +
      'licences are scarce, and the hours that reach the most people are the hours that cost the ' +
      'most to buy. Small ministries do not outbid national advertisers, so they do not get the ' +
      'drive-time slot, and the voices that most need carrying are the ones that stay local.',
      'This band removes the auction. There is no transmitter to buy, no market to be priced out ' +
      'of, and no ad inventory to protect — so no programme has to earn its place by what it can ' +
      'sell against. A station exists because someone needed that station to exist.',
      'Look at what that permits. A station for the grieving, or for people walking out of ' +
      'addiction, or for men who have nowhere to be honest, would be commercial suicide on a ' +
      'terrestrial band: the audience is real, but it is small, and small does not clear a ' +
      'transmitter’s costs. Here a small audience costs almost nothing to serve, so the only ' +
      'question left is whether anyone needs it.',
      'The music is generated and owned outright by the ministry, which means there is no ' +
      'performing-rights reporting sitting between a song and the person who needs to hear it. ' +
      'Nothing on this band is rented.',
    ],
  },
  {
    slug: 'the-kingdom-calendar',
    kicker: 'The difference',
    title: 'A dial that keeps the Kingdom calendar',
    dek: 'From Friday sundown the whole band changes character, and nobody flips a switch.',
    image: 'hebraic-celebrations',
    author: 'zev',
    stands: 'Secular radio breathes with the retail calendar. This one breathes with Yahuah’s.',
    body: [
      'From Friday sundown to Saturday sundown the whole band changes character. A dedicated ' +
      'Shabbat station takes the hero slot, the palette softens, high-energy promotion steps back, ' +
      'and rest programming surfaces first. Nobody flips a switch — the calendar service computes ' +
      'the sacred window against local sunset and the site follows it.',
      'The feasts do the same thing. Passover, Unleavened Bread, Firstfruits, Shavuot, Yom Teruah, ' +
      'Yom Kippur and Tabernacles each trigger their own themed lineups and seasonal drops.',
      'This is the sort of thing that is only possible when nobody is selling the hours. A ' +
      'commercial station cannot afford to change character for twenty-five hours a week, so it ' +
      'does not, and the rhythm Scripture actually commands becomes the one thing radio can never ' +
      'keep.',
      'Secular radio breathes with the retail calendar. This one breathes with Yahuah’s.',
    ],
  },
  {
    slug: 'every-song-carries-the-word',
    kicker: 'The difference',
    title: 'Every song carries the Word with it',
    dek: 'A track here is not just audio. It carries the Scripture it stands on.',
    image: 'identity-in-yeshua',
    author: 'caleb',
    stands: 'Passive listening becomes encounter without the listener having to do anything but leave it on.',
    body: [
      'On this band a track is not just audio. Each one carries an Encounter Layer — the Scripture ' +
      'it stands on, a finished-reality declaration the listener can speak, and a way straight ' +
      'into Bible study on the passage that song came from.',
      'That is the part no secular platform can copy, because it is not a feature. It is the ' +
      'reason the station exists. Passive listening becomes encounter without the listener having ' +
      'to do anything but leave it on.',
      'It also settles the question every Christian music service eventually has to answer: what ' +
      'stops this from being ordinary pop with churchy vocabulary? Here the answer is checkable. ' +
      'Every song has a passage underneath it, and you can go and read it.',
    ],
  },
  {
    slug: 'hosted-in-the-language',
    kicker: 'The nations',
    title: 'Hosted in the language, not translated into it',
    dek: 'Stations written in their own languages rather than run through a translator.',
    image: 'familia-inspire-espanol',
    author: 'santiago',
    stands: 'A believer in Bucharest or Lagos or Seoul gets a station that sounds like home, on the same dial as everyone else.',
    body: [
      hmFacts.intl + ' of the stations on this band broadcast in ' + langCount + ' languages other ' +
      'than English — Spanish, Portuguese, Mandarin, Hindi, Arabic, Swahili, Yoruba, Amharic, ' +
      'Romanian, Korean, Tagalog, Vietnamese and more.',
      'They are not English stations with subtitles. Each one is hosted in its own language by the ' +
      'persona who carries that culture, and the music catalogue behind them was written in those ' +
      'languages rather than run through a translator.',
      'The distinction matters more than it sounds. A translated worship song keeps the words and ' +
      'loses the music — the phrasing, the rhythm, the way a line is meant to sit. What comes out ' +
      'is recognisably foreign, and a person hears that they are being reached rather than that ' +
      'they are being sung to.',
      'A believer in Bucharest or Lagos or Seoul gets a station that sounds like home, on the same ' +
      'dial as everyone else.',
    ],
  },
  {
    slug: 'still-being-built-on-purpose',
    kicker: 'What is next',
    title: 'Still being built, on purpose',
    dek: 'Frequencies are reserved before their stations are finished, and the dial keeps growing.',
    image: 'inspire-rising',
    author: 'caleb',
    stands: 'The dial you tune next month will not be the dial you tuned today, and that is the plan rather than an apology.',
    body: [
      'Of the ' + hmFacts.total + ' frequencies on this band, ' + hmFacts.live + ' are live right ' +
      'now and the rest are assigned and in build. That is deliberate, and it is how broadcasting ' +
      'has always worked: a licence is held before a station signs on, so the place on the dial is ' +
      'kept for what it was reserved for.',
      'New catalogue lands continuously. A station in build is one whose music is still being ' +
      'written and checked, and when enough of it exists the frequency goes live without anything ' +
      'else on the dial moving. Nothing gets renumbered, so a link shared a year ago still points ' +
      'where it was meant to.',
      'The tooling keeps improving underneath all of it, and that compounds. Every advance in ' +
      'generation, translation and voice makes the next station cheaper to build than the last, ' +
      'which means the list of languages and formats that are out of reach gets shorter every ' +
      'year. Things that were plainly impossible when this band was first laid out are now merely ' +
      'queued.',
      'So it is worth coming back. The dial you tune next month will not be the dial you tuned ' +
      'today, and that is the plan rather than an apology.',
    ],
  },
  {
    slug: 'on-air-today',
    kicker: 'On air now',
    title: 'What is actually broadcasting today',
    dek: 'The live count, the station names, and the discipline behind what reaches the air.',
    image: 'jubilee-gospel-fire',
    author: 'imani',
    live: true,
    stands: 'A frequency is reserved before a station is finished, the same way a broadcaster holds a licence.',
    body: [
      hmFacts.live + ' of the ' + hmFacts.total + ' assigned frequencies are live and playing right ' +
      'now: ' + hmFacts.liveNames.join(', ') + '. The rest are assigned and in build — a frequency ' +
      'is reserved before a station is finished, the same way a broadcaster holds a licence.',
      'Every live station plays from a published manifest: nothing reaches the air that is not in ' +
      'the catalogue, and every track carries a permanent twelve-character SongID that the rotation ' +
      'and play logs know it by. It is an ordinary discipline for a broadcaster and a rare one for ' +
      'a streaming service.',
      'That identifier is the reason the rest of this can be trusted. It is how a song keeps its ' +
      'Scripture and its credits no matter which station plays it, and it is why the same track ' +
      'can sit on several stations at once without anybody losing track of what it is.',
    ],
  },
];

/* The second slate. Split from HM_CORE only so the two can be read apart —
   HM_ORDER below is what actually decides what the grid looks like, and both
   arrays are just the pool it draws from. */
const HM_MORE = [
  /* ---- the AI question, met head on ---------------------------------- */
  {
    slug: 'can-a-machine-worship',
    kicker: 'The AI question',
    title: 'Can a machine worship?',
    dek: 'No. And the answer matters more than the question, because of what it tells you this band is for.',
    image: 'inspire-acapella',
    author: 'nova',
    stands: 'The organ does not worship either. Nobody has ever thought that was an argument against organs.',
    body: [
      'The question comes up fast and it deserves a straight answer rather than a clever one. No. A ' +
      'model does not love Yahuah. It does not repent, it cannot mean a word it produces, and ' +
      'nothing it generates is in itself an act of praise.',
      'But look at what the objection quietly assumes — that the instrument was supposed to be the ' +
      'one doing the worshipping. A pipe organ does not worship. A hymnal does not worship. A ' +
      'transmitter has never once meant a word it carried. Nobody has ever thought that was an ' +
      'argument against any of them, because everybody understood where the worship was actually ' +
      'happening.',
      'It happens in the person listening. A song is a vessel, and what fills it is a human being ' +
      'deciding to agree with what it says. Judged that way the real question is not whether the ' +
      'tool believes — it is whether what comes out of it is true, and whether it puts a person in ' +
      'front of the living God. That is a question about the words and the Scripture underneath ' +
      'them, and unlike the first one it can actually be answered.',
      'The failure mode worth guarding against was never a machine that cannot worship. It is a ' +
      'song that is doctrinally empty and emotionally effective, and human beings have been ' +
      'producing those for a very long time without any help at all.',
    ],
  },
  {
    slug: 'what-ai-never-decides',
    kicker: 'The AI question',
    title: 'What we will never let AI decide',
    dek: 'A short list, published on purpose, so that it can be held against us.',
    image: 'logos',
    author: 'zev',
    stands: 'A boundary nobody wrote down is not a boundary. It is an intention, and intentions drift quietly under deadline.',
    body: [
      'Any ministry using these tools should be able to say plainly where its line is. Here is ' +
      'ours, written down so it can be checked rather than merely trusted.',
      'Doctrine is not generated. What this band teaches is set by people, and it does not move ' +
      'because a model produced a pleasing sentence. Scripture is chosen, not suggested — the ' +
      'passage a song stands on is selected by someone who read it in context. And no pastoral ' +
      'claim is invented: a station may encourage, and it may hand a listener the Word, but it does ' +
      'not tell them what Yahuah is saying to them specifically. That is not a job to automate. It ' +
      'is not really a job to broadcast.',
      'What the tools do sits entirely downstream of those decisions. They compose, they voice, ' +
      'they illustrate, they translate, they schedule. That is craft, and craft is exactly the sort ' +
      'of thing it is reasonable to get help with. Authority is not.',
      'The reason to publish a list like this rather than simply keep to it is that a boundary ' +
      'nobody wrote down is not a boundary — it is an intention, and intentions drift quietly under ' +
      'deadline. Written down, it can be pointed at, including by you.',
    ],
  },
  {
    slug: 'who-wrote-this-song',
    kicker: 'The AI question',
    title: 'Who wrote this song?',
    dek: 'The whole credit chain for one track, from the passage it stands on to the play log.',
    image: 'yes-and-amen',
    author: 'caleb',
    stands: 'Every step that required a decision was made by a person. Every step that required labour was not.',
    body: [
      'Take a single track and follow it back. Before there was any audio there was a passage, ' +
      'chosen by someone who wanted a specific thing said. Then a brief: what this song is for, who ' +
      'is likely to be hearing it, and what it must not claim.',
      'Generation comes next, and it is the least interesting step in the chain. The model composes ' +
      'and performs against that brief. What comes back is then read — for whether it says what the ' +
      'passage says, whether the language is true, and whether it is any good, which are three ' +
      'separate questions and a song can fail any of them.',
      'What survives enters the catalogue and is given its permanent twelve-character SongID. From ' +
      'that moment it is a fixed object: the schedule knows it by that identifier, the play logs ' +
      'know it by that identifier, and its Scripture and its credits travel with it onto every ' +
      'station that ever plays it.',
      'So — who wrote it? Every step that required a decision was made by a person, and every step ' +
      'that required labour was not. That is a real answer, and it is close to the answer a hymn ' +
      'arranged by a session band has always had. The labour has moved. The decisions have not.',
    ],
  },
  {
    slug: 'the-cost-of-a-station',
    kicker: 'The AI question',
    title: 'The cost of a station, then and now',
    dek: 'Why round-the-clock gospel radio in a minority language was, until very recently, simply unaffordable.',
    image: 'inspire-india-hindi',
    author: 'amir',
    stands: 'The gospel was never the thing in short supply. The transmitters were.',
    body: [
      'Consider what it used to take to put one 24-hour worship station on air in, say, Amharic. A ' +
      'catalogue of music in that language. Presenters who speak it. A studio, and the hours to ' +
      'fill it. Artwork. Somebody to schedule it. Licensing for every song played. And then a ' +
      'transmitter, or a bandwidth bill for a stream nobody is paying to hear.',
      'Every one of those is a real cost, and stacked together they explain something that ought to ' +
      'be scandalous: a language with tens of millions of speakers can have almost no Christian ' +
      'radio, while a wealthy city has a dozen stations competing over the same listeners. The ' +
      'gospel was never the thing in short supply. The transmitters were.',
      'Most of that stack has now collapsed. The music can be written in the language rather than ' +
      'translated into it. The presenter can be a persona who actually speaks it. Artwork is ' +
      'minutes rather than a commission. Licensing does not apply at all, because the catalogue is ' +
      'owned outright rather than rented.',
      'What is left is bandwidth and machines, which is why this band could open with a whole ' +
      'multilanguage section rather than adding one language a year as donations allowed. The work ' +
      'did not get easier. The barrier keeping most of the world out simply turned out to have been ' +
      'a money barrier almost the whole way down.',
    ],
  },
  {
    slug: 'every-tool-the-church-feared',
    kicker: 'The AI question',
    title: 'Every tool the Church was afraid of',
    dek: 'The press, radio, television, the internet — the same argument each time, and what being late cost.',
    image: 'ancient-paths',
    author: 'elias',
    stands: 'The fears were right about the risk and wrong about the conclusion, every single time.',
    body: [
      'Print was going to put Scripture into the hands of people unqualified to read it. Radio was ' +
      'going to empty the pews. Television was going to turn faith into a performance. The internet ' +
      'was going to dissolve the local church into a screen.',
      'None of those fears was stupid, and this is the part usually skipped: each one named a real ' +
      'failure mode, and each failure mode duly arrived. There is bad television preaching. There ' +
      'is a version of online church that has become a substitute rather than a supplement. The ' +
      'fears were right about the risk. They were wrong about the conclusion.',
      'Because the same press put a Bible in the reader’s own language into ordinary hands. The ' +
      'same radio went behind borders no missionary could cross, and kept going when the ' +
      'missionaries were expelled. The argument arrives on schedule with each new technology, and ' +
      'it has never once been the whole truth.',
      'What being late cost was always the same thing. There was a stretch during which the new ' +
      'medium was shaped entirely by people with no interest in the Kingdom, and the Church turned ' +
      'up afterwards to work in a room somebody else had already furnished. That is the actual risk ' +
      'in front of us now, and notice that it is not a risk of using the tools.',
    ],
  },

  /* ---- why music ------------------------------------------------------ */
  {
    slug: 'the-first-song-after-the-sea',
    kicker: 'Why music',
    title: 'The first thing anyone did after the sea closed',
    dek: 'Exodus 15 — deliverance happens, and the immediate response is a song.',
    image: 'midnight-praise',
    author: 'zev',
    stands: 'Not a report. Not a monument. A song, with a woman leading it and a tambourine in her hand.',
    body: [
      'Israel walks out of the sea on dry ground and the water closes behind them. It is the ' +
      'largest thing that has ever happened to them. And the very next thing in the text is not a ' +
      'report, not a monument, not a law. It is a song.',
      'Then Miriam takes a tambourine, and the women go out after her with tambourines and dancing. ' +
      'Deliverance happens and the response is music — immediately, corporately, and with the whole ' +
      'body rather than only the mouth.',
      'The pattern holds all the way through. Deborah sings. David dances hard enough to embarrass ' +
      'his wife. Paul and Silas sing at midnight with their feet in the stocks, and the text ' +
      'bothers to mention that the other prisoners were listening — which is, more or less, radio.',
      'That is worth sitting with if you have ever felt music was the soft part of faith, the ' +
      'warm-up before the real content starts. Scripture does not treat it that way anywhere. Song ' +
      'is what people do when something has actually happened to them, and a station playing around ' +
      'the clock is a bet that something still is.',
    ],
  },
  {
    slug: 'lament-has-a-frequency',
    kicker: 'Why music',
    title: 'Lament has a frequency too',
    dek: 'Why there are stations for grief and for walking out of addiction, and not only for praise.',
    image: 'grief-walked',
    author: 'eliana',
    stands: 'Roughly a third of the Psalms are complaints. A dial that only knows how to celebrate is missing most of the songbook.',
    body: [
      'Roughly a third of the Psalms are laments. Not gentle reflections — complaints, addressed ' +
      'directly to Yahuah, sometimes angry, and occasionally ending without resolution. Psalm 88 ' +
      'finishes in the dark and does not come back up.',
      'That is in the songbook on purpose, which makes it a strange thing to have edited almost ' +
      'entirely out of Christian radio. A dial that only knows how to celebrate is not more ' +
      'faithful than the Psalter; it is missing most of the material. And it tells a person in the ' +
      'worst month of their life that this frequency is not currently for them.',
      'So this band carries stations for grief, for the aftermath of trauma, for people walking out ' +
      'of addiction, and for weeks when faith is genuinely hard. They are not the loud stations, ' +
      'and on a commercial band not one of them would survive a ratings book.',
      'What lament does — and what a cheerful chorus cannot do for somebody who is not cheerful — ' +
      'is hand a person permission and a vocabulary in the same moment. It says: this is sayable, ' +
      'out loud, to God, and here are the words for it. That is pastoral work, and it happens to ' +
      'fit inside three and a half minutes.',
    ],
  },
  {
    slug: 'the-song-you-sang-at-eleven',
    kicker: 'Why music',
    title: 'The song you sang at eleven and still know',
    dek: 'Why the children’s stations on this band are not the easy end of it.',
    image: 'bedtime-blessings',
    author: 'melody',
    stands: 'Whatever is put into a child in song is still going to be in there in fifty years. That is not a small responsibility.',
    body: [
      'Almost everybody can produce, on demand, a song they learned before they were twelve. Not a ' +
      'sermon from that period. Not a lesson, and usually not a verse. A song — complete, with the ' +
      'tune, and often with the actions.',
      'Music binds to memory in a way ordinary speech does not, and childhood is when that binding ' +
      'is strongest and most nearly permanent. Which means the songs put into a child are not ' +
      'entertainment for a car journey. They are the vocabulary that person will still be reaching ' +
      'for in their sixties, in a hospital corridor, when nothing composed and adult will come.',
      'That is why the children’s stations here are held to the same standard as everything else ' +
      'rather than treated as the simple end of the dial. A children’s song is doctrine that will ' +
      'outlast almost anything else you manage to teach.',
      'And it cuts both ways, which is worth saying plainly: whatever is put in is what will still ' +
      'be in there. That is not a small responsibility, and it is the reason those frequencies are ' +
      'hosted and scheduled rather than shuffled.',
    ],
  },
  {
    slug: 'two-people-at-once',
    kicker: 'Why music',
    title: 'Every worship song is talking to two people at once',
    dek: 'One line goes up. The next goes sideways. Most songs never announce that they are doing both.',
    image: 'jubilee-sanctuary',
    author: 'jubilee',
    stands: 'Sing it to God and it is prayer. Sing it beside somebody and it is teaching. It is always doing both.',
    body: [
      'Watch the pronouns in almost any worship song and they move. “You are faithful” is addressed ' +
      'upward. “He has done great things” is addressed to whoever is standing next to you. Most ' +
      'songs cross between the two without ever announcing it, sometimes inside a single verse.',
      'Paul puts both jobs in one sentence: teach and admonish one another in psalms and hymns and ' +
      'spiritual songs, singing with grace in your hearts to the Lord. Teaching one another, and ' +
      'singing to Him. Not two activities — one.',
      'This is why a song can catechise a congregation more thoroughly than a study series. Nobody ' +
      'braces against a chorus. Whatever it asserts about God goes in unexamined and then gets ' +
      'repeated forty times, which is precisely why the content of the assertion carries so much ' +
      'more weight than its tune.',
      'Sing it to God and it is prayer. Sing it beside somebody and it is teaching. It is always ' +
      'doing both — and a station playing it into a room is quietly doing both to everyone in it.',
    ],
  },

  /* ---- how it works --------------------------------------------------- */
  {
    slug: 'what-a-songid-is',
    kicker: 'How it works',
    title: 'What a SongID is, and why you should care',
    dek: 'Twelve characters that turn a song from a file into a fixed object.',
    image: 'jubilee-teaching',
    author: 'caleb',
    stands: 'Anything that can be quietly swapped will eventually be quietly swapped, if only by accident.',
    body: [
      'Every track on this band carries a permanent twelve-character identifier. It is assigned ' +
      'once, it never changes, and — this is the part that matters — it is not derived from the ' +
      'title, the artist or the filename, all of which are things somebody can edit.',
      'That sounds like housekeeping, and it is, but it is the housekeeping everything else stands ' +
      'on. The identifier is how the schedule refers to a song, how the play logs record it, and ' +
      'how its Scripture and its credits stay attached to it as it turns up on one station after ' +
      'another.',
      'It is also what makes the claims made elsewhere on this band checkable rather than merely ' +
      'stated. A song that says it stands on a particular passage goes on standing on it, because ' +
      'the link runs to an identifier rather than to a name that could drift.',
      'The uncomfortable principle underneath is simple enough. Anything that can be quietly ' +
      'swapped will eventually be quietly swapped, if only by accident. An identifier is what turns ' +
      'a file into a fixed object, and a fixed object is the only kind of thing anyone can actually ' +
      'be held accountable for.',
    ],
  },
  {
    slug: 'published-before-it-airs',
    kicker: 'How it works',
    title: 'The schedule is published before it airs',
    dek: 'Two listeners tuning in at the same second hear the same song. That is the whole difference between a band and a shuffle.',
    image: 'shema-roots',
    author: 'zev',
    stands: 'A shuffle gives everybody their own private radio station. That sounds generous, and it dissolves the one thing radio was for.',
    body: [
      'Every live station on this band plays from a schedule written out and published in advance. ' +
      'Tune in at a given second and you hear exactly what everybody else tuning in at that second ' +
      'hears.',
      'A shuffle cannot do that, and the difference is not a technical detail. A shuffle hands every ' +
      'listener their own private station. It sounds generous, and it quietly dissolves the one ' +
      'thing broadcasting was ever really for — the knowledge that you are hearing this at the same ' +
      'moment as other people, most of whom you will never meet.',
      'It is also what makes a day possible at all. A schedule can have a morning that sounds like ' +
      'morning and a midnight that sounds like midnight. It can hand the hero slot to a Shabbat ' +
      'station from Friday sundown. It can put a Scripture reading somewhere it will be caught ' +
      'rather than somewhere it will be skipped past.',
      'And because it is written before it airs rather than assembled as it goes, it can be ' +
      'inspected. Nothing reaches the air that is not in the catalogue, and what is going out is ' +
      'knowable in advance instead of only afterwards.',
    ],
  },
  {
    slug: 'how-a-frequency-is-assigned',
    kicker: 'How it works',
    title: 'How a frequency gets assigned',
    dek: 'The life of a station, from a need somebody could state in a sentence to the moment it signs on.',
    image: 'wisdom-channel',
    author: 'jubilee',
    stands: 'The number is reserved at the beginning, when the station is still only a need with a remit attached.',
    body: [
      'It starts with a need somebody can state in one sentence. Not a genre, and not a gap in the ' +
      'market — a description of a person and of what they are carrying around.',
      'That need gets a remit: what the station is for, who hosts it, and what it will not do. The ' +
      'host is settled at this stage rather than later, because a station is a voice before it is ' +
      'ever a playlist, and the wrong voice will make the right music land wrong.',
      'Then it gets a number, and the number is the part worth noticing. The frequency is reserved ' +
      'at the very beginning, while the station is still only a need with a remit attached — the ' +
      'same way a broadcaster holds a licence for years before signing on. It cannot be quietly ' +
      'reassigned later to something that looks more promising.',
      'After that it is catalogue. Music written to the remit, checked, and added until there is ' +
      'enough of it to hold a whole day honestly. When there is, the frequency goes live and ' +
      'nothing else on the dial moves — so a link somebody shared a year earlier still opens on the ' +
      'thing it was meant to open on.',
    ],
  },

  /* ---- the nations and the reach --------------------------------------- */
  {
    slug: 'the-languages-still-missing',
    kicker: 'The nations',
    title: 'Twenty languages, and the ones still missing',
    dek: 'Naming the gaps out loud, because a list of what is missing is more use than a list of what is done.',
    image: 'asia-inspire-zhongwen',
    author: 'eliana',
    stands: 'A gap nobody names is a gap nobody fills.',
    body: [
      'There are ' + langCount + ' languages on this band besides English, carried by ' +
      hmFacts.intl + ' stations. That is a real number, and it is also a small one set against ' +
      'roughly seven thousand living languages and the several hundred with more than a million ' +
      'speakers each.',
      'So it is worth naming what is missing rather than only what is done. There is nothing here ' +
      'yet in Urdu, in Farsi, in Turkish, in Thai, in Burmese, in Hausa, in Igbo, in Malay, in ' +
      'Nepali or in Somali — and that is not the list, it is the beginning of one.',
      'Some of those are hard for reasons money does not solve. A language with little written ' +
      'worship tradition to draw on needs people who know it well enough to say whether what comes ' +
      'out the other end is actually right, and that is not something to guess at from a distance. ' +
      'Getting a language wrong is worse than not having attempted it.',
      'A gap nobody names is a gap nobody fills. This one is named deliberately, and the list ' +
      'getting shorter is the clearest measure there is of whether any of this is working.',
    ],
  },
  {
    slug: 'where-this-band-is-going',
    kicker: 'The reach',
    title: 'Where this band is going',
    dek: 'A map, a set of assigned frequencies, and an honest account of what is not known yet.',
    image: 'island-hallelujah',
    author: 'zariah',
    stands: 'The frequencies are the plan, written down where anybody can hold us to them.',
    body: [
      'There is a map on this site, and what it shows is not a listener count. It shows where this ' +
      'band is aimed — which languages are carried, which regions have a station hosted in their ' +
      'own tongue, and where the dial is still silent.',
      'That distinction is deliberate. Reach figures on the internet are famously elastic, and a ' +
      'number nobody outside the building can check is worth nothing to the person reading it. What ' +
      'can be checked is what is assigned and what is on air, and both of those are printed on this ' +
      'site rather than described.',
      'What is genuinely not known yet is who is listening, and where. This band is young, most of ' +
      'its frequencies are still in build, and any claim about audience size at this stage would be ' +
      'a guess wearing the clothes of a fact.',
      'So the honest version is this. The frequencies are the plan, written down where anybody can ' +
      'hold us to them. Everything after that is work, and the work is visible as it lands.',
    ],
  },

  /* ---- for the listener ------------------------------------------------ */
  {
    slug: 'how-to-use-this-band',
    kicker: 'For listeners',
    title: 'How to use a radio band you cannot buy a radio for',
    dek: 'The dial, the player that never stops, favourites, and how to hand somebody a frequency.',
    image: 'inspire-drive',
    author: 'melody',
    stands: 'Press play once and it keeps playing wherever you go on the site. That is the whole design.',
    body: [
      'The plainest way in is to press play on anything at all and then carry on browsing. The ' +
      'player sits at the bottom of every page and does not stop when you navigate — read an ' +
      'article, open another station, go through the entire catalogue, and the sound continues ' +
      'underneath it.',
      'The categories along the top are the bands: the music stations, the teaching and prayer ' +
      'frequencies, the family-safe formats, and the international dial. Every station has its own ' +
      'page saying what it is for, who hosts it, and what is playing on it right now.',
      'Every station also has its own address. Copy the link from a station page and what you are ' +
      'handing somebody is a frequency rather than a search result — it opens on that station, for ' +
      'them, straight away, with nothing in between.',
      'An account is optional and does exactly one thing: it remembers your favourites and follows, ' +
      'and carries them across the Jubilee sites. Nothing sits behind it. If you never sign in, ' +
      'nothing on this band is withheld from you.',
    ],
  },
  {
    slug: 'leave-it-on',
    kicker: 'For listeners',
    title: 'Leave it on',
    dek: 'The case for a house with something true playing in it that nobody had to choose.',
    image: 'stillwater',
    author: 'eliana',
    stands: 'The songs that formed you were mostly not the ones you selected. They were the ones that happened to be on.',
    body: [
      'The strongest argument for radio over a playlist is not variety. It is that you do not have ' +
      'to decide anything.',
      'A playlist is a sequence of choices, which means it can only ever hand back what you already ' +
      'knew to ask for, and it means every session opens with a small act of curation you may not ' +
      'have the energy for. A band that is simply on skips both problems. It plays while the ' +
      'washing-up gets done and while homework gets argued over, and it puts things in front of ' +
      'people that they would never have gone looking for.',
      'Think about the songs that actually formed you. Most of them were not selected. They were ' +
      'on — in a car, in a kitchen, in a church somebody took you to. Formation is largely a matter ' +
      'of what is ambient, which is exactly why what is ambient is worth choosing once, carefully.',
      'So the recommendation really is that boring: pick a station, leave it on, and let the house ' +
      'have something true in it that nobody has to keep deciding on. That is what a band is for, ' +
      'and it is the one thing a library cannot do.',
    ],
  },
  {
    slug: 'for-the-person-who-stopped-going',
    kicker: 'For listeners',
    title: 'For the person who stopped going',
    dek: 'No argument, no guilt, and nothing you have to sign up for.',
    image: 'when-faith-feels-hard',
    author: 'nova',
    stands: 'You do not have to have worked out what you believe before you are allowed to listen to something.',
    body: [
      'If you have not been inside a church in a while, you probably already know the shape of what ' +
      'usually gets said next, and you can feel it coming from the first sentence. This is not ' +
      'that, and you can stop reading the moment it starts to be.',
      'Some people left because of something that was done to them. Some drifted and could not tell ' +
      'you when. Some still believe most of it and simply cannot face the building. Those are ' +
      'completely different situations and they are almost always addressed as one, which is a ' +
      'fair part of why the standard approach lands so badly.',
      'What is here is a frequency you can leave on without joining anything, telling anybody, or ' +
      'being followed up afterwards. Several stations on this band are hosted for exactly this — ' +
      'not to argue you back, but to be honest company while you work out what you think. No ' +
      'account is required and nobody is counting.',
      'You do not have to have worked out what you believe before you are allowed to listen to ' +
      'something. That is all this is: something true, playing, that asks nothing from you.',
    ],
  },
];

/* THE RUNNING ORDER OF THE GRID, set here rather than by where a piece
   happened to get written. Reading top to bottom it opens with what the band
   is, answers the question everybody actually arrives with, then works
   outward through why music, how the thing runs, the nations, and the
   listener — ending on what is on air today.

   Both guards below are load-bearing. A slug typo in either list is otherwise
   silent: the piece simply vanishes from the site, and nothing fails. */
const HM_ORDER = [
  'what-heavenly-modulation-is',
  'why-it-had-to-be-music',
  'free-and-built-to-stay-free',
  'ai-pointed-at-the-kingdom',
  'can-a-machine-worship',
  'what-ai-never-decides',
  'who-wrote-this-song',
  'the-cost-of-a-station',
  'every-tool-the-church-feared',
  'everywhere-there-is-a-signal',
  'voices-not-strangers',
  'a-frequency-nobody-pays-to-reach',
  'the-first-song-after-the-sea',
  'lament-has-a-frequency',
  'the-song-you-sang-at-eleven',
  'two-people-at-once',
  'the-kingdom-calendar',
  'every-song-carries-the-word',
  'what-a-songid-is',
  'published-before-it-airs',
  'how-a-frequency-is-assigned',
  'hosted-in-the-language',
  'the-languages-still-missing',
  'where-this-band-is-going',
  'how-to-use-this-band',
  'leave-it-on',
  'for-the-person-who-stopped-going',
  'still-being-built-on-purpose',
  'on-air-today',
];

const HM_ARTICLES = (function () {
  const pool = {};
  HM_CORE.concat(HM_MORE).forEach(function (a) {
    if (pool[a.slug]) throw new Error('two HM pieces share the slug ' + a.slug);
    pool[a.slug] = a;
  });
  const unknown = HM_ORDER.filter(function (s) { return !pool[s]; });
  if (unknown.length) throw new Error('HM_ORDER names pieces that do not exist: ' + unknown.join(', '));
  const unplaced = Object.keys(pool).filter(function (s) { return HM_ORDER.indexOf(s) < 0; });
  if (unplaced.length) throw new Error('HM pieces missing from HM_ORDER: ' + unplaced.join(', '));
  return HM_ORDER.map(function (s) { return pool[s]; });
})();

const SECTIONS = [
  {
    id: 'home', nav: 'Home', label: 'Home',
    // `catalog` is what this section is called when it is LISTED as a category
    // rather than navigated to — the stations.html table prints it as a heading,
    // where "Home" would name a destination instead of a kind of station. The
    // other three are already content names and carry over unchanged.
    catalog: 'Christian Music', note: 'Praise, worship and the AI music formats',
    blurb: 'Every frequency on the Heavenly Modulation dial, in one place.',
    shelves: [
      // One continuous grid, no shelf headings: every English Christian music
      // station — the music band plus the AI music formats — with the stations
      // that actually play first. `flat` tells the renderer to drop the shelf
      // header so the page reads as a single list rather than sections.
      { title: '', flat: true, stations: englishMusic() }
    ]
  },
  {
    id: 'teaching', nav: 'Bible Studies & Prayers', label: 'Bible Studies & Prayers',
    catalog: 'Bible Studies & Prayers', note: 'Teaching, devotionals, prayer and talk',
    // Like Home: one continuous grid. `intro:false` drops the page heading and
    // blurb too, so nothing but cards sits between the nav and the catalog —
    // the active nav item already says which category you are looking at.
    intro: false,
    shelves: [
      { title: '', flat: true, stations: flatOrder(where(function (s) {
          return ['bible_studies', 'devotionals', 'prayer', 'online_church',
                  'hebrew_roots', 'talk_podcasts'].indexOf(s.primary) >= 0;
        })) }
    ]
  },
  {
    id: 'kids', nav: 'Family Friendly', label: 'Family Friendly',
    catalog: 'Family Friendly', note: 'Kids, sleep & rest, mainstream and family-safe formats',
    intro: false,
    shelves: [
      // The whole mainstream band now lands here, so the six that used to be
      // hand-picked out of it are covered by the primary test and the explicit
      // list is gone. The Set stays: children/sleep_rest/radio_theater still
      // overlap each other, and in one flat grid a station appearing twice
      // would read as a bug.
      { title: '', flat: true, stations: flatOrder([...new Set(
          where(function (s) {
            return ['children', 'sleep_rest', 'radio_theater', 'mainstream'].indexOf(s.primary) >= 0;
          })
        )]) }
    ]
  },
  {
    id: 'intl', nav: 'International Stations', label: 'International Stations',
    catalog: 'International Stations', note: 'Language editions across the multi band',
    blurb: 'Thirty stations in the listener’s own language — not translated, but hosted.',
    shelves: [
      { title: 'Americas',                 stations: intlOf('americas') },
      { title: 'Europe',                   stations: intlOf('europe') },
      { title: 'Africa',                   stations: intlOf('africa') },
      { title: 'Middle East & South Asia', stations: intlOf('middle').concat(intlOf('south')) },
      { title: 'East & Southeast Asia',    stations: intlOf('asia') },
      { title: 'Jubilee Prayers',          stations: where(function (s) { return s.prayerLine; }) }
    ]
  },
  // Right-hand side of the category bar. This one is editorial rather than a
  // shelf of stations: what the band is, and what it changes for a listener.
  // Every figure below is computed from the catalog just above, so the page
  // cannot drift out of step with the dial it describes.
  {
    id: 'hm', nav: 'The Heavenly Band', navShort: 'HM',
    label: 'The Heavenly Band',
    align: 'right',
    blurb: 'A whole radio band given back to the Kingdom — what HM is, and what it changes.',
    articles: HM_ARTICLES
  }
];

// Featured carousel on the home hero. Derived from the same list the page
// below it shows, so the hero can only feature a station that actually plays —
// it used to headline two stations with no manifest, which is the wrong first
// impression on a page whose whole point is what is on air. Falls back to the
// flagship if nothing is live, so the hero is never empty.
// Stations that get a hero slide regardless of where they rank.
//
// Jubilee Kids Party is children's programming, so it sorts below the flagship
// music stations and rank alone would never surface it — but the family
// audience arrives at the front door like everyone else, and the hero is the
// front door. It takes the last slide rather than displacing one of the three.
//
// Yes and Amen and God's Little Lambs join it for the same reason and in this
// order, taking the hero from four slides to six. Neither would ever surface on
// rank: Covenant Worship is a format of its own and children's programming
// sorts below the music stations, yet between them they are the newest thing on
// the dial — the SingItDone declaration albums, and 357 tracks for three- to
// five-year-olds that had no audio at all this morning.
//
// ORDER IS THE SLIDE ORDER. These are appended after the top three exactly as
// listed, so this array reads as the back half of the carousel.
const HERO_PINNED = ['jubilee-kids-party', 'yes-and-amen', 'gods-little-lambs'];

const FEATURED = (function () {
  const live = englishMusic().filter(function (slug) { return bySlug.get(slug).prototype; });
  if (!live.length) return [FLAGSHIP];

  // The pinned ones are held back first, so a station that would ALSO have made
  // the top three cannot take two slides.
  const out = live.filter(function (slug) { return HERO_PINNED.indexOf(slug) < 0; }).slice(0, 3);
  HERO_PINNED.forEach(function (slug) {
    // Only if it is real and actually on air — the hero must never headline a
    // station that cannot play, which is the rule the live filter above exists
    // to enforce.
    if (bySlug.has(slug) && bySlug.get(slug).prototype && out.indexOf(slug) < 0) out.push(slug);
  });
  return out;
})();

// --- 6. emit --------------------------------------------------------------
const banner = '/* GENERATED FILE - do not edit by hand.\n' +
  ' * Produced by tools/build-home-data.js from the station catalog in\n' +
  ' * public/radio.html. Re-run `node tools/build-home-data.js` after\n' +
  ' * changing the station list. ' + stations.length + ' stations, ' + MEMBERS.length + ' members.\n */';
const out = [
  banner,
  'window.KJ_MEMBERS = ' + JSON.stringify(MEMBERS) + ';',
  'window.KJ_STATIONS = ' + JSON.stringify(stations) + ';',
  'window.KJ_SECTIONS = ' + JSON.stringify(SECTIONS) + ';',
  'window.KJ_FEATURED = ' + JSON.stringify(FEATURED) + ';',
  // THE STATION A VISITOR GETS BEFORE THEY HAVE CHOSEN ONE. Emitted rather than
  // hardcoded in the player, so the flagship is named once in this file and the
  // bar, the hero and the shelves all follow it together.
  'window.KJ_DEFAULT = ' + JSON.stringify(FLAGSHIP) + ';',
  ''
].join('\n');
fs.writeFileSync(OUT, out, 'utf8');

// --- 7. report ------------------------------------------------------------
console.log('wrote ' + path.relative(ROOT, OUT) + ' (' + out.length + ' bytes)');
console.log(stations.length + ' stations, ' + MEMBERS.length + ' members');
SECTIONS.forEach(function (sec) {
  // A section carries either shelves of stations or editorial articles.
  const shelves = sec.shelves || [];
  if (!shelves.length && sec.articles) {
    console.log('  ' + sec.id.padEnd(9) + String(sec.articles.length).padStart(4) + ' articles');
    return;
  }
  const total = shelves.reduce(function (n, sh) { return n + sh.stations.length; }, 0);
  const empty = shelves.filter(function (sh) { return !sh.stations.length; }).map(function (sh) { return sh.title || '(untitled)'; });
  console.log('  ' + sec.id.padEnd(9) + String(total).padStart(4) + ' cards' +
    (empty.length ? '   EMPTY: ' + empty.join(', ') : ''));
});
const unplaced = stations.filter(function (s) {
  return !SECTIONS.some(function (sec) {
    return (sec.shelves || []).some(function (sh) { return sh.stations.indexOf(s.slug) >= 0; });
  });
});
console.log(unplaced.length
  ? '  not on any shelf (' + unplaced.length + '): ' + unplaced.map(function (s) { return s.freq + ' ' + s.name; }).join(', ')
  : '  every station appears on at least one shelf');
