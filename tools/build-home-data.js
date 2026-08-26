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
    'inspire-active':       'Pre-Evangelistic Pop',
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
    'country-gospel': 'elias',        // Elias & Eliana Inspire — HM309.30-EN
    'jubilee-gospel-fire': 'imani',   // Imani Inspire — HM302.50-EN
    'latin-worship': 'santiago',      // Santiago Inspire — HM310.90-EN
    'hebraic-celebrations': 'zev',    // Zev Inspire — HM306.20-EN
    'jubilee-ccm': 'jubilee',         // Celebrate Yeshua! — HM304.80, fronted by Jubilee
    // The two children's catalogues front their own stations.
    'gods-little-lambs': 'tiny-tiggles',    // HM360.30 — plays the Tiny Tiggles catalogue
    'jubilee-kids-party': 'party-giggles',  // HM361.90 — plays the Party Giggles catalogue
    // Pinned to the host it already had: the two entries above take two slots
    // out of the `children` rota, which re-dealt this one. Its cover is
    // already rendered with Caleb in it.
    'bedtime-blessings': 'caleb',
    // Melody's Sparkle is Melody's own catalogue — the rota had dealt this slot
    // to Nova, which would have put the wrong persona in the station's artwork.
    'inspire-active': 'melody',          // HM 376.20 — Melody's Sparkle
    // Pinned to the host they already had. The two entries above take two slots
    // out of the `music` rota, which would otherwise re-deal the avatar on these
    // six unrelated stations. Nothing significant about these pairings — they
    // are simply what the rotation had already produced.
    'inspire-hymns-heritage': 'nova', 'riddim-and-rhyme': 'zariah',
    'radiant-stones-radio': 'jubilee', 'inspire-acapella': 'caleb',
    'midnight-praise': 'nova', 'island-hallelujah': 'tahoma',
    'ancient-paths': 'amir',          // Amir Inspire — HM313.80-EN
    // Yes and Amen plays all twelve of them, so no artist is 'the artist on
    // air'. Elias fronts it because the property opens with his record and
    // apostolic commission is the register the whole catalogue declares in.
    'yes-and-amen': 'elias',          // Yes and Amen — HM303.10-EN
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
    // slug are allowed to differ — HM 305.40 is `jubilee-praise` in the station
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
    // that file is keyed by tenant id (HM305.40-EN), and the catalogue only
    // carries the frequency (305.40) and the language name. The player was
    // therefore showing the station name where the song title belongs, because
    // for a stream-backed station it had no way to know what was playing.
    // Matched on hm, which is unambiguous; slug is not (see HM 305.40).
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
  { slug: 'jubilee-kids-party', after: 'jubilee-gospel-fire' },   // HM361.90 after HM302.50
  /* God's Little Lambs is primary 'children', so it lands on Family Friendly on
     its own and would never reach Home — but it is Bible songs, which is
     Christian music by any reading, and a parent looking for it arrives at the
     front door like everyone else. Anchored to the other kids station rather
     than dropped among the adult worship formats, so the two sit together.
     It keeps its Family Friendly place as well; the shelves overlap by design. */
  { slug: 'gods-little-lambs',  after: 'jubilee-kids-party' },    // HM360.30 after HM361.90
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
  'yes-and-amen',             // Yes and Amen — HM 303.10, the SingItDone declarations
];

// The closing card(s), in order. God's Little Lambs is pinned onto Home above
// (it is primary 'children', so it never qualifies on its own) and rank then
// drops it into the middle of the shelf; this puts it at the end where it was
// asked for. Same strictness as HOME_LEAD — a bad slug fails the build.
const HOME_TAIL = [
  'gods-little-lambs',        // HM 360.30 — last card on Home
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
    title: 'What Heavenly Modulation Actually Is',
    dek: 'A broadcast band that no regulator allocated, because a ministry allocated it instead.',
    image: 'jubilee-radio',
    author: 'jubilee',
    stands: 'A frequency is a promise that the same thing is in the same place every time you tune there.',
    body: [
      'It is two in the morning somewhere and a man is driving a road he does not like, and he ' +
      'reaches out and turns the dial. He is not searching. There is nothing to search. He does not ' +
      'know what is on the other side of the hiss and that is the entire reason he is turning it. ' +
      'A station arrives halfway through a song. It has been playing for hours. It was playing ' +
      'before he found it and it will keep playing after he arrives, and not one second of it was ' +
      'arranged for him.',
      'That experience is nearly extinct, and almost nobody noticed it going. It did not die of ' +
      'unpopularity. It died because something more convenient replaced it, and the more convenient ' +
      'thing quietly removed the one property that made it worth having.',
      'AM modulates amplitude. FM modulates frequency. HM — Heavenly Modulation — is a band that ' +
      'does not exist on any tuner you can buy, because it was never allocated by a regulator. It ' +
      'was allocated by a ministry.',
      'The name is not only a pun, and it is worth taking literally for a moment. Modulation is the ' +
      'business of carrying one thing on top of another. A carrier wave on its own is featureless ' +
      'and says nothing; it is bent, very slightly and very precisely, until it holds a voice. What ' +
      'gets bent on this band is an ordinary day. The signal rides on the commute, on the washing ' +
      'up, on the ninety minutes before a night shift, on the hour after a house has gone quiet and ' +
      'nobody has decided what to do with it. The day is the carrier. What the day is made to carry ' +
      'is the modulation, and that is the whole design.',
      'The dial runs from HM ' + hmFacts.low + ' to HM ' + hmFacts.high + ', and it currently carries ' +
      hmFacts.total + ' stations. Every station holds one frequency and no two stations share a ' +
      'number, exactly as on a real broadcast band.',
      'That constraint is deliberate, and it is one of the more expensive decisions here. A number ' +
      'that belongs to one station permanently cannot be handed to a more popular station later. It ' +
      'cannot be recycled when programming is retired, and it cannot be quietly reassigned because ' +
      'the numbers would look better arranged some other way. The dial is therefore full of ' +
      'commitments that a product manager would want back. They are not given back. A frequency is a ' +
      'promise that the same thing is in the same place every time you tune there.',
      'Promises of that shape have become strange. The ordinary experience of software now is that ' +
      'the thing you liked has been moved, that the shelf you relied on has been replaced by a ' +
      'better shelf you did not ask for, and that the home screen has been rearranged overnight by ' +
      'somebody measuring something. None of that is malice. It is simply what happens when every ' +
      'surface is optimised and nothing is promised. The cost is that nothing can become a habit, ' +
      'because a habit needs the world to hold still long enough for one to form.',
      'The band is partitioned the way a broadcast band is — a five-fold band for the ministry ' +
      'stations, a multilanguage band for the nations, a mainstream band for the always-on formats. ' +
      'Learn roughly where things sit and you can find your way about without looking, which is ' +
      'precisely the skill a real dial teaches and a search box never can. People who grew up with ' +
      'radio can still put a hand on a frequency in the dark.',
      'You are not scrolling a content library. You are turning a dial. That difference is not ' +
      'decoration, and it is not nostalgia either.',
      'A library asks what you want before it will play anything. That sounds like service and it ' +
      'is a trap, because it means a library can only ever hand back something you already knew to ' +
      'ask for. It is a mirror with a search box in front of it. The better the recommendations get, ' +
      'the more exactly they return you to yourself, and a person who is only ever returned to ' +
      'themselves is not being reached by anything. They are being confirmed. There is a particular ' +
      'loneliness in a service that has ten thousand hours of music and no capacity to surprise you.',
      'A dial plays whether or not you chose.',
      'Consider what that actually looks like. A woman puts a station on in her mother\'s room ' +
      'because the silence there had become the loudest thing in the house. She is not choosing ' +
      'songs; she has neither the attention nor the heart for it, and choosing would mean thinking ' +
      'about why she was choosing. She simply leaves it running. Over three weeks the room fills up ' +
      'with music that nobody in it selected. Some of it she would have skipped. One of the songs she ' +
      'catches herself singing at a bus stop a month after the funeral, and she could not tell you ' +
      'its name, and it is doing more for her at that bus stop than any sermon she can remember.',
      'Nothing in that sequence required her to have been looking. That is the mechanism, and it ' +
      'cannot be reproduced by a service that waits to be asked.',
      'This costs something, and it is only honest to name it. A dial will play you a song you would ' +
      'not have chosen. It will play a language you do not speak, a style you find dated, a ' +
      'programme you would have skipped past in a list. You are not the editor here. Somebody else ' +
      'decided, hours ago, and left it running, and there are moments when that is genuinely ' +
      'irritating.',
      'The irritation is not a defect in the format. It is the format. Every good thing a broadcast ' +
      'band has ever done for anybody depends on the listener not being in charge of the next three ' +
      'minutes. Nobody was ever argued into the hymn they found themselves singing at a graveside ' +
      'forty years later. It was put in front of them by someone else, repeatedly, at an hour when ' +
      'they were not paying attention, and it stayed.',
      'So the band is not a metaphor and it is not a skin over a playlist. The frequencies are real ' +
      'commitments, the schedule is published before it airs, and two people who tune to the same ' +
      'number at the same second hear the same song. It is the one format that lets a song find ' +
      'someone who was not looking for it, and that is the entire point of putting the gospel on ' +
      'the air.',
      'All of which is theory until something is actually playing. So here is the part that is not ' +
      'theory.',
      'The dial carries four kinds of programming, and it is worth knowing they are there before ' +
      'you start turning. There is music, which is most of the band \u2014 praise and worship, ' +
      'contemporary, country, gospel, hymns, and a good deal besides. There is teaching and prayer, ' +
      'where the Word is opened and explained and prayed through rather than sung. There is family ' +
      'programming, which is simply safe: entertaining, clean, and playable in a room with children ' +
      'in it whether or not every track names God out loud. And there are the international ' +
      'stations, hosted in their own languages for the nations rather than translated into them ' +
      'afterwards. Four kinds, one dial, and no menu to work your way through.',
      'If you want somewhere to start, start at HM 308.70 \u2014 kJubilee Radio. It is the flagship of ' +
      'the band and it is the station built for exactly the case this article has been describing: ' +
      'the one where you do not want to make a decision. It carries continuous worship and teaching ' +
      'from the Inspire Family catalog, running day and night, and it will not play you the same ' +
      'song twice in a day. It is the one to leave on in a kitchen, in a car, in a workshop, in a ' +
      'room where ' +
      'somebody is ill and the silence has got too loud. You will not love every track. That is not ' +
      'a fault in the station; that is the format doing the one thing a playlist cannot do for you.',
      'There is nothing to install. No app, no download and no card. Open kJubilee.com on whatever ' +
      'phone or laptop is nearest, press play, and it plays \u2014 it is deliberately built for ' +
      'inexpensive phones and thin connections, so it starts on the hardware people actually have. ' +
      'If you would like it closer to hand, add the page to your home screen and it will open like ' +
      'anything else on it. And do make yourself an account while you are there. It is free, it ' +
      'keeps your favourites with you across every Jubilee site, and it is how this band finds out ' +
      'which frequencies people are actually reaching for \u2014 which is how the next one gets built.',
      'So consider this an invitation rather than an offer. Do not evaluate it, and do not explore ' +
      'it \u2014 those are library words, and this is not a library. Put HM 308.70 on this afternoon ' +
      'while you are doing something else, and then leave it alone. Let it play whether or not you ' +
      'chose. Give it a week of ordinary days and you will know perfectly well whether it belongs ' +
      'in your house, and you will not have had to decide a single thing to find out.',
    ],
  },
  {
    slug: 'why-it-had-to-be-music',
    kicker: 'Why music',
    title: 'Why It Had to Be Music',
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
    title: 'Free, and Built to Stay Free',
    dek: 'No subscription, no advertising, no pledge drive — and a structural reason it can stay that way.',
    image: 'gods-little-lambs',
    author: 'jubilee',
    stands: 'Free is not a launch promotion here. It is what is left once you remove the two costs that normally force a price.',
    body: [
      'Every station on this band is free to listen to. There is no subscription tier, no advert ' +
      'between songs and no pledge week. You open the page, you press play, and it plays.',
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
    title: 'AI, Pointed at the Kingdom',
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
    title: 'Everywhere There Is a Signal',
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
    title: 'Twelve Voices, and None of Them Are Strangers',
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
    title: 'A Frequency Nobody Has to Pay to Reach',
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
    title: 'A Dial That Keeps the Kingdom Calendar',
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
    title: 'Every Song Carries the Word with It',
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
    title: 'Hosted in the Language, Not Translated into It',
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
    title: 'Still Being Built, on Purpose',
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
    title: 'What Is Actually Broadcasting Today',
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
    title: 'Can a Machine Worship?',
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
    title: 'What We Will Never Let AI Decide',
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
    title: 'Who Wrote This Song?',
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
    title: 'The Cost of a Station, Then and Now',
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
    title: 'Every Tool the Church Was Afraid Of',
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
    title: 'The First Thing Anyone Did After the Sea Closed',
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
    title: 'Lament Has a Frequency Too',
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
    title: 'The Song You Sang at Eleven and Still Know',
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
    title: 'Every Worship Song Is Talking to Two People at Once',
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
    title: 'What a SongID Is, and Why You Should Care',
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
    title: 'The Schedule Is Published Before It Airs',
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
    title: 'How a Frequency Gets Assigned',
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
    title: 'Twenty Languages, and the Ones Still Missing',
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
    title: 'Where This Band Is Going',
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
    title: 'How to Use a Radio Band You Cannot Buy a Radio For',
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
    title: 'Leave It On',
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
    title: 'For the Person Who Stopped Going',
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

/* ── The voices ────────────────────────────────────────────────────────────
   Seven pieces for each of the twelve Inspire Family personas. A persona is
   the beat, not a byline: each slate is drawn from the stations that persona
   actually holds, so a piece could not be swapped to another voice without
   ceasing to make sense. Split across HM_VOICES_1..6 for readability only —
   HM_ORDER is what decides the grid.                                        */

const HM_VOICES_1 = [
  /* ---- Nova Inspire — for the doubting -------------------------------- */
  {
    slug: 'doubt-is-not-the-opposite-of-faith',
    kicker: 'For the doubting',
    title: 'Doubt Is Not the Opposite of Faith. Certainty Is.',
    dek: 'The thing almost nobody says to a person who has started asking questions.',
    image: 'the-mended-place',
    author: 'nova',
    stands: 'Faith is what you do while you are not sure. If you were sure, it would not be faith. It would be arithmetic.',
    body: [
      'The standard response to a doubting believer is to try to remove the doubt, usually by ' +
      'supplying an answer at speed. It rarely works, and the reason it rarely works is that the ' +
      'diagnosis was wrong. Doubt is not a hole in faith. It is very often the shape faith takes ' +
      'in a person who is paying attention.',
      'Consider what faith would even mean without it. Hebrews calls faith the substance of things ' +
      'hoped for, the evidence of things not seen — which is a definition built entirely around ' +
      'not having the matter settled. Faith is what you do while you are not sure. If you were ' +
      'sure, it would not be faith. It would be arithmetic.',
      'The real opposite is certainty, and certainty is the more dangerous condition by some ' +
      'distance. A certain person cannot be taught, cannot be corrected, and has no further use ' +
      'for prayer except as a formality. Every account in Scripture of someone going badly wrong ' +
      'features a man who was completely sure.',
      'So this station does not treat a question as an emergency. It plays for people who are ' +
      'still here and still asking, which is most people, most of the time, whatever they say ' +
      'out loud on a Sunday.',
    ],
  },
  {
    slug: 'questions-you-were-told-not-to-ask',
    kicker: 'For the doubting',
    title: 'The Questions You Were Told Not to Ask in Church',
    dek: 'Not because they are dangerous, but because somebody in the room did not have an answer.',
    image: 'logos',
    author: 'nova',
    stands: 'A question that gets shut down does not go away. It goes underground, and it takes the person with it.',
    body: [
      'Most people who have left a church can name the moment. It is almost never a doctrinal ' +
      'crisis. It is a question asked in good faith that was met with a look, a deflection, or a ' +
      'sentence beginning “we just have to trust” — and the understanding, arriving all at once, ' +
      'that this was not a room where that could be said.',
      'The questions are not exotic. Why does God permit this. What actually happens to people ' +
      'who never heard. How do I square these two passages that plainly disagree. Why did nothing ' +
      'change when I prayed about it for six years.',
      'None of those is a threat to anything true. They are the ordinary questions of anyone who ' +
      'has read the book carefully and looked at the world honestly, and the historic Church has ' +
      'argued about every one of them at length and in public. The discomfort in the room was ' +
      'never about the question. It was about somebody not having an answer and not being allowed ' +
      'to say so.',
      'A question that gets shut down does not go away. It goes underground, and it takes the ' +
      'person with it. So The Logos is a frequency where the asking is the programming rather than ' +
      'an interruption to it.',
    ],
  },
  {
    slug: 'come-back-without-explaining',
    kicker: 'For the doubting',
    title: 'You Can Come Back Without Explaining Where You Went',
    dek: 'The debrief nobody owes anybody, and the station built on not asking for one.',
    image: 'the-comeback-room',
    author: 'nova',
    stands: 'The father in that parable runs down the road before the son gets a word out. The speech the son prepared is never actually needed.',
    body: [
      'There is an unwritten toll on returning, and everybody who has been away knows the amount. ' +
      'You will be asked where you have been. You will be expected to have a narrative — a ' +
      'wandering, a lesson, a tidy arc ending in the present tense. And you will be aware, while ' +
      'delivering it, that it is being assessed.',
      'That toll keeps more people out than any argument ever has. Not because they are ashamed, ' +
      'though some are, but because the honest answer is usually shapeless. Nothing happened. It ' +
      'got hard, then it got easy to not go, and then a great deal of time passed.',
      'It is worth noticing that the most famous homecoming in Scripture does not work this way at ' +
      'all. The father runs down the road before the son gets a word out. The speech the son had ' +
      'rehearsed the whole way home is never actually needed, and the text is careful to tell us ' +
      'he had rehearsed it.',
      'So The Comeback Room asks nothing. Nobody is counted, nothing is filed against your name, ' +
      'and no one is going to ring you. You put it on, and you are back, and the terms of that ' +
      'are entirely yours.',
    ],
  },
  {
    slug: 'why-midnight-praise-exists',
    kicker: 'For the doubting',
    title: 'Why Midnight Praise Exists',
    dek: 'Three in the morning has its own theology, and almost nothing is scheduled for it.',
    image: 'midnight-praise',
    author: 'nova',
    stands: 'Paul and Silas sang at midnight. The text records the hour, and Scripture does not usually waste words on the time.',
    body: [
      'Radio schedules are built around the waking day. Breakfast, drive, afternoon, evening — the ' +
      'hours advertisers pay for, and the hours most people are in fact awake. What sits between ' +
      'midnight and five is almost always automation, because nobody is buying it.',
      'Which is a strange gap, because those are the hours when a person is least able to manage ' +
      'themselves. Grief arrives at three. So does the recurring worry, the decision that will not ' +
      'settle, the sick child, the shift that ends when everyone else is asleep. Whatever a person ' +
      'is carrying is heaviest then, and there is nobody to ring.',
      'Scripture keeps unusually careful track of that hour. Paul and Silas sang at midnight, and ' +
      'the text records the time, which Scripture does not usually bother to do. The psalmist ' +
      'remembers his song in the night. Something about the dark is treated as its own kind of ' +
      'occasion rather than as a dead zone between two days.',
      'So this frequency is programmed for it deliberately — quieter, slower, with more space ' +
      'between things, and a voice that assumes you are awake for a reason. It is the least ' +
      'commercially defensible station on the band and one of the easiest to justify.',
    ],
  },
  {
    slug: 'hymns-were-written-in-trouble',
    kicker: 'For the doubting',
    title: 'Hymns Survive Because They Were Written by People in Trouble',
    dek: 'Not heritage, and not nostalgia — the ones that lasted were forged in the worst year of somebody’s life.',
    image: 'inspire-hymns-heritage',
    author: 'nova',
    stands: 'A hymn is a sentence somebody had to mean under pressure. That is why it holds weight the next person can lean on.',
    body: [
      'The case usually made for hymns is a bad one. It is that they are old, that they are ' +
      'reverent, and that the modern stuff is thin — an argument about taste dressed as an ' +
      'argument about depth, and it convinces nobody under fifty.',
      'The better case is biographical. Go and look at when the ones that lasted were written. It ' +
      'Is Well With My Soul was written by a man who had just lost four daughters at sea. Amazing ' +
      'Grace was written by a former slave trader who had understood what he had done. Cowper ' +
      'wrote some of the most durable lines in English hymnody while severely, repeatedly ill in ' +
      'his mind.',
      'That is not a coincidence and it is not morbid. A hymn is a sentence somebody had to mean ' +
      'under pressure, and pressure is what removes everything from a line that was only ever ' +
      'decorative. What is left holds weight, which is precisely why the next person can lean on ' +
      'it.',
      'It also explains why they work for doubters better than almost anything written for ' +
      'doubters. These are not songs by people who found it easy. They are field notes from people ' +
      'who did not, and who kept singing anyway.',
    ],
  },
  {
    slug: 'wisdom-when-advice-runs-out',
    kicker: 'For the doubting',
    title: 'What Wisdom Is, When Advice Has Run Out',
    dek: 'Advice tells you what to do. Wisdom is for the situations where nobody can.',
    image: 'wisdom-channel',
    author: 'nova',
    stands: 'Job’s friends gave superb advice for seven days after they stopped sitting with him in silence. The silence was the wise part.',
    body: [
      'Advice assumes a solvable problem. Given the facts, here is the action, and if you take it ' +
      'the situation improves. Most of life is like that, and advice is genuinely useful, which is ' +
      'why there is so much of it.',
      'Then there are the other situations. The diagnosis that is not going to change. The ' +
      'estrangement where you have already apologised. The work you are good at and cannot ' +
      'continue. Advice arrives in those rooms too, and it lands as an insult, because it is ' +
      'treating as a puzzle something the person has already understood is not one.',
      'Wisdom is the older category and it is doing a different job. It is not about the next ' +
      'action. It is about how to be a person while the thing is true — what to hold on to, what ' +
      'to stop demanding, what is actually yours to carry. Proverbs is largely about competence, ' +
      'and then Ecclesiastes and Job sit right beside it saying: and here is what to do when ' +
      'competence is not the issue.',
      'Job’s friends were superb advisers. They were only wise during the seven days at the start, ' +
      'when they sat with him and said nothing. This station is trying to be the seven days.',
    ],
  },
  {
    slug: 'nothing-here-closes-the-deal',
    kicker: 'For the doubting',
    title: 'Nothing Here Is Trying to Close the Deal',
    dek: 'An editorial policy, stated plainly, so you can hold the station to it.',
    image: 'whole-hearted-sisters',
    author: 'nova',
    stands: 'If a thing is true, it does not need a technique. If it needs a technique, that is worth noticing about the thing.',
    body: [
      'Anyone who has spent time near modern Christian media can feel the machinery. The story ' +
      'that turns, the pause before the appeal, the music arriving underneath the sentence that ' +
      'matters. It is a set of techniques borrowed almost entirely from direct marketing, and it ' +
      'works, in the narrow sense that it produces a response.',
      'It also teaches the listener something nobody intended: that they are a target. Once a ' +
      'person has noticed the shape, they hear it everywhere, and they stop being able to receive ' +
      'anything on these frequencies without first checking what it wants from them.',
      'So the policy on the stations under this beat is straightforward. No countdown. No urgency ' +
      'that was manufactured rather than real. No story engineered so that the turn lands on a ' +
      'request. If something here is worth agreeing with, it will have to manage that on the ' +
      'merits, in the ordinary way, at whatever speed the listener actually moves.',
      'This costs something and it is worth saying so. Measured on response, it will lose to the ' +
      'machinery every time. The argument for it is simple: if a thing is true it does not need a ' +
      'technique, and if it needs a technique that is worth noticing about the thing.',
    ],
  },

  /* ---- Jubilee Inspire — the whole house sings ------------------------- */
  {
    slug: 'what-plays-on-the-flagship',
    kicker: 'The whole house sings',
    title: 'What Plays on the Flagship, and Why That Is the Hardest Choice',
    dek: 'A station for everybody is the most difficult remit on the dial, not the easiest.',
    image: 'jubilee-radio',
    author: 'jubilee',
    stands: 'A specialist station only has to be right for its listener. The flagship has to be right for a stranger.',
    body: [
      'It is tempting to think of a flagship as the easy assignment — the broad one, the middle of ' +
      'the road, the station that does not have to commit. In practice it is the hardest brief on ' +
      'the band, and the reason is that it is the only frequency with no permission to assume ' +
      'anything about who is listening.',
      'Every other station here gets to know its audience. Torah Sings can assume an interest in ' +
      'the feasts. Grief Walked can assume a loss. The Ancient Paths can assume a curiosity about ' +
      'where the faith came from. Each of those assumptions is worth a great deal, because it lets ' +
      'a station be specific, and specific is what makes anything good.',
      'The flagship gets none of that. It is what a person hears when they arrive knowing nothing, ' +
      'which means it has to be true enough for a believer of forty years and open enough for ' +
      'somebody who has never been in a church, in the same three minutes, without patronising ' +
      'either.',
      'So the rule here is that nothing goes on the flagship that needs to be explained first, and ' +
      'nothing goes on it that would embarrass us in front of somebody who knows the subject. That ' +
      'narrows it considerably, and what survives is the station.',
    ],
  },
  {
    slug: 'four-generations-one-radio',
    kicker: 'The whole house sings',
    title: 'A House Where Four Generations Have to Agree on the Radio',
    dek: 'The real design problem behind a family station, and why most of them solve it badly.',
    image: 'inspire-family-pop',
    author: 'jubilee',
    stands: 'Most family radio is aimed at the parent and endured by everybody else. That is not a family station. It is a parent station with hostages.',
    body: [
      'Picture the actual room. A grandmother who learned the faith in a language of hymns. Two ' +
      'parents who came up on whatever was on the radio in the nineties. A teenager with far ' +
      'better taste than anyone credits. A six-year-old. One set of speakers.',
      'Most family radio resolves this by aiming at the parent and hoping. The grandmother finds ' +
      'it loud, the teenager finds it embarrassing, the six-year-old is not being served at all, ' +
      'and everybody tolerates it because the parent controls the dial. That is not a family ' +
      'station. It is a parent station with hostages.',
      'The alternative is not to average everyone into beige, which is the other common failure ' +
      'and a worse one. It is to build a rotation where each of those four people gets something ' +
      'that is genuinely for them at some point in the hour, and where the others can survive it ' +
      'cheerfully because their turn is coming.',
      'That is a scheduling problem rather than a music problem, and it is solvable. What it needs ' +
      'is somebody willing to programme for the whole room instead of for the person holding the ' +
      'remote.',
    ],
  },
  {
    slug: 'decisions-before-you-know',
    kicker: 'The whole house sings',
    title: 'The Ones You Make Before You Know They Were Decisions',
    dek: 'Almost nothing that changes a life arrives labelled as a fork in the road.',
    image: 'decisions-that-matter',
    author: 'jubilee',
    stands: 'The large decisions announce themselves and get prayed over. The ones that actually set the direction are made in about four seconds.',
    body: [
      'Ask somebody how they ended up where they are and they will tell you about a few big ' +
      'moments — the job, the move, the marriage. Press a little and something else usually ' +
      'surfaces: that the big moment was mostly the consequence of a hundred small ones that ' +
      'nobody was treating as decisions at the time.',
      'Who you spend a Tuesday evening with. What you do with the first ten minutes of the ' +
      'morning. Whether you say the mildly dishonest thing that makes the conversation easier. ' +
      'Whether you keep the promise that nobody would notice you breaking. None of those feels ' +
      'like a fork in the road, and every one of them is quietly setting the direction.',
      'Scripture is unusually attentive to this. It spends far less time on dramatic choices than ' +
      'a reader expects, and a great deal of time on habits, company, speech and small ' +
      'faithfulness — because that is where character is actually assembled, and character is what ' +
      'makes the big decision when it comes.',
      'So this station is not about crisis navigation. It is about the four-second choices, made ' +
      'while distracted, that turn out to have been the ones that mattered.',
    ],
  },
  {
    slug: 'celebrating-without-borrowing',
    kicker: 'The whole house sings',
    title: 'Celebrating Yeshua Without Borrowing the World’s Party',
    dek: 'Joy is not the same thing as a loud room, and the difference is audible.',
    image: 'radiant-stones-radio',
    author: 'jubilee',
    stands: 'The world knows how to throw a party and cannot manufacture the reason for one. We have the reason and keep borrowing the party.',
    body: [
      'There is a version of Christian celebration that is simply a secular party with the lyrics ' +
      'swapped. Same build, same drop, same instruction to put your hands up, and a chorus that ' +
      'would work equally well about a person, a weekend or a brand.',
      'It is not that the energy is wrong. Scripture is full of noise — trumpets, dancing, shouting ' +
      'until the ground moves. David embarrasses his household with it. The objection is narrower ' +
      'than the usual killjoy one, and it is this: the borrowed version has the celebration ' +
      'without the occasion, and after a while a listener can hear that nothing in particular is ' +
      'being celebrated.',
      'The world knows how to throw a party and cannot manufacture the reason for one. That is the ' +
      'actual asymmetry, and it runs entirely in our favour. We have an occasion — a specific ' +
      'person, a specific event, a debt actually settled — and we keep trading it for a production ' +
      'technique.',
      'Celebration that names what it is celebrating sounds different. It is usually more ' +
      'specific, often less loud, and it survives being listened to twice.',
    ],
  },
  {
    slug: 'when-faith-feels-hard-is-not-beginner',
    kicker: 'The whole house sings',
    title: 'When Faith Feels Hard Is Not a Beginner Station',
    dek: 'The people who need it most have usually been at this for decades.',
    image: 'when-faith-feels-hard',
    author: 'jubilee',
    stands: 'Nobody warns you that the hardest stretch tends to arrive in year twenty, to someone doing everything right.',
    body: [
      'The assumption baked into the title is that difficulty belongs to the beginning — that ' +
      'faith is hard while it is new, and then it settles. It is a comforting model and it does ' +
      'not match many actual lives.',
      'The hard stretch far more often arrives late, and to people who are doing everything they ' +
      'were told to do. Twenty years in, having served, given, prayed and shown up, a person finds ' +
      'that the thing has gone quiet. Not disproved — quiet. The practices still run and produce ' +
      'nothing they can feel, and there is no vocabulary in most churches for saying so out loud ' +
      'without sounding like a warning to everybody else.',
      'That silence has a long pedigree. It is the middle of most psalms. It is the whole of ' +
      'Ecclesiastes. It is Elijah under the tree, immediately after the single greatest public ' +
      'victory of his career, asking to die. The pattern of collapse-after-triumph is in the text ' +
      'because it is in people.',
      'So the station is not aimed at doubters or newcomers. It is for the long-serving, in the ' +
      'flat years, who have nowhere to say it — and it treats that as an ordinary stretch of the ' +
      'road rather than as a failure to be fixed.',
    ],
  },
  {
    slug: 'never-twice-in-a-day',
    kicker: 'The whole house sings',
    title: 'Why the Flagship Never Plays a Song Twice in a Day',
    dek: 'Commercial radio repeats its best track every four hours. Here is the argument against.',
    image: 'jubilee-ccm',
    author: 'jubilee',
    stands: 'Repetition is how you build a hit, and familiarity is not the same thing as agreement.',
    body: [
      'Commercial music radio runs on repetition. The strongest songs are in heavy rotation, which ' +
      'in practice means several plays a day, and the reason is well understood: familiarity is ' +
      'the largest single driver of whether somebody says they like a song. Play it enough and ' +
      'people come to want it.',
      'That mechanism works exactly as well on a worship song, which is the problem. A track can ' +
      'be installed in a congregation by rotation alone, and the affection it accumulates is ' +
      'indistinguishable, from the inside, from agreement with what it says. People end up ' +
      'attached to a line they have never once examined.',
      'There is a related cost. Heavy rotation means a small pool, and a small pool means the ' +
      'ninety per cent of the catalogue that is not the current handful never gets heard — ' +
      'including most of what is unusual, most of what is old, and most of what came from ' +
      'somewhere other than the two or three places that currently export worship music.',
      'So the flagship does not repeat inside a day. It costs some of the comfort of the familiar, ' +
      'and it buys a listener a genuinely wider week and a fair chance of noticing what they are ' +
      'agreeing to.',
    ],
  },
  {
    slug: 'jazz-when-nobody-is-performing',
    kicker: 'The whole house sings',
    title: 'Jazz Is What Worship Sounds Like When Nobody Is Performing',
    dek: 'A form built on listening to each other rather than on delivering a rehearsed thing.',
    image: 'inspire-jazz',
    author: 'jubilee',
    stands: 'The whole form is people listening to each other closely enough to respond in real time. There are worse descriptions of a church.',
    body: [
      'Jazz is an odd fit for a worship band on paper. It has no obvious congregational function, ' +
      'most of it has no words at all, and its reputation is for cleverness — which is not a ' +
      'virtue anybody is looking for in this context.',
      'The reason it earns a frequency is structural. Almost every other form on this dial is ' +
      'delivered: a thing was written, arranged and rehearsed, and then it is presented, ' +
      'identically, to a room. Jazz is the one common form organised around the opposite ' +
      'principle. It is people listening to each other closely enough to respond in real time, ' +
      'inside an agreed shape, where nobody knows exactly what the next minute contains.',
      'There are considerably worse descriptions of a church than that. And there are worse ' +
      'descriptions of prayer, which is also a form with a shape and no script, in which the ' +
      'listening is most of the work.',
      'It is also, practically, the least intrusive music on the band. It fills a room without ' +
      'demanding the room, which is why it is on at the hours when people are working, talking, ' +
      'or trying to think.',
    ],
  },
];

const HM_VOICES_2 = [
  /* ---- Melody Inspire — everyday family faith -------------------------- */
  {
    slug: 'family-faith-is-mostly-logistics',
    kicker: 'Everyday family faith',
    title: 'Family Faith Is Mostly Logistics',
    dek: 'The unglamorous truth, and why admitting it takes the guilt out of the whole subject.',
    image: 'inspire-kids',
    author: 'melody',
    stands: 'Nobody teaches this because it does not sound spiritual. It is, however, the part that decides whether any of the rest happens.',
    body: [
      'The literature on raising children in the faith is almost entirely about content — what to ' +
      'teach, which verses, which questions to expect. Very little of it is about the actual ' +
      'obstacle, which is that there are four people, three schedules, one bathroom and eleven ' +
      'minutes.',
      'What survives contact with a real week is whatever was attached to something that was ' +
      'already going to happen. A grace said because everyone is sitting down anyway. A song ' +
      'because the car journey exists regardless. Two minutes at bedtime because bedtime is ' +
      'non-negotiable. The families who keep something going are almost never the most devout ' +
      'ones. They are the ones who bolted it to a fixed point.',
      'Anything that needs its own slot will be the first thing cut, and it will be cut in week ' +
      'three, and the parent will privately file it as a spiritual failure rather than as a ' +
      'scheduling one. That misfiling does a lot of damage over a decade.',
      'So the honest advice is unromantic. Do not design a family devotional. Find the thing that ' +
      'already happens every single day without anyone deciding, and put something true next to ' +
      'it. That is the whole method, and it is why a station that is simply on does more work than ' +
      'a programme nobody can start.',
    ],
  },
  {
    slug: 'a-sanctuary-that-is-a-kitchen',
    kicker: 'Everyday family faith',
    title: 'What a Sanctuary Sounds Like When It Is a Kitchen',
    dek: 'The word does not mean a building. It means a place where something is protected.',
    image: 'jubilee-sanctuary',
    author: 'melody',
    stands: 'A sanctuary is not a quiet room. It is a place where a particular thing is safe, and quiet is optional.',
    body: [
      'Sanctuary has drifted into meaning the large room with the good acoustics, which is a ' +
      'shame, because the older sense is far more useful to anybody who does not live in one. A ' +
      'sanctuary is a place where something is protected — where a thing that is vulnerable ' +
      'everywhere else cannot be reached.',
      'By that definition a kitchen qualifies more often than a building does. It is where the ' +
      'family actually assembles, where the difficult conversation eventually gets had, and where ' +
      'a child learns what the adults are really like by watching how they behave when tired.',
      'It is also, notably, not quiet. The protected thing is not silence. It is whatever is being ' +
      'kept safe in that room — honesty, usually, and the assumption that a person can say the ' +
      'true version of how their day went without it being used against them later.',
      'A station can help with that or hinder it. Something true playing underneath a room lowers ' +
      'the temperature of it and gives people somewhere to put their eyes. That is a small ' +
      'function and it is worth a frequency.',
    ],
  },
  {
    slug: 'twenty-minutes-in-the-car',
    kicker: 'Everyday family faith',
    title: 'The Twenty Minutes in the Car Are the Discipleship',
    dek: 'Side by side, no eye contact, and a fixed end point. It is a nearly perfect format.',
    image: 'inspire-latin',
    author: 'melody',
    stands: 'A child will tell you things at forty miles an hour that they would never say across a table.',
    body: [
      'Every parent of a teenager works this out eventually, usually by accident. The conversations ' +
      'that matter do not happen when you sit down opposite them and announce that you want to ' +
      'talk. They happen in the car.',
      'The reasons are almost mechanical. You are side by side rather than face to face, so ' +
      'nothing has to be held in eye contact. There is a fixed end point, so nobody is trapped. ' +
      'There is a legitimate reason to be there that is not the conversation, so the conversation ' +
      'can be abandoned without anybody having failed. And there is something else to look at, ' +
      'which is what most people need in order to say a hard sentence.',
      'It is worth noticing how much of the teaching in the Gospels happens while walking. Not ' +
      'seated in a room, arranged for the purpose — on a road, going somewhere else, with the ' +
      'lesson attached to whatever came up. The Emmaus conversation is a seven-mile walk, and the ' +
      'teaching only lands because the journey gave it the time.',
      'So what goes on the radio for those twenty minutes is not background. It is the raw ' +
      'material for whatever gets said, and quite often it is what starts the sentence.',
    ],
  },
  {
    slug: 'children-do-not-need-a-simplified-god',
    kicker: 'Everyday family faith',
    title: 'Children Do Not Need a Simplified God',
    dek: 'Simple language, yes. A smaller God, no — and children can tell the difference immediately.',
    image: 'inspire-kids',
    author: 'melody',
    stands: 'Simplifying the words is respect. Simplifying the subject is a debt, and it comes due in the teenage years with interest.',
    body: [
      'There is a real skill in saying a large thing in small words, and children’s material that ' +
      'does it well is worth a great deal. That is not what this is about. This is about the other ' +
      'move — where the subject itself gets shrunk, so that what is handed over is not a simple ' +
      'account of God but an account of a simple God.',
      'It looks like kindness and it is a loan. A child given a God who is mainly nice, who does ' +
      'not do anything difficult and who never appears in a story that ends badly, will meet the ' +
      'actual text somewhere around thirteen and find they were told a different religion. The ' +
      'usual response is not a crisis of faith. It is a quiet conclusion that the adults were ' +
      'managing them.',
      'Children are also considerably tougher than the material aimed at them assumes. They ' +
      'already know that people die, that adults are frightened sometimes, and that some things ' +
      'do not get fixed. What they lack is not resilience but vocabulary, and a story that ' +
      'pretends otherwise is not protecting them from anything they had not already noticed.',
      'So the standard on the children’s stations is the same as everywhere else on this band. ' +
      'Small words, ordinary sentences, and nothing left out because it is uncomfortable.',
    ],
  },
  {
    slug: 'beyond-the-trauma-is-not-over-it',
    kicker: 'Everyday family faith',
    title: 'Beyond the Trauma Is Not the Same as over It',
    dek: 'A station name that is doing careful work, and a distinction most recovery language misses.',
    image: 'beyond-the-trauma',
    author: 'melody',
    stands: 'Beyond means you have travelled. It does not mean the ground behind you has changed.',
    body: [
      'The word people reach for is over. Are you over it. She is not over it yet. He should be ' +
      'over it by now. The metaphor is a hurdle: a discrete obstacle, cleared once, after which ' +
      'the track is flat again.',
      'That metaphor is wrong for almost everything serious, and it does damage on both sides. The ' +
      'person carrying the thing hears that they are late. Everybody else gets a schedule against ' +
      'which to measure them, and a reason to be quietly impatient when it is not met.',
      'Beyond is a different word doing a different job. It says a distance has been covered, and ' +
      'it says nothing at all about the ground behind you having changed. It is possible to have ' +
      'travelled a very long way and for the thing to still be exactly where it was, still that ' +
      'size, still capable of arriving in the room on an ordinary Tuesday because of a smell.',
      'What actually improves is range. Early on, the whole map is organised around it; later, ' +
      'there is more country. That is real progress and it is worth naming honestly, because the ' +
      'alternative — being told you should be over it — teaches people to perform a recovery they ' +
      'have not had.',
    ],
  },
  {
    slug: 'what-grows-back-and-what-does-not',
    kicker: 'Everyday family faith',
    title: 'What Actually Grows Back, and What Does Not',
    dek: 'Restoration is a real promise and a specific one. It is not the same as replacement.',
    image: 'restored-renewed',
    author: 'melody',
    stands: 'Joel promises the years the locusts ate will be restored. It does not promise the locusts never came.',
    body: [
      'Restoration language gets used loosely, and the looseness sets people up badly. The ' +
      'implication a listener takes away is that the thing lost will be handed back in its ' +
      'original condition, and when it is not, the promise looks broken rather than misread.',
      'Look at what is actually promised. Joel says the years the locusts ate will be restored — ' +
      'the years, not the locusts undone. Job ends with more than he began with, and four ' +
      'daughters do not become the same four daughters. The New Testament word for it keeps ' +
      'carrying the sense of putting back into working order, which is a specific and modest claim ' +
      'and a very different one from erasure.',
      'That distinction matters enormously in practice. Capacity comes back. Function comes back. ' +
      'The ability to work, to trust, to be in a room, to enjoy something — those are the things ' +
      'that genuinely return, often more slowly than anyone wants and often more completely than ' +
      'the person expected in the worst part of it.',
      'What does not come back is the timeline. Nobody gets the decade returned. Restoration is ' +
      'not a reversal, it is a rebuild, and a rebuild is a real and sufficient thing to be ' +
      'promised.',
    ],
  },
  {
    slug: 'who-teaches-your-children-the-words',
    kicker: 'Everyday family faith',
    title: 'Whose Job Is It to Teach Your Children the Words?',
    dek: 'The uncomfortable one, asked plainly, with no guilt attached to the answer.',
    image: 'jubilee-sanctuary',
    author: 'melody',
    stands: 'An hour a week against everything else a child hears is not a fair contest, and it was never designed to be one.',
    body: [
      'The honest arithmetic is unfriendly. A child in a churchgoing family might get an hour a ' +
      'week of explicit teaching from somebody other than their parents. Set that against the ' +
      'hours of everything else and it is not a contest, and it was never intended to be one — ' +
      'the arrangement Scripture describes has the teaching happening at home, constantly, in ' +
      'ordinary conversation, with the formal gathering as reinforcement rather than as the ' +
      'delivery mechanism.',
      'Almost every parent knows this and almost every parent feels caught by it, because the ' +
      'obvious inference is that they are not doing enough. Which is where the guilt comes in, and ' +
      'the guilt is worth interrupting, because it is a poor motivator and it usually produces an ' +
      'ambitious plan that lasts nine days.',
      'The realistic version is much smaller. You are not required to teach a syllabus. You are ' +
      'required to be a person your children can watch, and to let what you actually think be ' +
      'audible in the house rather than kept for Sundays. Most of what transfers is caught rather ' +
      'than taught, which is either the most reassuring sentence in this piece or the most ' +
      'alarming one, depending on the week.',
      'And some of it can be shared out. A station cannot raise anybody’s children. It can put ' +
      'the words in the room often enough that they are familiar when the moment comes to use ' +
      'them.',
    ],
  },

  /* ---- Zariah Inspire — Caribbean and diaspora ------------------------- */
  {
    slug: 'riddim-was-church-first',
    kicker: 'Caribbean and diaspora',
    title: 'Riddim Was Church Before It Was Radio',
    dek: 'The rhythm arrived in the sanctuary first. The charts came along later and took the credit.',
    image: 'riddim-and-rhyme',
    author: 'zariah',
    stands: 'The drum was not borrowed from the dancehall. Both of them got it from the same place, and the church got there first.',
    body: [
      'There is a tidy story about Caribbean gospel in which the church, arriving late and ' +
      'reluctantly, borrows a popular rhythm in order to reach young people. It is the story told ' +
      'about a lot of music and it has the direction of travel backwards.',
      'The rhythms came out of communities where the church was the institution that survived — ' +
      'often the only one people owned outright, frequently the only building where a large group ' +
      'could gather without permission. What was worked out in those rooms did not stay in them, ' +
      'and a great deal of what later became commercially enormous had been running in a ' +
      'congregation for a generation first.',
      'That has practical consequences for how a station like this is built. It is not an ' +
      'evangelistic use of somebody else’s sound. It is the older stream, and it does not need to ' +
      'apologise to anybody for the drum or justify it to a nervous elder.',
      'It also settles the recurring question of whether this music is too much for worship. The ' +
      'people who developed it were worshipping at the time.',
    ],
  },
  {
    slug: 'worship-in-a-country-not-yours',
    kicker: 'Caribbean and diaspora',
    title: 'Worshipping in a Country That Is Not Yours',
    dek: 'The particular loneliness of praising God in a place where your praise is an accent.',
    image: 'france-inspire-francais',
    author: 'zariah',
    stands: 'You can be entirely welcome in a church and still be the only person in it who knows what the song is supposed to feel like.',
    body: [
      'There is a specific experience that people who have moved will recognise and that people ' +
      'who have not usually cannot picture. You are in a church. Everybody is kind. Nothing is ' +
      'wrong. And you are the only person in the room who knows what this song is supposed to feel ' +
      'like, because where you are from it is not taken at this speed and not sung sitting down.',
      'It is not exclusion. That is what makes it hard to raise. Nobody has done anything, there ' +
      'is nothing to complain about, and the sensation is simply that the part of worship which ' +
      'used to be effortless has become a translation you are performing in your head.',
      'Scripture has a whole vocabulary for this, and it is not a small corner of the book. How ' +
      'shall we sing the Lord’s song in a strange land is one of the most quoted lines in the ' +
      'Psalms, and it is a genuine question rather than a rhetorical one. A very large amount of ' +
      'the Bible was written by, for and about displaced people.',
      'So these stations exist to be the room where the translation stops for an hour — where the ' +
      'thing sounds the way it sounds at home, and nobody has to explain why that matters.',
    ],
  },
  {
    slug: 'french-is-not-a-translation',
    kicker: 'Caribbean and diaspora',
    title: 'Why the French Station Is Not a Translation of the English One',
    dek: 'It has a different playlist, a different pace and a different set of concerns, on purpose.',
    image: 'jubilee-prayers-french',
    author: 'zariah',
    stands: 'A dubbed station is a station about somebody else, delivered in your language. That is not the same as a station for you.',
    body: [
      'The cheap way to serve another language is to take the English schedule and change the ' +
      'voice track. Same songs, same running order, same references, now in French. It is fast, it ' +
      'is defensible on a spreadsheet, and it produces something a listener can tell is second ' +
      'hand within about four minutes.',
      'What gives it away is never the vocabulary. It is the assumptions underneath. The examples ' +
      'come from somewhere else. The seasons are wrong. The songs are the ones that were popular ' +
      'in a different country, arranged for a different kind of room, and the pacing belongs to a ' +
      'broadcasting culture the listener does not live in.',
      'French-language worship is not English worship with different words on it. It has its own ' +
      'repertoire, much of it from West Africa, the Caribbean and Québec rather than from Paris, ' +
      'and it carries a different relationship to formality, to the choir, and to how long a ' +
      'thing is allowed to take.',
      'So this frequency was built rather than converted. It shares the band, the discipline and ' +
      'the standards with everything else here, and almost nothing else — which is the point.',
    ],
  },
  {
    slug: 'the-commute-belongs-to-you',
    kicker: 'Caribbean and diaspora',
    title: 'The Commute Is the Only Hour That Belongs to You',
    dek: 'Nobody can reach you, nothing is expected, and it is the last unclaimed slot in most days.',
    image: 'inspire-drive',
    author: 'zariah',
    stands: 'Everybody wants that hour. Most days it is the only one where you get to decide what goes in.',
    body: [
      'Look honestly at a working day and count the hours that are actually yours. Not free — ' +
      'yours, in the sense that you choose what occupies your attention. For most people the ' +
      'answer is somewhere near zero, with one exception.',
      'The commute is strange because it is simultaneously obligatory and unsupervised. You have ' +
      'to be there, and while you are there nobody can require anything of you. No colleague can ' +
      'reach you, no child needs anything, and there is nothing you could be doing instead that ' +
      'you are failing to do. It is the last uncontested slot in a great many lives.',
      'Which is exactly why so much competes for it. Every podcast, every news service and every ' +
      'streaming platform is designed around that hour, and most of what fills it leaves people ' +
      'arriving in a slightly worse condition than they set off in — more informed, more agitated, ' +
      'no better prepared for the room they are walking into.',
      'It is a reasonable thing to be deliberate about. Whatever goes in during that hour is the ' +
      'last thing said to you before the day starts and the first thing said after it ends, and ' +
      'over a year that is a great many hours to hand over without deciding.',
    ],
  },
  {
    slug: 'holidays-hold-the-old-country',
    kicker: 'Caribbean and diaspora',
    title: 'Holidays Are Where the Old Country Survives',
    dek: 'Language goes first, then food, then the songs. The feast days are where the last of it holds on.',
    image: 'inspire-holiday',
    author: 'zariah',
    stands: 'A grandchild who cannot hold a conversation in the language will still know every word of the song that gets sung once a year.',
    body: [
      'Migration erodes in a predictable order, and anybody in the second or third generation can ' +
      'watch it happening in their own family. The language goes first, usually within two ' +
      'generations. The food lasts longer because it is daily. The music lasts longest of all, ' +
      'and what preserves it is the calendar.',
      'This is the pattern almost everywhere. A grandchild who cannot hold a conversation in the ' +
      'language will nonetheless know every word of the song that gets sung once a year, because ' +
      'that song is bolted to an occasion that keeps recurring whether or not anybody has ' +
      'maintained anything else.',
      'It gives the holiday frequencies a job larger than atmosphere. What is on them is, for a ' +
      'lot of families, the annual transfer — the one point in the year when the older repertoire ' +
      'is audible in a house that otherwise runs entirely in the new country’s music.',
      'Which is worth taking seriously when programming them. A holiday station that plays only ' +
      'the internationally famous versions of things is quietly finishing the erosion it could ' +
      'have interrupted.',
    ],
  },
  {
    slug: 'a-rhythm-your-grandmother-knows',
    kicker: 'Caribbean and diaspora',
    title: 'A Rhythm Your Grandmother Would Recognise',
    dek: 'Continuity is not conservatism. It is the test of whether a thing was ever really yours.',
    image: 'riddim-and-rhyme',
    author: 'zariah',
    stands: 'If your grandmother could not find her way into it, something got replaced rather than developed.',
    body: [
      'There is a useful test for any church music, and it costs nothing to apply. Could your ' +
      'grandmother find her way into this. Not enjoy it, necessarily, and certainly not choose it ' +
      '— but recognise it. Find the beat. Know where the line lands.',
      'This is not an argument for keeping everything the way it was. Every living tradition ' +
      'changes constantly, and the ones that stop changing become museum pieces within one ' +
      'generation. Development is normal and it is healthy.',
      'The test is distinguishing development from replacement. Development moves and stays ' +
      'legible to the people it came from. Replacement imports a form wholesale from somewhere ' +
      'else, and its tell is exactly this: the previous generation cannot get in. They are not ' +
      'being challenged by it. They are locked out of it, in their own church, using a form that ' +
      'arrived from a country none of them have been to.',
      'A tradition that fails this test has usually swapped its inheritance for whatever was ' +
      'currently being exported, and it will have to do that again in fifteen years, because it ' +
      'no longer has anything of its own to develop from.',
    ],
  },
  {
    slug: 'praying-in-the-language-you-dream-in',
    kicker: 'Caribbean and diaspora',
    title: 'Praying in the Language You Dream In',
    dek: 'Fluency is not the issue. There is a language a person is most themselves in, and God speaks it.',
    image: 'jubilee-prayers-french',
    author: 'zariah',
    stands: 'You can be perfectly fluent in a language and still not be able to be honest in it.',
    body: [
      'People who live between two languages will tell you they are slightly different people in ' +
      'each. Not less capable — different. There is one they argue in, one they count in, and one ' +
      'they would swear in if something fell on their foot, and those are frequently not the same ' +
      'language.',
      'Prayer sits with the last group. Whatever a person prays in when nothing is going well is ' +
      'the language underneath the others, and it is very often not the one they are most ' +
      'educated in. Fluency turns out to be the wrong measure entirely. You can be perfectly ' +
      'fluent in a language and still be unable to be honest in it, because you learned it in ' +
      'rooms where honesty was not what was called for.',
      'Pentecost is unusually pointed about this. The miracle described is not that everybody ' +
      'suddenly understood one language. It is that each person heard in the language they were ' +
      'born into — which was an expensive way to do it, and evidently the way it was meant to be ' +
      'done.',
      'So the prayer frequencies are hosted in their own languages rather than subtitled, at the ' +
      'hours when people are awake and alone with something. That is not a nicety. It is the ' +
      'difference between a prayer somebody joins and a prayer somebody observes.',
    ],
  },
];

const HM_VOICES_3 = [
  /* ---- Caleb Inspire — young, courageous worship ----------------------- */
  {
    slug: 'courage-is-mostly-boring',
    kicker: 'Young, courageous worship',
    title: 'Courage Is Mostly Boring',
    dek: 'The word gets used for the dramatic version. Almost all of the real thing is repetitive and unwitnessed.',
    image: 'inspire-talk',
    author: 'caleb',
    stands: 'Nobody is ever going to congratulate you for the thing that actually took courage, because nobody is going to know it happened.',
    body: [
      'Courage is sold to young men as a moment. There is a stand to be taken, a room to be walked ' +
      'into, a thing to be said out loud at cost. Those moments are real and they do arrive, but ' +
      'they are a rounding error in the total, and building a whole idea of manhood around them ' +
      'leaves a person unprepared for the actual assignment.',
      'The real thing is almost entirely repetitive. Getting up at the same time when nothing ' +
      'depends on it. Continuing to be decent to somebody who has not noticed. Doing the work when ' +
      'the outcome will be credited elsewhere. Staying in a marriage, a job or a church through ' +
      'the flat year that has no story in it.',
      'None of that photographs. Nobody is going to congratulate you, because nobody is going to ' +
      'know it happened, and that absence of witness is precisely what makes it the harder ' +
      'version. A dramatic act of courage has adrenaline and an audience helping it along. The ' +
      'boring kind has neither.',
      'This is why the New Testament word usually rendered as endurance is so much more common ' +
      'than any word for bravery. What is being asked for is not a burst. It is a rate — ' +
      'maintained, without applause, for a long time.',
    ],
  },
  {
    slug: 'iron-requires-two-pieces-of-iron',
    kicker: 'Young, courageous worship',
    title: 'Iron Sharpening Iron Requires Two Pieces of Iron',
    dek: 'The verse gets quoted at men who have no such friendship, as if naming it produced one.',
    image: 'iron-sharpening-iron',
    author: 'caleb',
    stands: 'Sharpening makes a noise, removes material, and cannot be done at a distance. Most of what men call friendship is none of those.',
    body: [
      'The proverb is quoted constantly and almost always as encouragement, which is a strange use ' +
      'of it, because the image is not an encouraging one. Sharpening is abrasive. It makes a ' +
      'noise, it removes material, and it requires the two objects to be pressed together hard ' +
      'enough that something comes off.',
      'Set that against what most men actually have. A group chat. Some colleagues. Several people ' +
      'who would come to the funeral and none who could name what he is currently getting wrong. ' +
      'That is not iron and iron. That is proximity, and proximity sharpens nothing.',
      'The condition the proverb assumes is specific and rare. It needs someone close enough to ' +
      'see the fault, with standing to name it, and a relationship durable enough to survive them ' +
      'doing so. Any one of those is common. The three together are not, and they cannot be ' +
      'produced by deciding to have them.',
      'What they can be produced by is time and regularity — the same people, often, over years, ' +
      'in an arrangement neither party has to keep choosing. Which is unglamorous, slow, and ' +
      'almost the only method that has ever worked.',
    ],
  },
  {
    slug: 'marriage-matters-is-not-a-conference',
    kicker: 'Young, courageous worship',
    title: 'Marriage Matters Is Not a Conference',
    dek: 'A weekend produces resolve. A marriage runs on Tuesdays, and nothing is scheduled for Tuesdays.',
    image: 'marriage-matters',
    author: 'caleb',
    stands: 'The intensive weekend has an excellent record on how people feel by Sunday night and almost none on where they are in March.',
    body: [
      'The dominant format for marriage teaching is the intensive: a weekend, a course, a retreat. ' +
      'Concentrated, expensive, emotionally significant, and genuinely useful — most people come ' +
      'out of one with things named that had been unnameable for years.',
      'Then everybody goes home. And the thing that erodes a marriage was never a lack of insight ' +
      'in the first place. It is the accumulated weight of ordinary Tuesdays: the tone used about ' +
      'a small thing, the conversation postponed for the fourth time, the assumption that has ' +
      'quietly hardened and not been checked in eighteen months.',
      'Insight has a short half-life against that. Resolve formed on a Sunday night is measurably ' +
      'gone by the middle of the following month, not because anybody was insincere but because ' +
      'resolve is not the mechanism that runs daily life. Habit is, and habit is built by ' +
      'repetition at low intensity.',
      'Which is what a station is for. Not a weekend that produces feeling, but something in the ' +
      'room on an ordinary evening, saying the ordinary thing, often enough that it is available ' +
      'on the night it is needed.',
    ],
  },
  {
    slug: 'after-the-storm-nobody-films',
    kicker: 'Young, courageous worship',
    title: 'After the Storm: The Part Nobody Films',
    dek: 'The testimony ends at the rescue. The clearing up takes years and has no audience.',
    image: 'after-the-storm',
    author: 'caleb',
    stands: 'Every testimony you have heard was edited to end at the good bit, and everybody listening quietly concluded that theirs was going wrong.',
    body: [
      'The testimony has a fixed shape. There was a bad time, God moved, and here I am. It is ' +
      'told from the far side and compressed, and the compression is where the damage is done — ' +
      'because the bad time gets four minutes and the rescue gets the applause, and the years ' +
      'between the two are not in the account at all.',
      'The person listening does the arithmetic without meaning to. Their own bad time has been ' +
      'running for two years with no visible turn, so either they are doing it wrong or they were ' +
      'not given whatever the speaker was given. Neither conclusion is true and both are entirely ' +
      'reasonable given the evidence presented.',
      'What is missing is the clearing up. After a storm there is a long stretch of dull, ' +
      'unphotogenic work — the debt, the reputation, the trust that has to be rebuilt with people ' +
      'who are entitled to be wary, the habit that has to be broken again on an ordinary ' +
      'afternoon. That stretch is where most people actually live, and it is nearly absent from ' +
      'the material.',
      'So this station is programmed for the clearing up rather than for the rescue. It assumes ' +
      'the storm has passed and that this has not made the week easy.',
    ],
  },
  {
    slug: 'acapella-when-production-stops',
    kicker: 'Young, courageous worship',
    title: 'Acapella Is What Is Left When the Production Stops',
    dek: 'Strip the arrangement and you find out whether the song was ever carrying anything.',
    image: 'inspire-acapella',
    author: 'caleb',
    stands: 'Production can make a weak line feel enormous. Take it away and the line has to be enormous by itself, or it is just a sentence.',
    body: [
      'Modern worship production is very good, and that is the difficulty. A build, a drop and the ' +
      'right reverb can make almost any line feel significant. The feeling is real; what is not ' +
      'reliable is the inference that the line caused it.',
      'Take the arrangement away and the question resolves immediately. A song sung by voices ' +
      'alone has nothing to hide behind. Either the words are carrying it or the room notices ' +
      'within about eight seconds, and there is no engineering available to rescue the situation.',
      'This is a useful thing to have on a band, and not only as an aesthetic preference. It is a ' +
      'test the rest of the catalogue can be held against. A song that survives being sung ' +
      'unaccompanied by four people in a kitchen is a song that will survive being sung by a ' +
      'congregation with no band, in a country with no equipment, in a room with no power.',
      'It is also, historically, the normal condition. Almost every song that has lasted more than ' +
      'a century was written for voices and whatever happened to be in the room, and most of the ' +
      'world still worships that way.',
    ],
  },
  {
    slug: 'the-last-ten-minutes-of-the-day',
    kicker: 'Young, courageous worship',
    title: 'The Last Ten Minutes of the Day Belong to Somebody',
    dek: 'Whatever occupies them is what the mind works on all night. That slot is worth defending.',
    image: 'bedtime-blessings',
    author: 'caleb',
    stands: 'You do not get to choose what you think about at four in the morning. You do get to choose what you handed yourself at eleven.',
    body: [
      'There is nothing mystical about the last ten minutes before sleep. It is simply that the ' +
      'mind keeps working on whatever it was last given, and it does so without supervision for ' +
      'the next several hours.',
      'Most people hand it something hostile. The scroll, the news, the message that will not be ' +
      'answered until tomorrow, the tallying of an unfinished argument. None of that gets resolved ' +
      'at that hour and all of it gets processed, which is why so many people wake at four with ' +
      'the exact item they went to bed holding, now larger.',
      'The old practice was to close the day deliberately — a set form of words, said at the same ' +
      'time, whether or not the day warranted it. Compline exists for this, and so does the ' +
      'bedtime blessing said over a child, and the reason both survived for centuries is that they ' +
      'work on the mechanism rather than on the mood. You are not required to feel settled. You ' +
      'are required to say the thing, and the saying does the work.',
      'For a child it is formation. For an adult it is maintenance. Either way it is the one slot ' +
      'in the day with a guaranteed several hours of consequences attached.',
    ],
  },
  {
    slug: 'a-station-not-a-podcast',
    kicker: 'Young, courageous worship',
    title: 'Why a Young Man Needs a Station and Not a Podcast',
    dek: 'One of these builds a habit. The other builds an appetite, and they are not the same.',
    image: 'inspire-cafe',
    author: 'caleb',
    stands: 'A podcast asks you to choose it every time. Anything that has to be chosen every time eventually will not be.',
    body: [
      'Podcasts are the dominant format for men under forty and they are extremely good at what ' +
      'they do. They are long, they are conversational, and they get listened to for hours, which ' +
      'is more than most media manages.',
      'What they are structurally poor at is regularity. Every listen begins with a decision — ' +
      'which one, which episode, is this the mood for. That decision is small and it is made ' +
      'dozens of times a week, and anything requiring a decision that often is eventually going ' +
      'to be decided against, usually during the exact week it was most needed.',
      'The second problem is that the format optimises for interest. A podcast has to be ' +
      'compelling or it is not finished, which pushes everything toward the novel, the ' +
      'argumentative and the strongly stated. That is a fine diet in moderation and a poor one as ' +
      'a staple, because it builds an appetite for stimulation rather than a habit of attention.',
      'A station asks for one decision and then keeps going. It is on during the flat week as well ' +
      'as the interested one, it says the ordinary thing rather than the striking one, and it does ' +
      'not require you to be in the mood. Which is precisely the property you want from anything ' +
      'meant to form you.',
    ],
  },

  /* ---- Zev Inspire — Hebrew roots and the feasts ----------------------- */
  {
    slug: 'the-feasts-are-a-calendar',
    kicker: 'Hebrew roots and the feasts',
    title: 'The Feasts Are Not Jewish Nostalgia. They Are a Calendar.',
    dek: 'Everyone keeps a calendar. The only question is whose, and what it is quietly teaching.',
    image: 'hebraic-celebrations',
    author: 'zev',
    stands: 'A calendar is a curriculum. It decides what you think about, in what order, every year, whether or not you agreed to it.',
    body: [
      'The usual objection to the feasts is that they belong to somebody else — that they are ' +
      'cultural rather than binding, and that observing them is either sentimental or a quiet ' +
      'return to law. It is a serious objection and it deserves a serious answer, but it usually ' +
      'arrives without noticing the thing it assumes: that the alternative is no calendar at all.',
      'There is no such alternative. Everyone lives inside one. If it is not the feasts it is the ' +
      'retail year — a long build to December, a slump, a manufactured romance in February, a ' +
      'summer, back to school, and around again. That cycle is not neutral. It teaches ' +
      'acquisition, then exhaustion, then acquisition, and it teaches it annually, to everybody, ' +
      'including people who would say they are not participating.',
      'A calendar is a curriculum. It decides what you think about and in what order, every year, ' +
      'without asking. Which makes the real question not whether to keep one but which one, and ' +
      'what it is teaching while nobody is paying attention.',
      'The feast cycle teaches deliverance, provision, harvest, atonement and dwelling — in that ' +
      'order, on a fixed schedule, tied to actual events. Whatever else is true about how a ' +
      'believer should relate to them, that is a considerably better syllabus than the one most ' +
      'people are enrolled in by default.',
    ],
  },
  {
    slug: 'when-the-law-is-set-to-music',
    kicker: 'Hebrew roots and the feasts',
    title: 'What Happens When the Law Is Set to Music',
    dek: 'It stops being a list of rules and starts being something you can carry around.',
    image: 'jubilee-praise',
    author: 'zev',
    stands: 'The instruction to memorise it comes with an instruction about how. Write it as a song, and put it in their mouths.',
    body: [
      'Read as prose, a legal text resists memory almost completely. It is dense, it is ' +
      'enumerated, and nothing about its structure helps a person hold it. Anyone who has tried to ' +
      'commit a chapter of Leviticus to memory understands the problem immediately.',
      'Set the same material to music and the difficulty inverts. Melody supplies exactly what ' +
      'prose withholds — a fixed order, a rhythm that flags a missing word, and a shape that ' +
      'survives decades of not being used. This is not a modern discovery. It is why the ' +
      'instruction to remember comes bundled with an instruction about method: write it as a song, ' +
      'teach it to them, put it in their mouths.',
      'Something else happens as well, and it is the part people do not expect. Sung, the material ' +
      'stops reading as a list of prohibitions and starts reading as a description of a ' +
      'relationship — because music forces the affective question. You cannot sing a line without ' +
      'taking a position on how you feel about it, and a great deal of the text turns out to be ' +
      'warmer than it looks on the page.',
      'That is what this frequency is doing. Not decorating the Law, and not softening it. Putting ' +
      'it in the form it was originally meant to be carried in.',
    ],
  },
  {
    slug: 'shema-means-hear-then-do',
    kicker: 'Hebrew roots and the feasts',
    title: 'Shema Means Hear, and Then It Means Do',
    dek: 'A word with no clean English equivalent, and a whole posture lost in the translation.',
    image: 'shema-roots',
    author: 'zev',
    stands: 'In English you can hear a thing perfectly and do nothing about it, and no one has misused the word. In Hebrew that is not available.',
    body: [
      'Hear, O Israel. In English that is a request for attention, and it is complete once ' +
      'attention has been given. A person can hear something, understand it fully, decide against ' +
      'it, and have used the word correctly throughout.',
      'Shema does not divide that way. The same word covers hearing, understanding, and acting on ' +
      'what was heard, and it is used across all three without a seam. A child who has been told ' +
      'and has not done it has not, in this construction, heard. Obedience is not a separate step ' +
      'that follows listening; it is part of what listening means.',
      'That single feature changes a great deal of the text. Every command to hear becomes a ' +
      'command to comply. Every complaint that the people would not hear stops being about ' +
      'attention spans and becomes about refusal. And the daily confession that opens with the ' +
      'word stops being an appeal for quiet and becomes a statement about how the whole day is ' +
      'going to be conducted.',
      'It also explains a certain frustration in the prophets that reads oddly in English. They ' +
      'are not complaining that nobody was listening. They are complaining that everybody had ' +
      'listened, and that in Hebrew that ought to have settled the matter.',
    ],
  },
  {
    slug: 'the-subject-every-station-avoids',
    kicker: 'Hebrew roots and the feasts',
    title: 'The Subject Every Station Avoids at the Same Time',
    dek: 'Scripture discusses money constantly. Christian radio discusses it almost never, and the reason is not mysterious.',
    image: 'money-faith',
    author: 'zev',
    stands: 'A station funded by its listeners cannot teach freely about money. It has a position, and everyone can hear it.',
    body: [
      'Money is one of the most heavily covered subjects in Scripture. It appears in the law, ' +
      'throughout the prophets, repeatedly in the parables, and in most of the letters. Whatever ' +
      'else the text is reticent about, this is not it.',
      'Christian broadcasting is close to silent on it, and when it does speak the range is ' +
      'narrow: generosity, usually, and stewardship, occasionally, and almost never debt, wages, ' +
      'inheritance, the treatment of the poor, or what a person is allowed to charge. The gap ' +
      'between the source material and the coverage is enormous and it is not an accident.',
      'The reason is structural rather than cowardly. A station that depends on listener giving ' +
      'cannot teach freely on money, because every sentence it says is heard against its own ' +
      'interest. Even the true things sound like the setup for an appeal, and the presenters know ' +
      'it, so the whole subject gets handled at a distance.',
      'This band does not take listener money, does not sell advertising, and has nothing to raise ' +
      'from anybody. That does not make it right about the subject. It does mean it can discuss ' +
      'the whole of it — including the parts that cost the speaker something — without the ' +
      'listener having to wonder what the sentence is for.',
    ],
  },
  {
    slug: 'washing-feet-before-anyone-watches',
    kicker: 'Hebrew roots and the feasts',
    title: 'Washing Feet Before Anyone Is Watching',
    dek: 'The gesture has been thoroughly domesticated. What it originally demonstrated was rank.',
    image: 'lead-like-yeshua',
    author: 'zev',
    stands: 'It was the job given to whoever in the household had the least standing. That is the whole content of the demonstration.',
    body: [
      'Foot washing survives as an occasional ceremony, performed once a year, generally by ' +
      'somebody senior, in front of a congregation, with clean feet and warm water. Everybody ' +
      'understands it as a symbol of humility and almost nobody is uncomfortable.',
      'The original was not like that. It was a genuinely unpleasant job, assigned to whoever in ' +
      'the household had the least standing, on roads shared with animals. The point was not that ' +
      'the task was menial in the abstract. The point was that it was rank-coded, and everybody in ' +
      'the room could read the code instantly.',
      'That is why Peter objects. He is not being squeamish, he is being ordered — the ' +
      'arrangement of the room is being publicly inverted, and he can see exactly what it implies ' +
      'about every assumption he has been operating on.',
      'The domesticated version loses all of this, which is why it can be performed annually ' +
      'without changing anything. The live equivalent is not a ceremony at all. It is doing the ' +
      'task that your position is understood to exempt you from, at a time when nobody is ' +
      'watching and no one will be told, and finding out what you actually think about rank when ' +
      'there is no audience to be humble in front of.',
    ],
  },
  {
    slug: 'identity-is-not-a-personality-type',
    kicker: 'Hebrew roots and the feasts',
    title: 'Identity in Yeshua Is Not a Personality Type',
    dek: 'The word has been absorbed by an industry that means something else by it entirely.',
    image: 'identity-in-yeshua',
    author: 'zev',
    stands: 'One of these is discovered by looking inward and describing what is there. The other is conferred, from outside, by somebody else.',
    body: [
      'Identity has become an enormous cultural category, and most of what it now carries is ' +
      'descriptive. It is the set of traits, preferences and histories that make a person ' +
      'distinguishable, arrived at by examination — tests, types, reflection, the long project of ' +
      'working out who you really are underneath.',
      'The biblical usage runs in the opposite direction and it is easy to miss because the word ' +
      'is the same. What the text describes is not discovered but conferred. Adopted. Named. ' +
      'Bought. Grafted in. In every one of those images the decisive action is taken by somebody ' +
      'else, and the recipient’s contribution is to accept a status that was not generated ' +
      'internally and cannot be revised by further introspection.',
      'The practical difference shows up under pressure. A discovered identity has to be ' +
      'maintained, defended and periodically re-verified, which is exhausting and which is why so ' +
      'much of the culture around it is anxious. A conferred one does not depend on the holder’s ' +
      'current condition at all. It is as true on the bad Tuesday as it was on the day it was ' +
      'given.',
      'That is a much stronger claim than the therapeutic version, and it is also a stranger one. ' +
      'It says the most important true thing about a person is not something they found out about ' +
      'themselves.',
    ],
  },
  {
    slug: 'why-heavens-dawn-airs-before-sunrise',
    kicker: 'Hebrew roots and the feasts',
    title: 'Why Heaven’s Dawn Airs Before Sunrise',
    dek: 'The day starts the night before on this calendar, and the schedule follows it.',
    image: 'heavens-dawn',
    author: 'zev',
    stands: 'And there was evening, and there was morning — the first day. The order in that sentence is not decorative.',
    body: [
      'Genesis reports each day in an order that most readers slide past. Evening first, then ' +
      'morning, then the day is counted. On this reckoning a day does not begin when you wake up ' +
      'and get to work on it. It begins in darkness, while you are asleep, and by the time you are ' +
      'conscious it has been running for hours without your assistance.',
      'That is a small structural fact with a large disposition attached. A day that starts at ' +
      'dawn is a day you are responsible for launching. A day that started last night was ' +
      'underway before you arrived, and your part in it is to join something already in progress.',
      'It also puts rest in a different position. On the common model, sleep is recovery from the ' +
      'day that has finished — you earn it, at the end, having spent yourself. On this one it is ' +
      'the opening move, which makes rest preparation rather than payment, and reframes the whole ' +
      'anxious relationship a person can develop with productivity.',
      'So the station is scheduled to the older reckoning. The turn happens in the dark, and what ' +
      'plays before first light is the beginning of the day rather than the tail of the last one.',
    ],
  },
];

const HM_VOICES_4 = [
  /* ---- Imani Inspire — Pentecostal fire -------------------------------- */
  {
    slug: 'fire-is-not-volume',
    kicker: 'Pentecostal fire',
    title: 'Fire Is Not Volume',
    dek: 'The correction Pentecostal radio needs most, from inside the tradition rather than outside it.',
    image: 'jubilee-gospel-fire',
    author: 'imani',
    stands: 'Elijah gets wind, earthquake and fire, and the text says God was in none of them. Then a low voice, and he covers his face.',
    body: [
      'Somewhere along the way loudness became the evidence. If the room is not shouting, nothing ' +
      'is happening; if the music is not enormous, the Spirit has not come. It is an easy ' +
      'assumption to make because the two genuinely do occur together often, and a great deal of ' +
      'the tradition’s best moments have been noisy.',
      'The difficulty is that volume is manufacturable and presence is not. Any competent musician ' +
      'can produce the physiological signature of a move of God in about ninety seconds — the ' +
      'build, the key change, the held note, the room on its feet. That is a technique, it works ' +
      'on anybody, and it works identically at a concert with no theological content whatsoever.',
      'Once a congregation has been trained to read intensity as presence, it will keep needing ' +
      'more of it, and the people running the room will keep supplying it, and nobody in the ' +
      'building is lying. Everybody is simply measuring with the wrong instrument.',
      'Elijah is the correction, and it is placed immediately after his loudest possible victory. ' +
      'Wind, earthquake and fire all arrive, and the text goes out of its way to say God was in ' +
      'none of the three. Then a low voice, and that is the point at which he covers his face. ' +
      'This tradition owns that passage as much as it owns Acts 2.',
    ],
  },
  {
    slug: 'ten-days-before-one-day',
    kicker: 'Pentecostal fire',
    title: 'Ten Days of Waiting Before One Day of Fire',
    dek: 'Everybody preaches the second chapter. The first one is where the people actually live.',
    image: 'upper-room',
    author: 'imani',
    stands: 'They were told to wait, with no date given, in a city that had recently executed their teacher. The waiting is not the preamble. It is most of the account.',
    body: [
      'Acts 2 is one of the most preached chapters in the book. Acts 1 is the setup nobody lingers ' +
      'on, which is unfortunate, because it contains the part that most listeners are currently ' +
      'living in.',
      'They were told to wait. No date was given. They waited in an upper room in a city that had ' +
      'recently executed their teacher, in a group that had very publicly failed him, with an ' +
      'instruction that must have looked increasingly like nothing was going to happen. That is ' +
      'ten days of ordinary time, and the text records what they did with it: they prayed, they ' +
      'stayed together, and they handled a piece of unglamorous administrative business.',
      'It is worth saying plainly that the waiting is not a delay before the story. It is a large ' +
      'part of the story, and it is the part that is reproducible. Almost nobody reading this is ' +
      'currently in Acts 2. A great many people are in Acts 1 — obedient, gathered, praying, and ' +
      'entirely without evidence that the instruction was worth following.',
      'The tradition that most celebrates the fire ought to be the best in the world at teaching ' +
      'the ten days. Mostly it is not, and this station is an attempt to correct that in its own ' +
      'house.',
    ],
  },
  {
    slug: 'africa-is-a-broadcaster',
    kicker: 'Pentecostal fire',
    title: 'Africa Is Not a Mission Field on This Dial. It Is a Broadcaster.',
    dek: 'The direction of travel assumed by most Christian media is a century out of date.',
    image: 'africa-inspire-kiswahili',
    author: 'imani',
    stands: 'The centre of gravity of the Church moved decades ago. Most of the media has not been told.',
    body: [
      'Almost all Christian broadcasting still runs on a nineteenth-century map. Content is made ' +
      'in a handful of wealthy countries and sent outward; the receiving end is described as a ' +
      'field, and the traffic is understood to move in one direction. The vocabulary gives it ' +
      'away — reaching, going, sending — and every one of those words positions the listener as ' +
      'the destination rather than as a participant.',
      'The map has been wrong for a long time. The Church’s centre of gravity moved south and east ' +
      'decades ago, in numbers, in growth and in the ordinary business of sending missionaries, ' +
      'and a great deal of the most vital worship music now in circulation was written in places ' +
      'that the older map filed under recipients.',
      'On this band the Kiswahili, Yorùbá and Amharic frequencies are not outreach. They are ' +
      'stations, held by a host, with catalogues written in those languages, sitting on the same ' +
      'dial as everything else and subject to the same standards. Nobody is being reached. People ' +
      'are being broadcast to in the ordinary sense in which anybody is broadcast to.',
      'The distinction sounds like politics and it is really about quality. Material made for a ' +
      'field is made down. Material made for an audience is made properly, because the people ' +
      'making it expect to be judged by them.',
    ],
  },
  {
    slug: 'what-yoruba-praise-does',
    kicker: 'Pentecostal fire',
    title: 'What Yorùbá Praise Does That a Translation Cannot',
    dek: 'In a tonal language the melody is not decoration on the words. It is part of them.',
    image: 'west-africa-inspire-yoruba',
    author: 'imani',
    stands: 'Change the pitch and you have not changed the tune. You have changed the word.',
    body: [
      'Yorùbá is a tonal language, which means pitch is not expression laid over the words but ' +
      'part of the words themselves. The same syllable at a different pitch is a different item ' +
      'of vocabulary. This is ordinary and unremarkable to any speaker and it has an extraordinary ' +
      'consequence for music.',
      'A composer setting a Yorùbá text is not free to put any note under any syllable. The melody ' +
      'has to agree with the speech tones or the line stops meaning what it said, which sounds ' +
      'like a constraint and functions as an engine — the words are already halfway to being a ' +
      'tune before anybody writes one, and the resulting music is fused to the language in a way ' +
      'that has no equivalent in English.',
      'It is also why the drums are doing more than keeping time. A talking drum can reproduce ' +
      'the tonal contour of speech closely enough to carry actual phrases, so the instrument is ' +
      'not accompanying the praise. It is participating in it, saying the same thing in a second ' +
      'register.',
      'None of that survives translation, and this is the honest reason these stations are hosted ' +
      'rather than dubbed. Translate the text and you keep the doctrine and lose the mechanism. ' +
      'What is left is accurate and inert.',
    ],
  },
  {
    slug: 'amharic-worship-is-ancient',
    kicker: 'Pentecostal fire',
    title: 'Amharic Worship Sounds Ancient Because It Is',
    dek: 'Ethiopia was Christian before most of Europe, and the music never went through the West.',
    image: 'ethiopia-inspire-amharic',
    author: 'imani',
    stands: 'This is not an old-sounding style. It is an old style, developed continuously, that simply never passed through anybody else’s hands.',
    body: [
      'A listener meeting Ethiopian worship for the first time usually reaches for the word ' +
      'ancient, and then assumes it is an aesthetic — a deliberate archaism, the way a Western ' +
      'group might use plainchant for effect. It is not an aesthetic. It is a continuous ' +
      'tradition that has been running, without a break and without passing through Western ' +
      'church music, for an extremely long time.',
      'Ethiopia was Christian as a kingdom in the fourth century, well before most of Europe, and ' +
      'the Ethiopian Church developed its own liturgy, its own notation, its own instruments and ' +
      'its own hymnody largely out of contact with the traditions that later became the default ' +
      'sound of global Christianity. What that produces is not a variant of Western worship. It is ' +
      'a parallel line.',
      'This matters for how the station is programmed and it matters for a listener’s ear. Almost ' +
      'everything else on international Christian radio, in any language, is downstream of the ' +
      'same few European and American sources. This is one of the small number of places where you ' +
      'can hear what Christian music sounds like when it was not.',
      'It is also a useful corrective to a persistent assumption. The faith did not arrive in ' +
      'Africa with the colonial period. In some places it had been there for well over a thousand ' +
      'years by the time anybody turned up to introduce it.',
    ],
  },
  {
    slug: 'praying-in-swahili-at-three',
    kicker: 'Pentecostal fire',
    title: 'Praying in Swahili at Three in the Morning',
    dek: 'A continuous prayer frequency, and why the hour it is hardest to pray is the hour it is left running.',
    image: 'jubilee-prayers-swahili',
    author: 'imani',
    stands: 'Somewhere it is always three in the morning, and somebody is always awake with something they cannot put down.',
    body: [
      'The prayer stations do one thing and do it without interruption: audible prayer, in one ' +
      'language, around the clock. No teaching, no music beds designed to move anybody, no ' +
      'presenter working the room. Just praying, continuously, in Swahili.',
      'The format looks thin written down and it earns its place in the hours when everything else ' +
      'fails. There is a state, familiar to anybody who has been in real trouble, in which a ' +
      'person cannot pray and cannot stop needing to. The words will not assemble. Every attempt ' +
      'turns into the same circular worry with a religious opening attached.',
      'What helps in that state is not encouragement to try harder. It is somebody else already ' +
      'doing it out loud, so that a person can join rather than initiate — which is a much smaller ' +
      'act and is available when the larger one is not. The whole liturgical tradition rests on ' +
      'this observation, and so does the practice of praying the Psalms.',
      'It runs continuously because the need does. The band is on every continent, so somewhere it ' +
      'is always three in the morning, and somebody is always awake with something they cannot put ' +
      'down.',
    ],
  },
  {
    slug: 'chill-is-still-pentecostal',
    kicker: 'Pentecostal fire',
    title: 'Inspire Chill Is Still a Pentecostal Station',
    dek: 'Quiet is not the absence of the Spirit. Sometimes it is the more honest report of it.',
    image: 'inspire-chill',
    author: 'imani',
    stands: 'A tradition that can only recognise God at high intensity has accidentally taught its people that most of their life is godless.',
    body: [
      'It reads like a contradiction on the schedule. Everything else under this beat is fire, ' +
      'shout, upper room — and then a station built for low volume and long spaces. The obvious ' +
      'reading is that it is the concession, the one aimed at people who find the rest too much.',
      'That is not what it is for. It is there because a tradition which can only recognise God at ' +
      'high intensity has, without meaning to, taught its people that the other ninety per cent of ' +
      'their lives is godless. Every ordinary Tuesday becomes a gap between real encounters, and ' +
      'the person begins to live for the meeting rather than in the week.',
      'That is a serious pastoral problem and it is largely self-inflicted. It produces believers ' +
      'who are devoted and depleted, who measure their standing by their most recent peak, and who ' +
      'quietly conclude during any flat season that something has gone wrong with them.',
      'A quiet frequency inside a Pentecostal house is a statement rather than a compromise. It ' +
      'says the same Spirit is present in the low hours, at conversational volume, doing ' +
      'unspectacular work — and that noticing this is not a downgrade from the fire but a ' +
      'prerequisite for surviving between fires.',
    ],
  },

  /* ---- Santiago Inspire — Latino heart --------------------------------- */
  {
    slug: 'la-familia-is-a-doctrine',
    kicker: 'Latino heart',
    title: 'La Familia Is a Doctrine, Not a Demographic',
    dek: 'Marketing treats it as an audience segment. It is closer to an ecclesiology.',
    image: 'familia-inspire-espanol',
    author: 'santiago',
    stands: 'The household is the unit Scripture keeps addressing. Everywhere else has spent a century breaking it into individuals and selling to each.',
    body: [
      'Every media company knows that Latino audiences are family-oriented, and every media ' +
      'company treats this as a targeting instruction: put more generations in the advert, and ' +
      'schedule around the times families are together. It is not wrong and it is entirely ' +
      'external — a description of behaviour rather than of the thing producing it.',
      'What is underneath is closer to a doctrine. The household, not the individual, is treated ' +
      'as the unit that things happen to. Faith is inherited within it, decisions are made ' +
      'inside it rather than reported to it afterwards, obligation runs sideways and upward as ' +
      'well as down, and the boundary of who counts as family is set by relationship rather than ' +
      'by paperwork.',
      'This is much closer to the Scriptural default than the arrangement most of Western ' +
      'Christianity now assumes. Households are baptised. Households are addressed. The letters ' +
      'go to houses, salvation comes to a house, and the whole apparatus of individual private ' +
      'decision that the modern church runs on would have been difficult to explain to anybody ' +
      'in the text.',
      'So a station built on this is not doing demographics. It is programming for the unit it ' +
      'thinks is actually there — which means content aimed at a room containing several ages, ' +
      'rather than at one listener wearing headphones.',
    ],
  },
  {
    slug: 'a-latin-station-sung-in-english',
    kicker: 'Latino heart',
    title: 'Why There Is a Latin Station Sung in English',
    dek: 'It looks like a mistake on the schedule. It is the station for people who live between two languages.',
    image: 'latin-worship',
    author: 'santiago',
    stands: 'The second generation does not need a Spanish station or an English one. It needs the one that knows both are true at once.',
    body: [
      'On paper it is the strangest frequency on the band. Latin Worship, sung in English — which ' +
      'reads either as a compromise or as an error, and prompts the obvious question of who ' +
      'exactly it is meant for.',
      'It is for the second generation, and they are not a rounding error. Millions of people grew ' +
      'up in households where the parents prayed in Spanish and the children answered in English, ' +
      'where the music at home was one thing and the music everywhere else was another, and where ' +
      'both are entirely native rather than one being a dilution of the other.',
      'A Spanish-language station asks them to be more Latino than they are in daily life. A ' +
      'standard English worship station asks them to leave the rhythm, the instrumentation and ' +
      'half of what makes music feel like home at the door. Both are perfectly good stations and ' +
      'neither is describing the actual condition, which is not a halfway point between two ' +
      'cultures but a distinct third thing with its own sound.',
      'That is what this frequency carries. The musical inheritance intact, the language the ' +
      'listener actually thinks in, and no requirement to pick a side in order to be sung to.',
    ],
  },
  {
    slug: 'portuguese-is-not-spanish',
    kicker: 'Latino heart',
    title: 'Portuguese Is Not Spanish, and Brasil Gets Its Own Frequency',
    dek: 'A distinction constantly flattened by people who have never had to listen closely.',
    image: 'brasil-inspire-portugues',
    author: 'santiago',
    stands: 'Two hundred million people, an entirely separate musical tradition, and a language routinely treated as a regional accent.',
    body: [
      'The flattening happens everywhere. Latin America is treated as one market with one ' +
      'language and a footnote, and Brazilian material gets folded into a Spanish-language ' +
      'schedule on the grounds that the words look similar written down.',
      'They are separate languages with separate literatures, and mutual intelligibility is much ' +
      'poorer in speech than the page suggests. More to the point for a radio station, the ' +
      'musical traditions are not even close. Brazilian worship carries a rhythmic and harmonic ' +
      'inheritance — bossa, samba, the whole line of Brazilian popular music and its unusually ' +
      'sophisticated relationship to harmony — that simply does not appear in Spanish-language ' +
      'worship from anywhere else.',
      'It also has one of the largest and most productive evangelical populations in the world, ' +
      'writing an enormous quantity of its own material rather than importing it. Whatever else is ' +
      'true, this is not a territory that needs somebody else’s catalogue translated into it.',
      'So Brasil holds its own number on this dial, with its own host, its own catalogue and its ' +
      'own schedule. The alternative was to treat two hundred million people as an accent, which ' +
      'is what usually happens and is not defensible once it is said out loud.',
    ],
  },
  {
    slug: 'two-generations-one-kitchen',
    kicker: 'Latino heart',
    title: 'Two Generations, One Kitchen, Different Languages',
    dek: 'The everyday negotiation of an immigrant household, and what a radio station can do about it.',
    image: 'jubilee-prayers-spanish',
    author: 'santiago',
    stands: 'The parents are most themselves in one language and the children in another, and nobody chose this.',
    body: [
      'The arrangement is so common in immigrant families that it barely gets remarked on. A ' +
      'parent speaks in one language, a child answers in another, everybody understands ' +
      'everybody, and the conversation proceeds without difficulty for years.',
      'It works until it has to carry weight. Comfort, correction, apology and prayer are the ' +
      'places it strains, because those are exactly the registers a person only has in the ' +
      'language they were formed in. A parent consoling a grown child in their second language ' +
      'will often sound stiffer and more distant than they are; a child explaining something ' +
      'painful in their parents’ language will sound younger and less competent than they are. ' +
      'Both misread the other, and both are being misled by fluency rather than by feeling.',
      'What helps, unglamorously, is shared material. A song both generations know, a prayer said ' +
      'the same way every time, a phrase from the radio that is in the house often enough to be ' +
      'available to both — things that do not have to be translated in the moment because they are ' +
      'already common property.',
      'That is a modest function for a station and a real one. It puts words in the room that ' +
      'belong to everybody in it, which is precisely what the household is short of.',
    ],
  },
  {
    slug: 'praying-out-loud-as-a-habit',
    kicker: 'Latino heart',
    title: 'Praying Out Loud Is a Cultural Habit Worth Keeping',
    dek: 'Some traditions pray audibly in front of each other as a matter of course. That is not a small inheritance.',
    image: 'jubilee-prayers-portuguese',
    author: 'santiago',
    stands: 'A child who has heard adults pray out loud, badly, at the kitchen table, has been given something no curriculum supplies.',
    body: [
      'There are cultures in which prayer is a private act performed silently, and cultures in ' +
      'which it is ordinary to hear it out loud — a grandmother praying over a meal at length, ' +
      'somebody praying at a doorway before a journey, a whole room praying simultaneously and ' +
      'audibly and not in unison.',
      'The audible habit is often treated as informal, or as insufficiently reverent, or simply as ' +
      'noise by people from the other tradition. It is worth defending, and the argument is ' +
      'practical rather than sentimental.',
      'Almost nobody learns to pray from instruction. They learn it by overhearing, the way ' +
      'children learn any speech register — by being present while competent speakers do it ' +
      'imperfectly. A child raised where prayer is silent has been told that adults pray. A child ' +
      'raised where it is audible has heard what it sounds like, including the hesitations, the ' +
      'repetitions and the parts where the adult clearly did not know what to say and kept going.',
      'That last detail may be the whole inheritance. Hearing somebody pray badly and continue ' +
      'teaches that fluency was never the requirement, which is a lesson that almost nothing else ' +
      'manages to deliver.',
    ],
  },
  {
    slug: 'focus-is-a-discipline',
    kicker: 'Latino heart',
    title: 'Focus Is a Spiritual Discipline with a Soundtrack',
    dek: 'Attention is the raw material of prayer, work and love, and it is the thing most under attack.',
    image: 'inspire-focus',
    author: 'santiago',
    stands: 'You cannot pray, work or love anybody with an attention span that has been trained to turn over every nine seconds.',
    body: [
      'Focus gets filed as a productivity concern, which puts it in the wrong department. ' +
      'Attention is the raw material of every serious thing a person does. Prayer is sustained ' +
      'attention directed at God. Love, in practice, is sustained attention directed at a person. ' +
      'Work worth doing requires holding one thing in mind long enough for it to yield.',
      'All three degrade together, and they degrade the same way — not through a decision to stop ' +
      'caring but through the gradual training of the mind to expect a new stimulus every few ' +
      'seconds. That training is thorough, it is delivered several hours a day, and it does not ' +
      'stay in the phone. The person who cannot read a page also cannot sit in silence, and ' +
      'discovers it the first time they try to pray for more than four minutes.',
      'The traditional disciplines were largely attention exercises before they were anything ' +
      'else. Fixed hours, repetition, long readings, silence — all of them are training the same ' +
      'muscle, and all of them look pointless if you assume the goal was the content rather than ' +
      'the capacity.',
      'Instrumental music is a poor substitute for silence and a good substitute for the ' +
      'alternative. It occupies the part of the mind that goes looking for stimulus, and leaves ' +
      'the part that does the work alone.',
    ],
  },
  {
    slug: 'wellness-without-the-religion',
    kicker: 'Latino heart',
    title: 'Wellness Without the Religion of Wellness',
    dek: 'Rest, food, sleep and the body are genuinely spiritual subjects. The industry around them is a competing faith.',
    image: 'inspire-wellness',
    author: 'santiago',
    stands: 'One of these says look after the body because it is not yours. The other says perfect the body because it is all there is.',
    body: [
      'The Church has an unhelpful history with the body. For long stretches it has treated ' +
      'physical life as the lower floor — tolerated, disciplined, occasionally despised — which ' +
      'is closer to Greek philosophy than to a text that spends chapters on food, rest, skin ' +
      'conditions and a weekly command to stop working.',
      'Into that vacuum walked the wellness industry, which took the abandoned subject seriously ' +
      'and built something with the full apparatus of a religion around it: a moral vocabulary of ' +
      'clean and toxic, disciplines, guilt, confession, a promise of transformation, and the ' +
      'implication that a person who is unwell has failed at something.',
      'That last move is the one worth naming. Under wellness, illness becomes a verdict, ageing ' +
      'becomes a defeat, and the body’s eventual failure — which is universal and scheduled — has ' +
      'no meaning available to it except as a loss of control.',
      'The older account holds both halves without either. The body genuinely matters, is worth ' +
      'looking after, and is not the point; rest is commanded rather than earned; and its decline ' +
      'is not a personal failure. That is a more generous frame than either the disdainful one or ' +
      'the anxious one, and it is what this frequency is programmed inside.',
    ],
  },
];

const HM_VOICES_5 = [
  /* ---- Tahoma Inspire — Native voice and healing ----------------------- */
  {
    slug: 'arrived-in-the-wrong-hands',
    kicker: 'Native voice and healing',
    title: 'The Gospel Arrived Here in the Wrong Hands. It Is Still the Gospel.',
    dek: 'Both halves of that sentence are true, and most people are only willing to say one of them.',
    image: 'island-hallelujah',
    author: 'tahoma',
    stands: 'The message was carried by people who also carried a great deal else. Sorting one from the other is the work of several generations, and it is not optional.',
    body: [
      'There is a conversation that most Christian broadcasting will not have, and it is the one ' +
      'that has to happen first with a great many Native and Indigenous listeners. The faith did ' +
      'not arrive here neutrally. It came bundled with land loss, with schools that were not ' +
      'schools, with languages punished out of children, and with the confident assumption that ' +
      'becoming Christian meant ceasing to be what you were.',
      'Two responses are common and both are evasions. The first says that was regrettable, it was ' +
      'long ago, and we should move forward — which asks the injured party to do all the moving. ' +
      'The second concludes that the message is inseparable from its carriers and must be set ' +
      'down with them, which hands the people who did the damage a final and permanent victory ' +
      'over what they were nominally preaching.',
      'The harder position is to hold both. What was done was done, at scale, by people who quoted ' +
      'this book while doing it. And the book they were quoting is the one in which God ' +
      'consistently sides with the dispossessed against exactly that kind of power — which means ' +
      'the strongest available indictment of what happened comes from inside the text rather than ' +
      'from outside it.',
      'That is the ground these stations are built on. Not an apology offered in place of ' +
      'programming, and not a silence pretending the question was never asked.',
    ],
  },
  {
    slug: 'sobriety-is-a-daily-frequency',
    kicker: 'Native voice and healing',
    title: 'Sobriety Is a Daily Frequency, Not a Testimony',
    dek: 'The story gets told once. The thing itself has to be done again tomorrow, and the day after.',
    image: 'freedom-steps',
    author: 'tahoma',
    stands: 'A testimony has an ending. Recovery does not, and the mismatch between those two shapes does real damage.',
    body: [
      'Church culture loves a recovery testimony, and there is a reason: it has a shape. Bondage, ' +
      'intervention, freedom. It is told from a platform, in the past tense, and it ends.',
      'The thing being described does not end. It is a daily practice with no terminal point, ' +
      'conducted mostly in private, in which the decisive events are unremarkable — a Tuesday ' +
      'afternoon, a familiar route not taken, a phone call made before rather than after. Nobody ' +
      'is going to ask you to come and speak about a Tuesday afternoon.',
      'That mismatch does two kinds of harm. It teaches the person in recovery that their real ' +
      'life is the uninteresting part, and it teaches everybody else that the problem is solved ' +
      'once the story has been told — which is exactly when the support tends to withdraw, because ' +
      'the narrative has reached its ending and everybody claps.',
      'A station cannot hold anybody accountable and does not pretend to. What it can do is be ' +
      'present at the same time every day, in the ordinary hours where the actual work happens, ' +
      'and treat the flat Tuesday as the main event rather than as the gap between testimonies.',
    ],
  },
  {
    slug: 'men-with-nowhere-to-be-honest',
    kicker: 'Native voice and healing',
    title: 'For Men with Nowhere to Be Honest',
    dek: 'Not a shortage of friends. A shortage of rooms in which the true answer is sayable.',
    image: 'pure-heart-brothers',
    author: 'tahoma',
    stands: 'Most men have people to talk to and nowhere to say the actual sentence. Those are different shortages and only one of them gets discussed.',
    body: [
      'The standard diagnosis is loneliness, and the standard prescription is more connection — a ' +
      'group, a men’s breakfast, somebody to check in. It is well meant and it frequently misses, ' +
      'because a great many of the men in question are not short of company.',
      'What they are short of is a room where the true answer is available. There is a difference ' +
      'between having people to talk to and having somewhere to say the actual sentence: that the ' +
      'work is going badly and has been for a year, that the marriage is quieter than anybody ' +
      'knows, that the thing he stopped doing has started again, that he does not know what he is ' +
      'for since the children left.',
      'Most of those sentences are unsayable in most settings, and the barrier is not shame in the ' +
      'abstract. It is a well-founded expectation about what would happen next — that it would be ' +
      'handled, or fixed, or repeated, or would change how he is looked at in a room he has to ' +
      'keep returning to.',
      'A frequency is not a substitute for that room. What it can do is get the sentence said out ' +
      'loud by somebody else first, at ordinary volume, without drama, so that a man hearing it ' +
      'learns the thing he most needs to know — that it is a sentence other people have, and that ' +
      'saying it did not end anybody.',
    ],
  },
  {
    slug: 'anxious-no-more-is-a-command',
    kicker: 'Native voice and healing',
    title: 'Anxious No More Is a Command, Which Is the Problem with It',
    dek: 'Taking apart the name of one of our own stations, because the misreading is doing harm.',
    image: 'anxious-no-more',
    author: 'tahoma',
    stands: 'Be anxious for nothing is not an instruction to feel differently. It is an instruction about where to put the thing.',
    body: [
      'Be anxious for nothing. It is one of the most quoted lines in the New Testament and one of ' +
      'the most damaging when it is quoted alone, because in English it lands as an instruction ' +
      'about how to feel — and nobody has ever successfully followed an instruction about how to ' +
      'feel.',
      'What it produces instead is a second problem stacked on the first. The person is anxious, ' +
      'and now they are also failing at a command, and the failure is evidence of the spiritual ' +
      'deficiency they already suspected. Anyone who has been handed this verse during a genuinely ' +
      'bad stretch knows precisely how it lands.',
      'Read the whole sentence and it is doing something different. Be anxious for nothing, but in ' +
      'everything, by prayer and supplication, let your requests be made known. The instruction is ' +
      'not to stop having the feeling. It is about where to take it — a transfer, an action ' +
      'available to somebody in the middle of the state rather than a condition for getting out of ' +
      'it. And what is promised at the end is not the absence of anxiety but a peace that is ' +
      'explicitly described as making no sense, which is a strange thing to promise unless the ' +
      'circumstances producing the anxiety are expected to still be there.',
      'The station is named after the promise, not the command. That distinction is the entire ' +
      'remit.',
    ],
  },
  {
    slug: 'be-still-is-the-hardest-instruction',
    kicker: 'Native voice and healing',
    title: 'Be Still Is the Hardest Instruction in Scripture',
    dek: 'Harder than the ethical commands, because there is nothing to do in order to comply.',
    image: 'shalom-be-still',
    author: 'tahoma',
    stands: 'Every other command can be obeyed by doing something. This one is disobeyed by doing anything.',
    body: [
      'The difficult commands are usually assumed to be the ethical ones — forgive, give, tell the ' +
      'truth when it costs. Those are genuinely hard and they share one enormous advantage: there ' +
      'is an action available. Something can be done, immediately, and the doing constitutes ' +
      'obedience.',
      'Be still has no such action. It is the only instruction that is disobeyed by doing anything ' +
      'at all, which puts a person with any competence at a disadvantage. Everything that has ever ' +
      'worked for them — effort, planning, pushing through — is precisely what is prohibited.',
      'The Hebrew makes it worse rather than better. The word carries the sense of letting go, ' +
      'dropping, ceasing to grip — closer to release than to quiet. And the setting of the psalm ' +
      'is not a retreat. It is upheaval: nations in uproar, mountains falling into the sea. The ' +
      'stillness is commanded inside the crisis, not after it has been resolved.',
      'Which is why almost every tradition eventually builds a structure for it. Left to ' +
      'themselves people do not become still, they become busy in a quieter way. What works is ' +
      'usually external — a fixed time, a form, a set length, something that runs whether or not ' +
      'the person is in the mood. A scheduled frequency is a crude version of that, and crude ' +
      'versions of this have a better record than good intentions.',
    ],
  },
  {
    slug: 'the-rhythm-that-outlasted-the-hymnbook',
    kicker: 'Native voice and healing',
    title: 'The Rhythm That Outlasted the Hymnbook',
    dek: 'What happened to island and Native worship after the missionaries stopped supervising it.',
    image: 'inspire-celebrations',
    author: 'tahoma',
    stands: 'The hymn was imposed, learned, kept, and then quietly rebuilt into something the people who imposed it would not recognise.',
    body: [
      'The mission-era arrangement was straightforward. The hymnbook came in, the local music was ' +
      'discouraged or forbidden, and congregations were taught European tunes in four parts, often ' +
      'in translation, often alongside instructions about clothing and dancing.',
      'What happened afterwards is more interesting than either the triumphal version or the ' +
      'tragic one. The hymns were not rejected when supervision ended. They had been sung for ' +
      'generations by then and they belonged to people’s grandparents, which makes them ' +
      'inheritance regardless of how they arrived. So they were kept — and rebuilt. Harmonised ' +
      'differently, taken at different tempi, given back their rhythm, and folded into forms that ' +
      'the original compilers would find difficult to identify.',
      'Anyone who has heard Pacific or Caribbean congregational singing has heard the result: a ' +
      'nineteenth-century European tune that has been thoroughly and permanently repossessed.',
      'That is a more accurate picture of how tradition actually moves than either purity story ' +
      'allows. Nothing was preserved untouched and nothing was simply replaced. What survived ' +
      'survived by being taken over, and this frequency is the continuation of that rather than a ' +
      'reconstruction of what came before it.',
    ],
  },
  {
    slug: 'stories-keep-what-is-not-written',
    kicker: 'Native voice and healing',
    title: 'Stories Are How a People Keep What Cannot Be Written Down',
    dek: 'Oral tradition is not a primitive stage before literacy. It is a different technology with different strengths.',
    image: 'inspire-stories',
    author: 'tahoma',
    stands: 'A written text survives without anybody caring about it. A spoken one only survives inside a community that is still telling it, which is a stricter test.',
    body: [
      'The assumption underneath most Western thinking about this is that oral tradition is what ' +
      'people had before writing — a lossy, approximate stage that literacy replaces and improves ' +
      'on.',
      'The comparison does not survive much scrutiny. Oral traditions are frequently more accurate ' +
      'over long periods than the assumption predicts, because they are structured for it: metre, ' +
      'repetition, formula and a community of checkers who will interrupt a teller who gets it ' +
      'wrong. And crucially, a story that is told carries information a text cannot — who is ' +
      'entitled to tell it, to whom, at what time of year, and what the room is meant to do while ' +
      'it is being told.',
      'The two technologies also fail differently. A written text survives indifference; it sits ' +
      'on a shelf for two hundred years and is still there when somebody wants it. A spoken one ' +
      'only survives inside a community still telling it, which is a far stricter test — and ' +
      'exactly why deliberately breaking the chain of telling was such an effective way to destroy ' +
      'something.',
      'Scripture spent a long time as both, and shows it. Large parts of the text are visibly ' +
      'shaped for the mouth rather than the page, and read better aloud than they do silently. ' +
      'This station takes that seriously rather than treating it as a curiosity.',
    ],
  },

  /* ---- Amir Inspire — South Asian soul --------------------------------- */
  {
    slug: 'the-church-already-there',
    kicker: 'South Asian soul',
    title: 'The Church That Was Already There When the Missionaries Arrived',
    dek: 'Christianity reached India and Central Asia long before it reached most of Europe.',
    image: 'ancient-paths',
    author: 'amir',
    stands: 'The nineteenth-century missionaries who arrived in Kerala met congregations whose liturgy was older than their own countries’ conversion.',
    body: [
      'The standard mental map has the faith beginning in Jerusalem, moving west into Europe, ' +
      'maturing there for a millennium and a half, and then being carried outward to everybody ' +
      'else in the modern period. It is the map underneath most mission history and most Christian ' +
      'media, and it is missing an entire direction.',
      'The faith moved east at the same time and at least as fast. The Church of the East ran ' +
      'along the trade routes through Persia and Central Asia and had reached China by the seventh ' +
      'century, which is documented on a stone that is still standing. In Kerala there are ' +
      'communities whose tradition places their founding in the first century and whose liturgy ' +
      'is in a dialect of Aramaic.',
      'Which produces one of the more awkward encounters in mission history. European missionaries ' +
      'arriving in South India in the modern period did not find an unevangelised territory. They ' +
      'found churches with a continuous liturgy older than the Christianisation of the countries ' +
      'the missionaries had come from, and the meeting frequently went badly, because the visitors ' +
      'had no category for a Christianity that had not come through them.',
      'This is not a footnote for a listener in South Asia. It is the difference between being ' +
      'told your faith is an import and knowing it is an inheritance.',
    ],
  },
  {
    slug: 'ancient-paths-people-who-looked-like-me',
    kicker: 'South Asian soul',
    title: 'The Ancient Paths Were Walked by People Who Looked Like Me',
    dek: 'Ask for the old paths, says Jeremiah. It is worth checking whose old paths we mean.',
    image: 'inspire-crown-arabic',
    author: 'amir',
    stands: 'Everything in the book happened in Asia, to Asians, in Asian languages, in a climate most Western church art has never depicted.',
    body: [
      'Stand in the old ways and see, and ask for the ancient paths. The line gets used constantly ' +
      'as an argument for tradition against novelty, and the tradition being defended is almost ' +
      'always a recent European one — a hymnody a century and a half old, an order of service, an ' +
      'architecture.',
      'Go back far enough and the ancient paths are not European at all. Every event in the book ' +
      'happened in Asia, to Asians, in Asian languages, in a climate and a set of social ' +
      'arrangements that a listener in Lahore or Chennai will find considerably more legible than ' +
      'a listener in northern Europe does. Bride price, honour and shame, extended households, ' +
      'patronage, hospitality as obligation, dust and heat and shade: these are not exotic details ' +
      'requiring explanation. They are how a great deal of the world still works.',
      'Which means the recovery project runs in an unexpected direction. Reading Scripture through ' +
      'South Asian social categories is not a contextualisation of a Western text for a local ' +
      'audience. It is frequently a return to the assumptions the text was written inside, which ' +
      'the Western reading had to work around.',
      'That is the remit here. Not translating something foreign into local terms, but noticing ' +
      'how much of it was never foreign.',
    ],
  },
  {
    slug: 'arabic-was-a-language-of-worship',
    kicker: 'South Asian soul',
    title: 'Arabic Was a Language of Worship Long Before It Was Anything Else',
    dek: 'There were Arabic-speaking Christians before there was anything else for the language to be famous for.',
    image: 'jubilee-prayers-arabic',
    author: 'amir',
    stands: 'Arab Christians were praying in Arabic centuries before the seventh century, and have never stopped.',
    body: [
      'For most Western listeners Arabic arrives pre-loaded with a single association, and the ' +
      'idea of Christian worship in it registers as a novelty or as a missionary strategy. It is ' +
      'neither. Arabic-speaking Christians predate the seventh century by a long way, and there ' +
      'has been continuous Christian worship in the language ever since without a break.',
      'Arab Christians are named at Pentecost, in the list of who heard. There were Arab bishops ' +
      'at early councils. Communities across the Levant, Mesopotamia and the Gulf have been ' +
      'praying in Arabic for the whole of the intervening period, through every political ' +
      'arrangement the region has had, and are praying in it today.',
      'One consequence is worth stating plainly for listeners who find it strange: Arabic-speaking ' +
      'Christians use the ordinary Arabic word for God, because it is the ordinary Arabic word for ' +
      'God and always has been. It appears in Arabic Bibles and in Arabic liturgy, and Arab ' +
      'Christians have never needed anybody’s permission to say it.',
      'So this frequency is not an outreach project in a difficult language. It is a station for a ' +
      'church that has been there the entire time, and often at considerable cost.',
    ],
  },
  {
    slug: 'the-bengali-gap-was-indefensible',
    kicker: 'South Asian soul',
    title: 'The Bengali Station Exists Because the Gap Was Indefensible',
    dek: 'One of the most spoken languages on earth, and almost nothing on the air in it.',
    image: 'bengal-inspire-bangla',
    author: 'amir',
    stands: 'Nobody decided Bengali did not matter. It simply never cleared a commercial threshold, which produced the same result.',
    body: [
      'Bengali is among the most spoken languages in the world. It has a literary tradition of the ' +
      'first rank, a Nobel laureate poet whose songs are still sung daily by millions, and a ' +
      'musical culture in which words and melody are unusually tightly bound.',
      'Christian radio in it is close to absent. Not suppressed — absent, which is a different and ' +
      'in some ways more embarrassing condition. Nobody ever decided that Bengali speakers did not ' +
      'warrant a station. It simply never cleared a commercial threshold, and the result is ' +
      'indistinguishable from a decision.',
      'That is the pattern this band was built to interrupt, and it is worth being specific about ' +
      'why the gap persisted. Producing a catalogue in a language requires either a market that ' +
      'can fund it or a donor base that cares about it, and Bengali-speaking Christians are a ' +
      'minority within a population that is itself not a wealthy media market. Every step of that ' +
      'chain is about money and none of it is about need.',
      'Remove the licensing cost and collapse the production cost and the question changes ' +
      'entirely. It stops being can this be afforded and becomes why on earth is this not being ' +
      'done — at which point the gap is simply indefensible, and the frequency gets assigned.',
    ],
  },
  {
    slug: 'hindi-worship-is-not-western-worship',
    kicker: 'South Asian soul',
    title: 'Hindi Worship Is Not Western Worship with Different Words',
    dek: 'A different scale system, a different relationship to repetition, and a different idea of what a song is for.',
    image: 'inspire-india-hindi',
    author: 'amir',
    stands: 'Set a Hindi text over a Western chord progression and you have not localised anything. You have made a translation with a costume on.',
    body: [
      'The cheap approach to Hindi worship is to take the Western song form — verse, chorus, ' +
      'bridge, four chords, a fixed harmonic destination — and put Hindi words on it. It is ' +
      'quick, it is singable by anybody who has heard Western pop, and it is what a great deal of ' +
      'the available material sounds like.',
      'What it leaves out is most of the tradition. Indian classical and devotional music is ' +
      'organised around raga rather than around chord progression: melodic frameworks with their ' +
      'own rules, their own emotional associations and, in the classical system, their own times ' +
      'of day. Rhythm is organised in cycles that do not map onto four-four. And the devotional ' +
      'forms — bhajan, kirtan — are built on extended repetition that is doing something specific ' +
      'rather than filling time.',
      'That last point is where the misunderstanding bites. A Western listener hearing thirty ' +
      'repetitions of a line often reads it as a lack of material. In the devotional tradition the ' +
      'repetition is the mechanism, and the thing it produces cannot be got at in three verses ' +
      'and a bridge no matter how good they are.',
      'So the catalogue behind this station was written inside those forms rather than translated ' +
      'into them, which is the whole reason it gets its own frequency instead of a slot.',
    ],
  },
  {
    slug: 'praying-in-a-language-your-government',
    kicker: 'South Asian soul',
    title: 'Praying in a Language Your Government Would Rather You Didn’t',
    dek: 'For listeners where this is not a hobby, and where the volume knob is a real decision.',
    image: 'jubilee-prayers-hindi',
    author: 'amir',
    stands: 'A great deal of the New Testament was written to people for whom this was the ordinary condition, and it shows in what the text bothers to say.',
    body: [
      'A large share of the world’s Christians practise under some degree of legal or social ' +
      'pressure. It runs from paperwork and quiet employment discrimination through to ' +
      'anti-conversion statutes and worse, and for the people inside it the practical questions ' +
      'are unglamorous and constant. How loud. Who can see. Which neighbour. Whether the phone is ' +
      'a risk.',
      'Broadcasting into that has to be built differently, and mostly it is not. Material made in ' +
      'comfortable countries assumes an audience that can gather freely, wear the identity ' +
      'publicly, and treat faith as a matter of preference rather than of exposure. Its calls to ' +
      'boldness are written by people for whom boldness costs a conversation.',
      'What a private, on-demand, headphone-sized frequency offers is specific. No building to ' +
      'enter, no register to sign, nothing to carry, nothing on a shelf. It is worship a person ' +
      'can hold without holding anything, and for a considerable number of listeners that is the ' +
      'difference between practising and not.',
      'It is worth remembering that this is the original setting. Most of the New Testament was ' +
      'written to communities in exactly this position, which is why it spends so much time on ' +
      'endurance, on households, on small gatherings, and so little on buildings.',
    ],
  },
  {
    slug: 'what-the-five-fold-actually-is',
    kicker: 'South Asian soul',
    title: 'What the Five-Fold Actually Is, and Why It Is Not a Hierarchy',
    dek: 'A list of functions has been read for a century as an org chart, with predictable results.',
    image: 'apostolic-five-fold',
    author: 'amir',
    stands: 'The passage names five things the church needs done. It does not name five ranks, and it does not put anybody above anybody.',
    body: [
      'Apostles, prophets, evangelists, pastors and teachers. The list is short, it appears once, ' +
      'and it has carried an enormous amount of weight — including a great deal it was not built ' +
      'for.',
      'The most common misuse is to read it as a ranking. Apostle at the top, teacher at the ' +
      'bottom, and a career path in between, with the title functioning as a claim about standing. ' +
      'The text does not support this in any obvious way, and the stated purpose runs against it: ' +
      'these are given for the equipping of the saints for the work of ministry, which makes every ' +
      'one of them a servant function rather than a rank, and makes the congregation the ones ' +
      'doing the work.',
      'The second misuse is subtler and more common in practice. It treats the five as personality ' +
      'types — take the assessment, discover you are a prophet, and organise your self-image ' +
      'around it. That reading turns a description of things the church needs done into a ' +
      'description of what somebody is, and the two are not the same. Function is assigned to a ' +
      'body by need; identity is not.',
      'Read plainly the passage is unremarkable and useful. There are five kinds of work a healthy ' +
      'church requires, most communities are short of at least two, and noticing which two is more ' +
      'productive than working out which one you are.',
    ],
  },
];

const HM_VOICES_6 = [
  /* ---- Elias Inspire — Appalachian repentance -------------------------- */
  {
    slug: 'repentance-is-a-turn',
    kicker: 'Appalachian repentance',
    title: 'Repentance Is Not an Emotion. It Is a Turn.',
    dek: 'The word means to change direction. Feeling bad is optional and frequently a substitute.',
    image: 'deutschland-inspire-deutsch',
    author: 'elias',
    stands: 'You can feel terrible for thirty years and never once turn around. Many people have, and they think it counts.',
    body: [
      'Repentance has been quietly redefined as remorse. Under that reading a person repents by ' +
      'feeling sufficiently bad about a thing — and the sincerity of the feeling becomes the ' +
      'measure, which is unfortunate, because feeling is the one part of the transaction nobody ' +
      'can verify and everybody can generate.',
      'The word does not mean that in either language the text uses. The Hebrew is about turning ' +
      'and physically going back the other way. The Greek is about a change of mind that governs ' +
      'what happens next. Both are directional. Both describe a person who was heading one way ' +
      'and is now heading another, and neither says anything about how they felt while turning.',
      'This is not a technicality. It is possible — common, in fact — to feel dreadful about ' +
      'something for thirty years while continuing to do it, and to experience that ongoing ' +
      'misery as evidence of a tender conscience rather than as evidence that nothing has changed. ' +
      'Remorse is comfortable in exactly this way: it feels like the cost has been paid.',
      'The mountain preaching this station comes out of was blunt about the distinction, and ' +
      'sometimes harsh about it. Its instinct was right. The question is never how sorry you are. ' +
      'It is which way you are now walking.',
    ],
  },
  {
    slug: 'country-never-stopped-being-honest',
    kicker: 'Appalachian repentance',
    title: 'Country Music Never Stopped Being Honest About Sin',
    dek: 'It kept a vocabulary that most Christian music dropped, and it kept it in the first person.',
    image: 'country-gospel',
    author: 'elias',
    stands: 'One of these traditions will sing about a man who has ruined his life and is not sure he will stop. The other one moved on from that some time ago.',
    body: [
      'There is an odd inversion in what the two genres are willing to say. Contemporary worship ' +
      'music has largely stopped singing about specific sin in the first person. There is a great ' +
      'deal of brokenness, which is vague and blameless, and rather less about a particular thing ' +
      'a particular person did on purpose.',
      'Country never gave that up. It will sing, in the first person, about drinking, adultery, ' +
      'walking out on children, prison, and the fact that the singer is not confident he is going ' +
      'to stop. It will do this without resolving it in the last verse, and it will name the ' +
      'specific damage rather than gesturing at a condition.',
      'That is closer to the Psalms than most of what is on Christian radio. The penitential ' +
      'psalms are concrete and personal and occasionally unresolved; they are not about brokenness ' +
      'in general, they are about a man who did a thing and knows exactly what it was.',
      'This is why the country lane on this band is not a stylistic concession to a region. It is ' +
      'carrying a register the rest of the catalogue is thin in — the one where a person can say ' +
      'what they actually did, out loud, without the song having to fix it by the end.',
    ],
  },
  {
    slug: 'two-shortest-prayers',
    kicker: 'Appalachian repentance',
    title: 'The Two Shortest Prayers in Scripture',
    dek: 'Yes and amen. Both are agreements, and both are harder to mean than they look.',
    image: 'yes-and-amen',
    author: 'elias',
    stands: 'Amen is not a full stop. It is a signature, and it commits the person who says it.',
    body: [
      'Amen has been worn down into punctuation. It is the noise that indicates a prayer has ' +
      'finished, said by everybody, meaning approximately nothing.',
      'It started as something considerably stronger. The root carries the sense of firmness and ' +
      'reliability, and the word functions as agreement — a person saying it is not marking the ' +
      'end of somebody else’s speech but adding their name to it. In the older assemblies it was ' +
      'said aloud by the congregation precisely because it was an act of assent, and in ' +
      'Deuteronomy the people say it after each curse is read out, which is a genuinely serious ' +
      'thing to be doing with a word.',
      'Which means saying it after somebody else’s prayer is a small commitment rather than a ' +
      'courtesy. You have just signed. If you were not listening, or would not have prayed that, ' +
      'you have signed anyway.',
      'The yes is the other half. Paul writes that in Christ all the promises are yes, and in him ' +
      'amen — God’s yes and the answering agreement. Two of the shortest words available, doing ' +
      'the work of a signature on both sides, which is why a station named after them is not ' +
      'named after a slogan.',
    ],
  },
  {
    slug: 'raising-arrows-no-applause',
    kicker: 'Appalachian repentance',
    title: 'Raising Arrows Is a Long Job with No Applause',
    dek: 'The metaphor is about release, and about a result you will not be present to see.',
    image: 'raising-arrows',
    author: 'elias',
    stands: 'An arrow is not for keeping. The entire purpose of the work is that the thing leaves your hand.',
    body: [
      'Like arrows in the hand of a warrior, so are the children of one’s youth. It gets quoted ' +
      'warmly, usually about a full house, and the warmth skips the part of the image that is ' +
      'doing the work.',
      'An arrow is made to be released. All the labour goes into something whose entire purpose is ' +
      'to leave, travel a distance you cannot control, and land somewhere you may never see. ' +
      'Nothing about the metaphor suggests keeping them close, and everything about it suggests ' +
      'that the quality of the work shows up long after the work is finished and out of reach.',
      'That is an uncomfortable job description, and it explains a great deal of what goes wrong ' +
      'in earnest households. The temptation is to hold on — to keep the arrow in the quiver where ' +
      'it can be inspected, because releasing it means accepting that the aim was set years ago ' +
      'and can no longer be adjusted.',
      'The consolation on offer is thin and real. You will not get to watch most of it. What you ' +
      'get is the years of drawing the bow, which nobody sees, and a result you will mostly hear ' +
      'about second hand.',
    ],
  },
  {
    slug: 'what-is-given-daily',
    kicker: 'Appalachian repentance',
    title: 'What Is Given Daily Cannot Be Stockpiled',
    dek: 'The manna rotted overnight on purpose, and everybody has tried to store it anyway.',
    image: 'the-hidden-manna',
    author: 'elias',
    stands: 'They were given exactly one day’s worth, and what they hoarded bred worms. The lesson was not about food.',
    body: [
      'The manna arrangement is one of the odder logistical setups in the text. Enough for one ' +
      'day, gathered daily, and anything kept overnight spoiled — with a single exception before ' +
      'the Sabbath, which proves the spoiling was a rule rather than a property of the substance.',
      'It reads as a lesson about trust and it is, but it is a sharper one than the usual telling. ' +
      'They were not being asked to trust that God could provide. They had watched a sea open. ' +
      'They were being asked to live without a reserve — which is a different and much less ' +
      'popular request, because a reserve is what allows a person to stop thinking about the ' +
      'subject.',
      'And they tried anyway. Of course they tried. Anyone would, and the text records that it ' +
      'bred worms, which is the kind of detail that survives because somebody was there.',
      'The pattern holds for most of what actually sustains a person. Prayer does not accumulate ' +
      'into a balance that covers a dry month. Neither does forgiveness, or attention, or the ' +
      'energy to be decent to your family. All of it is issued daily, none of it stores, and the ' +
      'arrangement is deliberate rather than a design flaw.',
    ],
  },
  {
    slug: 'churches-that-sang-under-surveillance',
    kicker: 'Appalachian repentance',
    title: 'The Churches That Sang Under Surveillance',
    dek: 'Romanian praise carries a memory of what it cost, and the music is different because of it.',
    image: 'jubilee-praise-romana',
    author: 'elias',
    stands: 'A congregation that knew an informer was in the room learned to mean every word, because those were the words being reported.',
    body: [
      'Romanian evangelical churches spent decades under a state that watched them closely. ' +
      'Congregations were infiltrated, pastors were pressured and worse, buildings were demolished ' +
      'on administrative pretexts, and everybody in the room understood that some of what was said ' +
      'would be written down afterwards by somebody sitting in it.',
      'That does something to a church’s music that is audible afterwards. It removes the ' +
      'incidental. Nobody sings a line they are indifferent to when the line is going into a file, ' +
      'and a repertoire under those conditions gets sifted hard — what survives is what people ' +
      'were prepared to be reported for.',
      'It also changes what the singing is for. In a congregation that expects to be watched, ' +
      'singing together is not a warm-up before the teaching. It is the one thing the room does ' +
      'with one voice, and it functions as mutual proof that everybody is still here and still ' +
      'says so.',
      'Much of that repertoire is still sung, by people who remember the period and by ' +
      'grandchildren who do not. Putting it on a frequency is not a heritage exercise. It is ' +
      'keeping the memory of what the words cost attached to the words, which is the only thing ' +
      'that stops them becoming ordinary again.',
    ],
  },
  {
    slug: 'purpose-found-is-usually-assigned',
    kicker: 'Appalachian repentance',
    title: 'Purpose Found Is Usually Purpose Assigned',
    dek: 'The search is conducted inward. Almost every case in the text runs the other way.',
    image: 'purpose-found',
    author: 'elias',
    stands: 'Almost nobody in Scripture discovers their purpose. It is handed to them, usually while they are busy with something else, and usually unwelcome.',
    body: [
      'The modern version of the question is introspective. What am I passionate about, what am I ' +
      'good at, what would I do if money were no object — and somewhere at the intersection of ' +
      'those the answer is meant to be found. It is a search, conducted inward, and the person ' +
      'searching is the one who decides when it has succeeded.',
      'Almost nothing in Scripture works this way. Moses is minding sheep and does not want the ' +
      'job. Gideon is threshing wheat in a winepress and argues. Amos is explicit that he was no ' +
      'prophet and no prophet’s son, he was a herdsman, and he was taken from following the flock. ' +
      'Jonah receives a very clear assignment and sails in the opposite direction.',
      'In each case the purpose is assigned rather than discovered, arrives while the person is ' +
      'occupied with something ordinary, and is frequently unwelcome. The consistent feature is ' +
      'not enthusiasm. It is that somebody else decided.',
      'That is worse news for the search and better news for the searcher. It means a person can ' +
      'stop excavating themselves for a calling they were never going to find in there, and can ' +
      'get on with what is actually in front of them — which, in every one of those accounts, is ' +
      'precisely where the assignment turned up.',
    ],
  },

  /* ---- Eliana Inspire — folk wisdom, a sister voice --------------------- */
  {
    slug: 'strong-and-sober-are-different',
    kicker: 'Folk wisdom',
    title: 'Strong and Sober Are Two Different Achievements',
    dek: 'Stopping is one job. Becoming someone who does not need to start is another, and it takes much longer.',
    image: 'strong-sober',
    author: 'eliana',
    stands: 'Sobriety is a state you can hold by force. Strength is what means you no longer have to.',
    body: [
      'The first achievement is stopping, and it is enormous. It is also, on its own, a holding ' +
      'action — a state maintained by effort, day after day, against a pull that has not gone ' +
      'anywhere. People sustain that for years, and it is genuine, and it is exhausting in a way ' +
      'that is hard to describe to anybody who has not done it.',
      'The second is different work. It is becoming a person for whom the thing is no longer the ' +
      'obvious answer to a bad evening — which requires the bad evening to have somewhere else to ' +
      'go. Somewhere to be, someone to ring, something to do with the hands, a reason to be ' +
      'somewhere at eight in the morning. None of that is about the substance at all.',
      'Conflating the two does damage in both directions. Somebody white-knuckling it for a decade ' +
      'is told they are fine because they have not relapsed, and the fact that it is still costing ' +
      'them everything they have goes unnoticed. And somebody who genuinely has been rebuilt is ' +
      'told to stay vigilant forever, in language that assumes they are always eight hours from ' +
      'the edge.',
      'The station is named for both because both are real and neither is the other. Stopping is ' +
      'the entry requirement. What comes after is the actual subject.',
    ],
  },
  {
    slug: 'grief-walked-not-solved',
    kicker: 'Folk wisdom',
    title: 'Grief Walked, Not Grief Solved',
    dek: 'The station name is the thesis. Nothing here is going to fix it, and that is the offer.',
    image: 'grief-walked',
    author: 'eliana',
    stands: 'Almost everything said to a grieving person is an attempt to make the sentence stop. Walking alongside is the one response that does not.',
    body: [
      'Grief attracts solutions. Stages that suggest an itinerary. Reasons offered on God’s ' +
      'behalf. Reassurances about where the person is now. Practical suggestions, delivered early, ' +
      'about what might help.',
      'Almost all of it is an attempt to make the sentence stop, and the grieving person can tell. ' +
      'What is being said is: this is unbearable to be near, please move to a stage where I can ' +
      'talk to you normally. It is rarely conscious and it is nearly always audible.',
      'The alternative is not silence and it is not wisdom. It is company — which is what Job’s ' +
      'friends supply for exactly seven days, and it is the only part of that book where anybody ' +
      'gets it right. They sat with him and said nothing, because they saw that his grief was very ' +
      'great. Everything that goes wrong afterwards begins the moment they start explaining.',
      'A station cannot sit with anybody. What it can do is be a voice that is not trying to move ' +
      'the listener along — that assumes the loss is permanent, does not schedule a recovery, and ' +
      'keeps turning up at the same time regardless of whether the person is any better. That is ' +
      'a small imitation of company and it is better than an explanation.',
    ],
  },
  {
    slug: 'stillwater-is-not-background-music',
    kicker: 'Folk wisdom',
    title: 'Stillwater Is Not Background Music',
    dek: 'Quiet music that is doing something is not the same as quiet music that is filling a gap.',
    image: 'stillwater',
    author: 'eliana',
    stands: 'Ambient music is designed not to be noticed. This is designed to be sat with, which is a different brief entirely.',
    body: [
      'There is an enormous amount of quiet instrumental music available and most of it is ' +
      'engineered to be ignored. That is not a criticism — it is the actual brief. Functional ' +
      'music is designed to occupy a space without attracting attention, and the highest ' +
      'compliment it can receive is that nobody noticed it was on.',
      'The difficulty comes when devotional music is made to the same specification. What results ' +
      'sounds appropriate, causes no friction, and asks nothing — which means it also gives ' +
      'nothing, and a person can leave it running for an hour and arrive at the end in exactly ' +
      'the condition they started.',
      'Music that is meant to be sat with is built differently. It has somewhere to go, it takes ' +
      'its time getting there, and it will occasionally do something the listener has to notice. ' +
      'It rewards attention rather than deflecting it, which also means it does not work as ' +
      'wallpaper and is not trying to.',
      'The name is from the psalm, and the psalm is worth reading closely on this point. He ' +
      'leadeth me beside the still waters, he restoreth my soul. Restoration is an action ' +
      'performed on somebody, not an atmosphere they are left in.',
    ],
  },
  {
    slug: 'friendship-is-a-means-of-grace',
    kicker: 'Folk wisdom',
    title: 'Friendship Is the Least Discussed Means of Grace',
    dek: 'Prayer, Scripture, sacrament, and then a category the Church talks about almost never.',
    image: 'walking-together',
    author: 'eliana',
    stands: 'Ask what sustained somebody through the worst decade of their life and you will very rarely be told about a discipline.',
    body: [
      'The classic list is well covered. Prayer, the reading of Scripture, the sacraments, ' +
      'fasting, giving — the practices through which grace is understood to reach a person, all ' +
      'taught, all with a literature.',
      'Then ask anybody what actually got them through the worst decade of their life and see what ' +
      'comes back. It is almost never a discipline. It is a name. One person who kept turning up, ' +
      'who knew the whole situation without needing it re-explained, and whose continued presence ' +
      'was the argument against the conclusion they were drifting toward.',
      'The Church is oddly quiet about this. Friendship is treated as a social good rather than a ' +
      'theological one, discussed in terms of accountability or fellowship — both of which are ' +
      'functional words that describe something narrower and more official than what people ' +
      'actually mean.',
      'Scripture is less shy. David and Jonathan gets a great deal of space for a relationship ' +
      'with no institutional function. Ruth’s speech is to a mother-in-law. Paul is constantly ' +
      'naming people, and the endings of his letters — usually skipped — are lists of individuals ' +
      'who mattered to him personally. It is difficult to read the text as a whole and conclude ' +
      'this is peripheral.',
    ],
  },
  {
    slug: 'japans-tiny-church-old-martyrs',
    kicker: 'Folk wisdom',
    title: 'Japan’s Church Is Tiny and Its Martyrs Are Four Hundred Years Old',
    dek: 'One of the smallest Christian populations in the developed world, and one of the most extraordinary histories.',
    image: 'japan-inspire-nihongo',
    author: 'eliana',
    stands: 'For roughly two centuries there were no priests, no Bibles and no buildings, and when the doors finally opened the faith was still there.',
    body: [
      'Christianity in Japan today is around one per cent of the population, which is among the ' +
      'lowest figures anywhere in the developed world and is usually where the conversation stops. ' +
      'The history behind that number is one of the most remarkable in the whole of church ' +
      'history and is barely known outside the country.',
      'The faith arrived in the sixteenth century and grew quickly, and then the persecution began ' +
      'in earnest. Twenty-six Christians were executed at Nagasaki in 1597. What followed was ' +
      'systematic: expulsion, executions, a requirement to publicly renounce, and eventually ' +
      'closure of the country almost entirely.',
      'What is extraordinary is what happened next. Communities went underground and stayed there ' +
      'for roughly seven generations — no priests, no Bibles, no buildings, nothing that could be ' +
      'found in a search. They kept baptism, they kept prayers passed down orally until the words ' +
      'were half-remembered, and they kept the calendar. When Japan reopened in the nineteenth ' +
      'century and a church was built at Nagasaki, a group of local people came to it and told the ' +
      'priest that their hearts were the same as his.',
      'That is the inheritance behind a station that will never have a large audience. It is worth ' +
      'a frequency on those grounds alone.',
    ],
  },
  {
    slug: 'tagalog-travels-with-those-who-leave',
    kicker: 'Folk wisdom',
    title: 'Tagalog Worship Travels with the People Who Leave',
    dek: 'A diaspora scattered across every time zone, mostly working, mostly alone on the significant days.',
    image: 'pilipinas-inspire-tagalog',
    author: 'eliana',
    stands: 'Filipino workers are in nearly every country on earth, and a great many of them spend Christmas on somebody else’s schedule.',
    body: [
      'There are Filipino workers in almost every country in the world, and the pattern is ' +
      'consistent wherever they are: employed in care, in shipping, in hospitals and in ' +
      'households, frequently on contracts that separate them from their own families for years, ' +
      'and sending money home that a whole national economy is built on.',
      'What that produces is a diaspora that is simultaneously enormous and dispersed. Not a ' +
      'neighbourhood you could point at, but individuals, in every time zone, often the only ' +
      'person from home in the building — and frequently working through the days that matter ' +
      'most, because those are exactly the days somebody else needs covering.',
      'Faith carries unusually well through that, and it carries in the form of music and ' +
      'devotional habit rather than in institutions, because institutions require a building and ' +
      'a rota and a critical mass in one place. A song, a prayer, a novena and a familiar voice ' +
      'require none of those and fit in a phone.',
      'Which makes this frequency more useful than its listener numbers will ever suggest. It is ' +
      'not serving a community in a place. It is serving a scattered one, at every hour, in the ' +
      'gaps between other people’s shifts.',
    ],
  },
  {
    slug: 'before-anyone-is-listening',
    kicker: 'Folk wisdom',
    title: 'What a Station Sounds Like Before Anyone Is Listening',
    dek: 'Every frequency on this band spent time playing to nobody, and how it behaved then is the whole test.',
    image: 'inspire-rising',
    author: 'eliana',
    stands: 'The audience arrives, if it arrives, long after the standard has been set. Nothing improves once people are watching.',
    body: [
      'Every station here began with an audience of nobody. The catalogue was written, the ' +
      'schedule was built, the frequency went live, and for some period the number of people ' +
      'hearing it was approximately zero.',
      'That period is the only honest test a broadcaster gets. It is very easy to maintain a ' +
      'standard in front of an audience, because the audience enforces it. What a station does ' +
      'when nobody is checking — whether the schedule is still filled properly, whether the ' +
      'quality control still runs, whether the Scripture under each song was still chosen with ' +
      'care by somebody who knew nobody would notice if it were not — is the thing that determines ' +
      'what it will be later.',
      'It does not get fixed afterwards. A station built carelessly in obscurity becomes a station ' +
      'with an audience and careless habits, and by then the habits are the institution. Nothing ' +
      'improves once people are watching; it only becomes more visible.',
      'This is not really about radio. It is the ordinary condition of most faithful work, most of ' +
      'which is done unobserved, for a long time, with no evidence that it is landing anywhere. ' +
      'The instruction about the Father who sees in secret is not a consolation prize. It is a ' +
      'description of where almost everything real is actually built.',
    ],
  },
];
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

  /* ── The voices ──────────────────────────────────────────────────────
     Seven pieces per persona, grouped so the grid reads as one voice at a
     time. The band explainers above answer what this is; these answer who
     is talking, and they run in roster order. */
  // Nova Inspire
  'doubt-is-not-the-opposite-of-faith',
  'questions-you-were-told-not-to-ask',
  'come-back-without-explaining',
  'why-midnight-praise-exists',
  'hymns-were-written-in-trouble',
  'wisdom-when-advice-runs-out',
  'nothing-here-closes-the-deal',
  // Jubilee Inspire
  'what-plays-on-the-flagship',
  'four-generations-one-radio',
  'decisions-before-you-know',
  'celebrating-without-borrowing',
  'when-faith-feels-hard-is-not-beginner',
  'never-twice-in-a-day',
  'jazz-when-nobody-is-performing',
  // Melody Inspire
  'family-faith-is-mostly-logistics',
  'a-sanctuary-that-is-a-kitchen',
  'twenty-minutes-in-the-car',
  'children-do-not-need-a-simplified-god',
  'beyond-the-trauma-is-not-over-it',
  'what-grows-back-and-what-does-not',
  'who-teaches-your-children-the-words',
  // Zariah Inspire
  'riddim-was-church-first',
  'worship-in-a-country-not-yours',
  'french-is-not-a-translation',
  'the-commute-belongs-to-you',
  'holidays-hold-the-old-country',
  'a-rhythm-your-grandmother-knows',
  'praying-in-the-language-you-dream-in',
  // Caleb Inspire
  'courage-is-mostly-boring',
  'iron-requires-two-pieces-of-iron',
  'marriage-matters-is-not-a-conference',
  'after-the-storm-nobody-films',
  'acapella-when-production-stops',
  'the-last-ten-minutes-of-the-day',
  'a-station-not-a-podcast',
  // Zev Inspire
  'the-feasts-are-a-calendar',
  'when-the-law-is-set-to-music',
  'shema-means-hear-then-do',
  'the-subject-every-station-avoids',
  'washing-feet-before-anyone-watches',
  'identity-is-not-a-personality-type',
  'why-heavens-dawn-airs-before-sunrise',
  // Imani Inspire
  'fire-is-not-volume',
  'ten-days-before-one-day',
  'africa-is-a-broadcaster',
  'what-yoruba-praise-does',
  'amharic-worship-is-ancient',
  'praying-in-swahili-at-three',
  'chill-is-still-pentecostal',
  // Santiago Inspire
  'la-familia-is-a-doctrine',
  'a-latin-station-sung-in-english',
  'portuguese-is-not-spanish',
  'two-generations-one-kitchen',
  'praying-out-loud-as-a-habit',
  'focus-is-a-discipline',
  'wellness-without-the-religion',
  // Tahoma Inspire
  'arrived-in-the-wrong-hands',
  'sobriety-is-a-daily-frequency',
  'men-with-nowhere-to-be-honest',
  'anxious-no-more-is-a-command',
  'be-still-is-the-hardest-instruction',
  'the-rhythm-that-outlasted-the-hymnbook',
  'stories-keep-what-is-not-written',
  // Amir Inspire
  'the-church-already-there',
  'ancient-paths-people-who-looked-like-me',
  'arabic-was-a-language-of-worship',
  'the-bengali-gap-was-indefensible',
  'hindi-worship-is-not-western-worship',
  'praying-in-a-language-your-government',
  'what-the-five-fold-actually-is',
  // Elias Inspire
  'repentance-is-a-turn',
  'country-never-stopped-being-honest',
  'two-shortest-prayers',
  'raising-arrows-no-applause',
  'what-is-given-daily',
  'churches-that-sang-under-surveillance',
  'purpose-found-is-usually-assigned',
  // Eliana Inspire
  'strong-and-sober-are-different',
  'grief-walked-not-solved',
  'stillwater-is-not-background-music',
  'friendship-is-a-means-of-grace',
  'japans-tiny-church-old-martyrs',
  'tagalog-travels-with-those-who-leave',
  'before-anyone-is-listening',
];

const HM_ARTICLES = (function () {
  const pool = {};
  HM_CORE.concat(HM_MORE, HM_VOICES_1, HM_VOICES_2, HM_VOICES_3, HM_VOICES_4, HM_VOICES_5, HM_VOICES_6).forEach(function (a) {
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
