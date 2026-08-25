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
// actually specifies — docs/Radio-BRD.md and KJubilee_Radio_Website_Spec.md —
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
  };
})();
const langCount = Object.keys(hmFacts.languages).length;

const HM_ARTICLES = [
  {
    kicker: 'The band',
    title: 'What Heavenly Modulation actually is',
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
    ],
  },
  {
    kicker: 'Why it matters',
    title: 'A frequency nobody has to pay to reach',
    body: [
      'Terrestrial Christian radio has always run into the same wall: transmitters are expensive, ' +
      'licences are scarce, and the hours that reach the most people are the hours that cost the ' +
      'most to buy. Small ministries do not outbid national advertisers, so they do not get the ' +
      'drive-time slot, and the voices that most need carrying are the ones that stay local.',
      'HM removes the auction. There is no transmitter to buy, no market to be priced out of, and ' +
      'no ad inventory to protect — so no programme has to earn its place by what it can sell ' +
      'against. A station exists because someone needed that station to exist.',
      'The music is generated and owned outright by the ministry, which means there is no ' +
      'performing-rights reporting sitting between a song and the person who needs to hear it. ' +
      'Nothing on this band is rented.',
    ],
  },
  {
    kicker: 'The difference',
    title: 'Twelve voices, and none of them are strangers',
    body: [
      'A playlist has no host. That is the whole reason a playlist never becomes a habit — nobody ' +
      'waits all week for a playlist. The thing listeners bond to is the person behind the mic.',
      'Every station on HM is hosted by one of the ' + hmFacts.members + ' Inspire Family personas, ' +
      'and they are not interchangeable. Elias carries the Appalachian country lane; Imani carries ' +
      'Pentecostal fire; Zev keeps the Hebrew roots and the feasts; Nova holds space for the ' +
      'de-churched before she says anything true at them. They do real on-air breaks — station ' +
      'IDs, song intros, a Scripture drop, a word of encouragement.',
      'It means a listener in a hard week is not handed an algorithm. They are handed a voice that ' +
      'sounds like it already knows what kind of week it has been.',
    ],
  },
  {
    kicker: 'The difference',
    title: 'A dial that keeps the Kingdom calendar',
    body: [
      'From Friday sundown to Saturday sundown the whole band changes character. A dedicated ' +
      'Shabbat station takes the hero slot, the palette softens, high-energy promotion steps back, ' +
      'and rest programming surfaces first. Nobody flips a switch — the calendar service computes ' +
      'the sacred window against local sunset and the site follows it.',
      'The feasts do the same thing. Passover, Unleavened Bread, Firstfruits, Shavuot, Yom Teruah, ' +
      'Yom Kippur and Tabernacles each trigger their own themed lineups and seasonal drops.',
      'Secular radio breathes with the retail calendar. This one breathes with Yahuah’s.',
    ],
  },
  {
    kicker: 'The difference',
    title: 'Every song carries the Word with it',
    body: [
      'On HM a track is not just audio. Each one carries an Encounter Layer — the Scripture it ' +
      'stands on, a finished-reality declaration the listener can speak, and a way straight into ' +
      'Bible study on the passage that song came from.',
      'That is the part no secular platform can copy, because it is not a feature. It is the ' +
      'reason the station exists. Passive listening becomes encounter without the listener having ' +
      'to do anything but leave it on.',
    ],
  },
  {
    kicker: 'The nations',
    title: 'Hosted in the language, not translated into it',
    body: [
      hmFacts.intl + ' of the stations on this band broadcast in ' + langCount + ' languages other ' +
      'than English — Spanish, Portuguese, Mandarin, Hindi, Arabic, Swahili, Yoruba, Amharic, ' +
      'Romanian, Korean, Tagalog, Vietnamese and more.',
      'They are not English stations with subtitles. Each one is hosted in its own language by the ' +
      'persona who carries that culture, and the music catalogue behind them was written in those ' +
      'languages rather than run through a translator.',
      'A believer in Bucharest or Lagos or Seoul gets a station that sounds like home, on the same ' +
      'dial as everyone else.',
    ],
  },
  {
    kicker: 'On air now',
    title: 'What is actually broadcasting today',
    live: true,
    body: [
      hmFacts.live + ' of the ' + hmFacts.total + ' assigned frequencies are live and playing right ' +
      'now: ' + hmFacts.liveNames.join(', ') + '. The rest are assigned and in build — a frequency ' +
      'is reserved before a station is finished, the same way a broadcaster holds a licence.',
      'Every live station plays from a published manifest: nothing reaches the air that is not in ' +
      'the catalogue, and every track carries a permanent twelve-character SongID that the rotation ' +
      'and play logs know it by. It is an ordinary discipline for a broadcaster and a rare one for ' +
      'a streaming service.',
    ],
  },
];

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
