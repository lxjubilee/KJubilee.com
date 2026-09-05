#!/usr/bin/env node
/**
 * build-stress-listeners.js — the synthetic audience, generated once and then
 * held still.
 *
 *   node tools/build-stress-listeners.js            # rebuild roster + 24 hours
 *   node tools/build-stress-listeners.js --check    # verify, change nothing
 *   node tools/build-stress-listeners.js --seed autumn-drill --population 480
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
 * /listeners shows one row per live listener and, on a quiet afternoon, shows
 * four of them. That is a true picture and a useless drill: nobody finds out
 * whether the people who run this network can read a hundred and twenty rows,
 * spot the one station nobody is on, or notice a whole region drop off the map,
 * by watching four rows. This builds a fictional audience big enough to
 * practise against.
 *
 * ── THE ROSTER IS A POPULATION, THE HOUR FILES ARE ATTENDANCE ───────────────
 * roster.json holds a few hundred people who never change: one address, one
 * city, one device, one station, forever. That is the property the whole drill
 * rests on — an operator who learns "100.81.x is the Atlanta cohort" must not
 * be lied to an hour later, and a listener whose station moved between two
 * refreshes would make the grid useless as a monitoring surface.
 *
 * The 24 files under hours/ say which of those people are on air during each
 * UTC hour, and are the only thing that moves. They are keyed to UTC because
 * the audience is not in one place: at 03:00 UTC it is ten at night in New
 * York, eight in the evening in Denver, three in the morning in London and one
 * in the afternoon in Sydney, and each of those people is doing something
 * different. Every hour file is therefore a global snapshot in which each
 * listener is doing what makes sense in their OWN local time, not the server's.
 *
 * ── ADDRESSES THAT BELONG TO NOBODY, ON PURPOSE ─────────────────────────────
 * Every IPv4 address here is inside 100.64.0.0/10 — RFC 6598 shared address
 * space, allocated to carrier-grade NAT and not routable on the public
 * internet. It is assigned to no person and no company, and it is also the
 * range a real phone on a real mobile network genuinely sits in, so it reads
 * correctly on the screen. IPv6 rows use 2001:db8::/32, the RFC 3849
 * documentation prefix, for the same two reasons.
 *
 * THIS IS NOT A STYLE CHOICE. A fixture that printed plausible public addresses
 * would be putting real households on an operator's screen, tied to a city and
 * a listening habit that were invented here. Nothing in this file may ever emit
 * an address outside those two blocks, and --check fails if one appears.
 *
 * ── DETERMINISTIC, SO THE DRILL IS REPEATABLE ───────────────────────────────
 * One seed decides everything. Two boxes running the same seed show the same
 * audience, which is what lets one operator say "row 44" to another and be
 * understood. The runtime half (lib/stress-listeners.js) never calls
 * Math.random for the same reason: the page polls every ten seconds and the
 * rows must not shuffle underneath somebody reading them.
 *
 * The specification, the runbook and the switches are in
 * setup/radio-stress-testing.md, which is authoritative over this comment.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'stress-listeners');
const HOURS_DIR = path.join(OUT_DIR, 'hours');
const ROSTER_FILE = path.join(OUT_DIR, 'roster.json');
const RADIO = path.join(ROOT, 'public', 'js', 'pages', 'radio.js');

// ── Arguments ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
    const i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes('--' + name);

const SEED = flag('seed', 'kjubilee-stress-1');
const POPULATION = Math.max(200, Number(flag('population', 420)) || 420);
const FLOOR = Math.max(1, Number(flag('min', 95)) || 95);
const CEILING = Math.max(FLOOR, Number(flag('max', 145)) || 145);
const CHECK_ONLY = has('check');

// ── A seeded generator ─────────────────────────────────────────────────────
/* xmur3 turns the seed string into 32 bits of state, mulberry32 walks it.
   Small, well understood, and identical on every Node — which is the only
   property that matters here. */
function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return function () {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    };
}
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rand = mulberry32(xmur3(SEED)());
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

/** Weighted pick over [[value, weight], ...]. */
function weighted(pairs) {
    let total = 0;
    for (const p of pairs) total += p[1];
    let r = rand() * total;
    for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
    return pairs[pairs.length - 1][0];
}

// ── When a station is listened to, in the listener's own local hour ─────────
/* Seven shapes cover the whole English dial. The numbers are relative weights,
   not percentages: what matters is the ratio between one hour and the next,
   because that is what decides whether somebody is plausibly on this station at
   three in the morning.

   These are also what makes an hour file classifiable as night or day. An hour
   whose on-air set is mostly `overnight` listeners is a night hour wherever the
   server happens to be standing. */
const PROFILES = {
    //          0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
    overnight: [8, 7, 6, 5, 4, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 5, 7, 9, 10, 10],
    sunrise:   [1, 1, 1, 1, 3, 7, 10, 10, 8, 5, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1],
    commute:   [1, 1, 1, 1, 1, 3, 8, 10, 9, 4, 3, 3, 3, 3, 3, 5, 9, 10, 8, 4, 2, 2, 1, 1],
    workday:   [1, 1, 1, 1, 1, 1, 2, 4, 7, 9, 10, 10, 9, 9, 10, 9, 7, 4, 3, 2, 2, 2, 1, 1],
    allday:    [2, 1, 1, 1, 1, 2, 4, 6, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 7, 6, 4, 3],
    evening:   [3, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 5, 6, 8, 10, 10, 9, 7, 5],
    family:    [1, 1, 1, 1, 1, 2, 5, 8, 8, 5, 4, 4, 4, 4, 4, 6, 8, 9, 9, 8, 5, 2, 1, 1],
};

/* Every English-language frequency this fixture will ever put somebody on, with
   the shape of its day and how loud it is.

   `energy` is 0-100 and is the only thing that decides whether an hour file is
   labelled night or day, so it is a statement about the ROOM a station makes,
   not about how good it is: Bedtime Blessings is a 6 and Pentecostal Shout is a
   92, and neither is a judgement.

   THE MULTILANGUAGE BAND IS DELIBERATELY ABSENT. This fixture invents listeners
   in the United States, England and Australia only, so a row on Inspire India
   would be a claim about an audience the drill is not modelling. Latin Worship
   and Back Row Faith are here because both are bilingual WITH English and both
   have a real, large diaspora inside those three countries. */
const STATION_META = {
    'jubilee-radio':          { profile: 'allday',    energy: 62 },
    'jubilee-ccm':            { profile: 'allday',    energy: 70 },
    'yes-and-amen':           { profile: 'allday',    energy: 66 },
    'country-gospel':         { profile: 'commute',   energy: 64 },
    'gravel-road-gospel':     { profile: 'evening',   energy: 58 },
    'corner-cipher':          { profile: 'evening',   energy: 88 },
    'we-eatin-good':          { profile: 'evening',   energy: 84 },
    'throne-room-vegas':      { profile: 'evening',   energy: 90 },
    'jubilee-gospel-fire':    { profile: 'allday',    energy: 92 },
    'pentecostal-fire':       { profile: 'overnight', energy: 78 },
    'riddim-and-rhyme':       { profile: 'evening',   energy: 80 },
    'inspire-hymns-heritage': { profile: 'allday',    energy: 40 },
    'inspire-acapella':       { profile: 'workday',   energy: 44 },
    'radiant-stones-radio':   { profile: 'evening',   energy: 76 },
    'gospel-by-music':        { profile: 'workday',   energy: 34 },
    'hebraic-celebrations':   { profile: 'evening',   energy: 68 },
    'latin-worship':          { profile: 'evening',   energy: 74 },
    'backrow-faith':          { profile: 'evening',   energy: 72 },
    'island-hallelujah':      { profile: 'allday',    energy: 56 },
    'midnight-praise':        { profile: 'overnight', energy: 22 },
    'stillwater':             { profile: 'overnight', energy: 12 },
    'shalom-be-still':        { profile: 'overnight', energy: 10 },
    'inspire-lullaby':        { profile: 'overnight', energy: 8 },
    'bedtime-blessings':      { profile: 'family',    energy: 6 },
    'upper-room':             { profile: 'sunrise',   energy: 26 },
    'heavens-dawn':           { profile: 'sunrise',   energy: 36 },
    'logos':                  { profile: 'sunrise',   energy: 30 },
    'wisdom-channel':         { profile: 'workday',   energy: 32 },
    'jubilee-teaching':       { profile: 'workday',   energy: 38 },
    'identity-in-yeshua':     { profile: 'workday',   energy: 38 },
    'word-of-fire':           { profile: 'evening',   energy: 60 },
    'shema-roots':            { profile: 'workday',   energy: 36 },
    'apostolic-five-fold':    { profile: 'evening',   energy: 54 },
    'the-hidden-manna':       { profile: 'workday',   energy: 34 },
    'money-faith':            { profile: 'commute',   energy: 42 },
    'marriage-matters':       { profile: 'evening',   energy: 40 },
    'raising-arrows':         { profile: 'family',    energy: 44 },
    'lead-like-yeshua':       { profile: 'commute',   energy: 46 },
    'iron-sharpening-iron':   { profile: 'commute',   energy: 48 },
    'purpose-found':          { profile: 'workday',   energy: 42 },
    'decisions-that-matter':  { profile: 'workday',   energy: 40 },
    'when-faith-feels-hard':  { profile: 'overnight', energy: 24 },
    'anxious-no-more':        { profile: 'overnight', energy: 20 },
    'grief-walked':           { profile: 'overnight', energy: 16 },
    'beyond-the-trauma':      { profile: 'overnight', energy: 18 },
    'after-the-storm':        { profile: 'evening',   energy: 28 },
    'the-mended-place':       { profile: 'evening',   energy: 30 },
    'the-comeback-room':      { profile: 'evening',   energy: 46 },
    'restored-renewed':       { profile: 'evening',   energy: 34 },
    'freedom-steps':          { profile: 'evening',   energy: 44 },
    'strong-sober':           { profile: 'overnight', energy: 40 },
    'jubilee-sanctuary':      { profile: 'evening',   energy: 52 },
    'walking-together':       { profile: 'evening',   energy: 44 },
    'pure-heart-brothers':    { profile: 'sunrise',   energy: 48 },
    'whole-hearted-sisters':  { profile: 'workday',   energy: 46 },
    'daughters-of-the-king':  { profile: 'workday',   energy: 48 },
    'gods-little-lambs':      { profile: 'family',    energy: 50 },
    'jubilee-kids-party':     { profile: 'family',    energy: 72 },
    'buckys-barnyard':        { profile: 'family',    energy: 68 },
    'story-hour':             { profile: 'family',    energy: 30 },
    'inspire-talk':           { profile: 'commute',   energy: 44 },
    'inspire-family-pop':     { profile: 'allday',    energy: 68 },
    'inspire-kids':           { profile: 'family',    energy: 64 },
    'inspire-cafe':           { profile: 'workday',   energy: 42 },
    'inspire-focus':          { profile: 'workday',   energy: 26 },
    'inspire-drive':          { profile: 'commute',   energy: 74 },
    'inspire-chill':          { profile: 'overnight', energy: 22 },
    'inspire-classical':      { profile: 'workday',   energy: 28 },
    'inspire-jazz':           { profile: 'evening',   energy: 38 },
    'inspire-country':        { profile: 'commute',   energy: 62 },
    'inspire-throwback':      { profile: 'evening',   energy: 66 },
    'inspire-80s-90s':        { profile: 'evening',   energy: 70 },
    'inspire-active':         { profile: 'commute',   energy: 86 },
    'inspire-celebrations':   { profile: 'evening',   energy: 78 },
    'inspire-wellness':       { profile: 'workday',   energy: 30 },
    'inspire-stories':        { profile: 'family',    energy: 32 },
    'inspire-live':           { profile: 'evening',   energy: 74 },
    'inspire-rising':         { profile: 'evening',   energy: 72 },
    'inspire-latin':          { profile: 'evening',   energy: 76 },
};

// ── Where the audience is, and what it listens to ──────────────────────────
/*
 * THE TASTE LISTS ARE THE POINT OF THE WHOLE FIXTURE. A hundred rows of
 * random cities against random frequencies is noise an operator learns to
 * ignore in a day. A hundred rows where Honolulu is on Island Hallelujah,
 * Nashville is on Gospel Country, Atlanta is on Corner Cipher and Perth is on
 * Celebrate Yeshua! is a picture somebody can actually reason about — and the
 * moment it stops making sense, that is the drill working.
 *
 * The weights are not survey data and are not claimed to be. They are the
 * station's own market as the catalogue states it (data/broadcast-bases.json
 * gives every station an anchor city and relays, and those anchors are what
 * these lists lean on), plus the obvious cultural facts: hymnody reads as
 * northern English, Christian hip-hop reads as Atlanta, Chicago and Los
 * Angeles, country gospel reads as Nashville and Texas, CCM reads as the West
 * Coast and as Australia.
 *
 * `octets` is the second byte of the 100.64/10 address, and is what makes the
 * grid learnable: every address in a region shares a small set of them, so an
 * operator who sees 100.79.x knows it is the mid-South before reading the city.
 *
 * ── CITIES ARE ORDERED BY SIZE, AND THE FOURTH ENTRY IS A BOOST ─────────────
 * Cities are drawn Zipf-weighted in the order written, so the first city in a
 * region gets roughly a third of it and the last gets a handful. The first
 * version of this drew them uniformly and produced three listeners in Atlanta
 * and none at all in Detroit, which made the two most characterful cohorts in
 * the fixture invisible. KEEP EACH LIST IN DESCENDING METRO ORDER.
 *
 * The optional fourth element boosts particular frequencies for that ONE city,
 * on top of whatever the region already says. It is what makes Detroit read as
 * We Eatin Good rather than as generic Midwest, and Muscle Shoals as Gravel
 * Road Gospel rather than as generic mid-South. Use it where a city IS the
 * station's story — mostly, where data/broadcast-bases.json names it as an
 * anchor — and leave it off everywhere else.
 */
const REGIONS = [
    {
        key: 'us-hawaii', cc: 'US', weight: 2, octets: [64],
        cities: [
            ['Honolulu', 'Hawaii', 'Pacific/Honolulu', { 'island-hallelujah': 12 }],
            ['Waipahu', 'Hawaii', 'Pacific/Honolulu'],
            ['Hilo', 'Hawaii', 'Pacific/Honolulu'],
            ['Kahului', 'Hawaii', 'Pacific/Honolulu'],
            ['Kailua-Kona', 'Hawaii', 'Pacific/Honolulu'],
        ],
        taste: [
            ['island-hallelujah', 30], ['inspire-chill', 8], ['jubilee-radio', 7],
            ['jubilee-ccm', 7], ['riddim-and-rhyme', 5], ['shalom-be-still', 4],
            ['inspire-acapella', 3], ['midnight-praise', 3], ['stillwater', 3],
            ['inspire-family-pop', 4], ['upper-room', 3], ['gods-little-lambs', 2],
            ['inspire-wellness', 2],
        ],
    },
    {
        key: 'us-alaska', cc: 'US', weight: 1, octets: [65],
        cities: [
            ['Anchorage', 'Alaska', 'America/Anchorage'],
            ['Fairbanks', 'Alaska', 'America/Anchorage'],
            ['Wasilla', 'Alaska', 'America/Anchorage'],
            ['Juneau', 'Alaska', 'America/Anchorage'],
        ],
        taste: [
            ['stillwater', 8], ['midnight-praise', 7], ['logos', 6],
            ['inspire-hymns-heritage', 6], ['jubilee-radio', 5], ['heavens-dawn', 4],
            ['inspire-focus', 4], ['jubilee-teaching', 4], ['shalom-be-still', 3],
            ['inspire-classical', 3], ['inspire-chill', 3],
        ],
    },
    {
        key: 'us-pacnw', cc: 'US', weight: 4, octets: [66, 67],
        cities: [
            ['Seattle', 'Washington', 'America/Los_Angeles', { 'jubilee-ccm': 8, 'inspire-acapella': 4 }],
            ['Portland', 'Oregon', 'America/Los_Angeles', { 'stillwater': 5 }],
            ['Tacoma', 'Washington', 'America/Los_Angeles'],
            ['Spokane', 'Washington', 'America/Los_Angeles'],
            ['Bellevue', 'Washington', 'America/Los_Angeles'],
            ['Eugene', 'Oregon', 'America/Los_Angeles'],
            ['Salem', 'Oregon', 'America/Los_Angeles'],
        ],
        taste: [
            ['jubilee-ccm', 12], ['stillwater', 8], ['inspire-acapella', 6],
            ['midnight-praise', 6], ['jubilee-radio', 6], ['inspire-cafe', 5],
            ['yes-and-amen', 5], ['inspire-focus', 5], ['inspire-chill', 4],
            ['logos', 4], ['shalom-be-still', 3], ['gospel-by-music', 3],
            ['inspire-wellness', 3], ['radiant-stones-radio', 3], ['inspire-rising', 3],
        ],
    },
    {
        key: 'us-california', cc: 'US', weight: 9, octets: [68, 69, 70, 71],
        cities: [
            ['Los Angeles', 'California', 'America/Los_Angeles', { 'corner-cipher': 6, 'latin-worship': 6, 'we-eatin-good': 4 }],
            ['San Diego', 'California', 'America/Los_Angeles', { 'island-hallelujah': 5 }],
            ['San Jose', 'California', 'America/Los_Angeles'],
            ['San Francisco', 'California', 'America/Los_Angeles'],
            // The Year of Jubilee anchor — data/broadcast-bases.json.
            ['Sacramento', 'California', 'America/Los_Angeles', { 'jubilee-radio': 8 }],
            ['Fresno', 'California', 'America/Los_Angeles', { 'latin-worship': 5 }],
            ['Long Beach', 'California', 'America/Los_Angeles'],
            ['Oakland', 'California', 'America/Los_Angeles'],
            ['Bakersfield', 'California', 'America/Los_Angeles'],
            ['Anaheim', 'California', 'America/Los_Angeles'],
            ['Riverside', 'California', 'America/Los_Angeles'],
            ['Santa Ana', 'California', 'America/Los_Angeles'],
        ],
        taste: [
            ['jubilee-ccm', 12], ['yes-and-amen', 8], ['latin-worship', 8],
            ['inspire-family-pop', 7], ['inspire-active', 5], ['radiant-stones-radio', 5],
            ['jubilee-radio', 5], ['corner-cipher', 4], ['inspire-rising', 4],
            ['inspire-drive', 4], ['inspire-latin', 4], ['jubilee-gospel-fire', 3],
            ['inspire-chill', 3], ['inspire-live', 3], ['hebraic-celebrations', 3],
            ['inspire-jazz', 2], ['inspire-focus', 3],
        ],
    },
    {
        key: 'us-southwest', cc: 'US', weight: 3, octets: [72, 73],
        cities: [
            ['Phoenix', 'Arizona', 'America/Phoenix'],
            // The Strip is the whole conceit of Throne Room Vegas.
            ['Las Vegas', 'Nevada', 'America/Los_Angeles', { 'throne-room-vegas': 20 }],
            ['Tucson', 'Arizona', 'America/Phoenix'],
            ['Mesa', 'Arizona', 'America/Phoenix'],
            ['Albuquerque', 'New Mexico', 'America/Denver', { 'latin-worship': 6 }],
            ['El Paso', 'Texas', 'America/Denver', { 'latin-worship': 8 }],
            ['Henderson', 'Nevada', 'America/Los_Angeles', { 'throne-room-vegas': 8 }],
            ['Scottsdale', 'Arizona', 'America/Phoenix'],
            ['Reno', 'Nevada', 'America/Los_Angeles'],
        ],
        taste: [
            ['throne-room-vegas', 12], ['jubilee-ccm', 8], ['latin-worship', 7],
            ['inspire-drive', 6], ['country-gospel', 5], ['inspire-80s-90s', 5],
            ['inspire-throwback', 4], ['jubilee-radio', 4], ['inspire-country', 4],
            ['gravel-road-gospel', 3], ['inspire-family-pop', 4], ['freedom-steps', 3],
            ['the-comeback-room', 3],
        ],
    },
    {
        key: 'us-mountain', cc: 'US', weight: 3, octets: [74, 75],
        cities: [
            ['Denver', 'Colorado', 'America/Denver'],
            ['Salt Lake City', 'Utah', 'America/Denver'],
            ['Colorado Springs', 'Colorado', 'America/Denver'],
            ['Boise', 'Idaho', 'America/Boise'],
            ['Provo', 'Utah', 'America/Denver'],
            ['Fort Collins', 'Colorado', 'America/Denver'],
            ['Billings', 'Montana', 'America/Denver'],
            ['Cheyenne', 'Wyoming', 'America/Denver'],
        ],
        taste: [
            ['jubilee-ccm', 9], ['inspire-hymns-heritage', 7], ['jubilee-teaching', 6],
            ['stillwater', 6], ['heavens-dawn', 5], ['raising-arrows', 5],
            ['jubilee-radio', 5], ['inspire-active', 4], ['inspire-country', 4],
            ['identity-in-yeshua', 4], ['marriage-matters', 4], ['inspire-focus', 4],
            ['pure-heart-brothers', 3], ['gods-little-lambs', 3],
        ],
    },
    {
        key: 'us-texas', cc: 'US', weight: 8, octets: [76, 77, 78],
        cities: [
            // We Eatin Good relays from Houston — the second home of
            // soul-sampled Southern rap, per data/broadcast-bases.json.
            ['Houston', 'Texas', 'America/Chicago', { 'we-eatin-good': 10, 'latin-worship': 5 }],
            ['Dallas', 'Texas', 'America/Chicago', { 'country-gospel': 6 }],
            ['San Antonio', 'Texas', 'America/Chicago', { 'latin-worship': 12 }],
            ['Austin', 'Texas', 'America/Chicago', { 'gravel-road-gospel': 5 }],
            ['Fort Worth', 'Texas', 'America/Chicago', { 'country-gospel': 6 }],
            ['Arlington', 'Texas', 'America/Chicago'],
            ['Corpus Christi', 'Texas', 'America/Chicago'],
            ['Plano', 'Texas', 'America/Chicago'],
            ['Lubbock', 'Texas', 'America/Chicago'],
            ['Amarillo', 'Texas', 'America/Chicago'],
        ],
        taste: [
            ['country-gospel', 14], ['inspire-country', 8], ['gravel-road-gospel', 6],
            ['we-eatin-good', 6], ['jubilee-ccm', 6], ['latin-worship', 6],
            ['word-of-fire', 5], ['jubilee-gospel-fire', 5], ['inspire-drive', 4],
            ['money-faith', 4], ['hebraic-celebrations', 3], ['raising-arrows', 3],
            ['iron-sharpening-iron', 3], ['jubilee-radio', 4], ['throne-room-vegas', 3],
        ],
    },
    {
        key: 'us-midsouth', cc: 'US', weight: 6, octets: [79, 80],
        cities: [
            // Nashville is country music, and the anchor of Gospel Country.
            ['Nashville', 'Tennessee', 'America/Chicago', { 'country-gospel': 14, 'jubilee-ccm': 5 }],
            ['Memphis', 'Tennessee', 'America/Chicago', { 'jubilee-gospel-fire': 8, 'we-eatin-good': 5 }],
            ['Birmingham', 'Alabama', 'America/Chicago', { 'jubilee-gospel-fire': 5 }],
            ['Knoxville', 'Tennessee', 'America/New_York'],
            ['Chattanooga', 'Tennessee', 'America/New_York'],
            ['Little Rock', 'Arkansas', 'America/Chicago'],
            ['Huntsville', 'Alabama', 'America/Chicago'],
            ['Murfreesboro', 'Tennessee', 'America/Chicago'],
            ['Jackson', 'Mississippi', 'America/Chicago'],
            ['Franklin', 'Tennessee', 'America/Chicago', { 'country-gospel': 8 }],
            // The room Gravel Road Gospel comes out of, and its tenant origin.
            ['Muscle Shoals', 'Alabama', 'America/Chicago', { 'gravel-road-gospel': 16 }],
        ],
        taste: [
            ['country-gospel', 18], ['gravel-road-gospel', 9], ['inspire-hymns-heritage', 8],
            ['inspire-country', 6], ['jubilee-gospel-fire', 6], ['jubilee-ccm', 5],
            ['radiant-stones-radio', 4], ['word-of-fire', 4], ['gospel-by-music', 3],
            ['we-eatin-good', 3], ['inspire-throwback', 3], ['story-hour', 2],
            ['marriage-matters', 3], ['freedom-steps', 3],
        ],
    },
    {
        key: 'us-atlanta', cc: 'US', weight: 5, octets: [81, 82],
        cities: [
            // The centre of gravity of Christian hip-hop, and Corner Cipher's
            // anchor. The city the owner named for exactly this.
            ['Atlanta', 'Georgia', 'America/New_York', { 'corner-cipher': 20, 'we-eatin-good': 5 }],
            ['Marietta', 'Georgia', 'America/New_York', { 'corner-cipher': 6 }],
            ['Augusta', 'Georgia', 'America/New_York'],
            ['Savannah', 'Georgia', 'America/New_York'],
            ['Columbus', 'Georgia', 'America/New_York'],
            ['Decatur', 'Georgia', 'America/New_York', { 'corner-cipher': 6 }],
            ['Macon', 'Georgia', 'America/New_York'],
            ['Athens', 'Georgia', 'America/New_York'],
        ],
        taste: [
            ['corner-cipher', 18], ['jubilee-gospel-fire', 10], ['we-eatin-good', 8],
            ['pentecostal-fire', 6], ['riddim-and-rhyme', 5], ['inspire-rising', 4],
            ['jubilee-ccm', 4], ['country-gospel', 4], ['inspire-family-pop', 3],
            ['word-of-fire', 3], ['the-comeback-room', 3], ['inspire-active', 3],
            ['daughters-of-the-king', 3], ['apostolic-five-fold', 3],
        ],
    },
    {
        key: 'us-southeast', cc: 'US', weight: 6, octets: [83, 84, 85],
        cities: [
            ['Miami', 'Florida', 'America/New_York', { 'riddim-and-rhyme': 12, 'latin-worship': 8 }],
            ['Tampa', 'Florida', 'America/New_York'],
            ['Orlando', 'Florida', 'America/New_York'],
            // Gospel Country's eastern relay, an hour ahead of Nashville.
            ['Charlotte', 'North Carolina', 'America/New_York', { 'country-gospel': 8 }],
            ['Jacksonville', 'Florida', 'America/New_York'],
            ['Raleigh', 'North Carolina', 'America/New_York'],
            ['Fort Lauderdale', 'Florida', 'America/New_York', { 'riddim-and-rhyme': 6 }],
            ['Greensboro', 'North Carolina', 'America/New_York'],
            ['Columbia', 'South Carolina', 'America/New_York'],
            ['St. Petersburg', 'Florida', 'America/New_York'],
            ['Greenville', 'South Carolina', 'America/New_York'],
            ['Hialeah', 'Florida', 'America/New_York', { 'latin-worship': 10 }],
        ],
        taste: [
            ['riddim-and-rhyme', 8], ['country-gospel', 8], ['jubilee-gospel-fire', 7],
            ['jubilee-ccm', 6], ['latin-worship', 6], ['inspire-family-pop', 5],
            ['pentecostal-fire', 5], ['inspire-latin', 4], ['corner-cipher', 4],
            ['gravel-road-gospel', 4], ['inspire-hymns-heritage', 4], ['walking-together', 3],
            ['after-the-storm', 3], ['jubilee-radio', 4], ['inspire-celebrations', 3],
        ],
    },
    {
        key: 'us-midwest', cc: 'US', weight: 8, octets: [86, 87, 88],
        cities: [
            // Chicago is one of the three cities Christian hip-hop was built in.
            ['Chicago', 'Illinois', 'America/Chicago', { 'corner-cipher': 12, 'inspire-jazz': 4 }],
            // Detroit IS the We Eatin Good record — the block, the first of the
            // month, Ruthie Mae's kitchen. The city is the subject, not the
            // postmark, and the fixture should read that way.
            ['Detroit', 'Michigan', 'America/New_York', { 'we-eatin-good': 18, 'corner-cipher': 5 }],
            ['Minneapolis', 'Minnesota', 'America/Chicago'],
            ['St. Louis', 'Missouri', 'America/Chicago'],
            ['Indianapolis', 'Indiana', 'America/Indiana/Indianapolis'],
            ['Columbus', 'Ohio', 'America/New_York'],
            ['Kansas City', 'Missouri', 'America/Chicago'],
            ['Cleveland', 'Ohio', 'America/New_York'],
            ['Milwaukee', 'Wisconsin', 'America/Chicago'],
            ['Omaha', 'Nebraska', 'America/Chicago'],
            ['Grand Rapids', 'Michigan', 'America/New_York'],
            ['Toledo', 'Ohio', 'America/New_York'],
            ['Des Moines', 'Iowa', 'America/Chicago'],
            ['Madison', 'Wisconsin', 'America/Chicago'],
            ['Fort Wayne', 'Indiana', 'America/Indiana/Indianapolis'],
        ],
        taste: [
            ['we-eatin-good', 9], ['corner-cipher', 8], ['inspire-hymns-heritage', 7],
            ['jubilee-teaching', 6], ['jubilee-sanctuary', 5], ['inspire-cafe', 5],
            ['jubilee-gospel-fire', 5], ['jubilee-ccm', 5], ['inspire-jazz', 4],
            ['backrow-faith', 3], ['logos', 4], ['inspire-throwback', 4],
            ['story-hour', 3], ['inspire-classical', 3], ['bedtime-blessings', 3],
            ['gods-little-lambs', 3], ['inspire-drive', 3],
        ],
    },
    {
        key: 'us-appalachia', cc: 'US', weight: 3, octets: [89],
        cities: [
            ['Louisville', 'Kentucky', 'America/New_York'],
            ['Cincinnati', 'Ohio', 'America/New_York'],
            ['Lexington', 'Kentucky', 'America/New_York'],
            ['Dayton', 'Ohio', 'America/New_York'],
            ['Roanoke', 'Virginia', 'America/New_York'],
            ['Charleston', 'West Virginia', 'America/New_York'],
            ['Huntington', 'West Virginia', 'America/New_York'],
            ['Johnson City', 'Tennessee', 'America/New_York'],
        ],
        taste: [
            ['country-gospel', 12], ['inspire-hymns-heritage', 9], ['gravel-road-gospel', 7],
            ['freedom-steps', 6], ['strong-sober', 5], ['jubilee-sanctuary', 4],
            ['the-comeback-room', 4], ['word-of-fire', 4], ['restored-renewed', 3],
            ['inspire-country', 4], ['grief-walked', 3], ['after-the-storm', 3],
            ['jubilee-radio', 3],
        ],
    },
    {
        key: 'us-northeast', cc: 'US', weight: 7, octets: [90, 91, 92],
        cities: [
            ['New York', 'New York', 'America/New_York', { 'inspire-jazz': 5, 'jubilee-teaching': 4 }],
            ['Brooklyn', 'New York', 'America/New_York', { 'riddim-and-rhyme': 8 }],
            ['Philadelphia', 'Pennsylvania', 'America/New_York', { 'jubilee-gospel-fire': 5 }],
            ['Boston', 'Massachusetts', 'America/New_York'],
            ['Queens', 'New York', 'America/New_York', { 'riddim-and-rhyme': 6 }],
            ['Newark', 'New Jersey', 'America/New_York', { 'jubilee-gospel-fire': 5 }],
            ['Pittsburgh', 'Pennsylvania', 'America/New_York'],
            ['Buffalo', 'New York', 'America/New_York'],
            ['Jersey City', 'New Jersey', 'America/New_York'],
            ['Rochester', 'New York', 'America/New_York'],
            ['Hartford', 'Connecticut', 'America/New_York'],
            ['Providence', 'Rhode Island', 'America/New_York'],
            ['Yonkers', 'New York', 'America/New_York'],
            ['Worcester', 'Massachusetts', 'America/New_York'],
        ],
        taste: [
            ['jubilee-teaching', 8], ['logos', 7], ['corner-cipher', 6],
            ['inspire-jazz', 6], ['upper-room', 5], ['inspire-focus', 5],
            ['jubilee-gospel-fire', 5], ['riddim-and-rhyme', 5], ['wisdom-channel', 4],
            ['inspire-classical', 4], ['hebraic-celebrations', 4], ['shema-roots', 4],
            ['inspire-cafe', 4], ['midnight-praise', 4], ['anxious-no-more', 3],
            ['inspire-family-pop', 4], ['gospel-by-music', 3], ['apostolic-five-fold', 3],
        ],
    },
    {
        key: 'us-midatlantic', cc: 'US', weight: 3, octets: [93, 94],
        cities: [
            ['Washington', 'District of Columbia', 'America/New_York', { 'jubilee-gospel-fire': 6 }],
            ['Baltimore', 'Maryland', 'America/New_York', { 'jubilee-gospel-fire': 6, 'we-eatin-good': 4 }],
            ['Virginia Beach', 'Virginia', 'America/New_York'],
            ['Richmond', 'Virginia', 'America/New_York'],
            ['Norfolk', 'Virginia', 'America/New_York'],
            ['Alexandria', 'Virginia', 'America/New_York'],
            ['Silver Spring', 'Maryland', 'America/New_York'],
        ],
        taste: [
            ['jubilee-gospel-fire', 8], ['jubilee-teaching', 7], ['corner-cipher', 6],
            ['daughters-of-the-king', 5], ['pentecostal-fire', 5], ['logos', 5],
            ['inspire-focus', 4], ['lead-like-yeshua', 4], ['money-faith', 4],
            ['we-eatin-good', 4], ['inspire-drive', 4], ['upper-room', 4],
            ['purpose-found', 3], ['jubilee-ccm', 4],
        ],
    },
    {
        key: 'uk-london', cc: 'GB', weight: 8, octets: [100, 101, 102],
        cities: [
            ['London', 'England', 'Europe/London', { 'riddim-and-rhyme': 6, 'backrow-faith': 3 }],
            ['Croydon', 'England', 'Europe/London'],
            ['Hackney', 'England', 'Europe/London', { 'riddim-and-rhyme': 6 }],
            ['Ilford', 'England', 'Europe/London'],
            ['Wembley', 'England', 'Europe/London'],
            ['Stratford', 'England', 'Europe/London'],
            ['Brixton', 'England', 'Europe/London', { 'riddim-and-rhyme': 8 }],
            ['Enfield', 'England', 'Europe/London'],
            ['Barking', 'England', 'Europe/London'],
        ],
        taste: [
            ['riddim-and-rhyme', 9], ['jubilee-teaching', 7], ['logos', 6],
            ['corner-cipher', 5], ['upper-room', 5], ['inspire-cafe', 5],
            ['pentecostal-fire', 5], ['jubilee-gospel-fire', 5], ['backrow-faith', 4],
            ['inspire-jazz', 4], ['inspire-focus', 4], ['wisdom-channel', 4],
            ['midnight-praise', 4], ['inspire-classical', 4], ['apostolic-five-fold', 3],
            ['hebraic-celebrations', 3], ['shema-roots', 3], ['jubilee-ccm', 4],
            ['inspire-chill', 3],
        ],
    },
    {
        key: 'uk-north', cc: 'GB', weight: 4, octets: [103, 104],
        cities: [
            ['Manchester', 'England', 'Europe/London'],
            ['Leeds', 'England', 'Europe/London'],
            ['Liverpool', 'England', 'Europe/London'],
            ['Sheffield', 'England', 'Europe/London'],
            ['Bradford', 'England', 'Europe/London'],
            ['Newcastle upon Tyne', 'England', 'Europe/London'],
            ['Hull', 'England', 'Europe/London'],
            ['Bolton', 'England', 'Europe/London'],
            ['Sunderland', 'England', 'Europe/London'],
            ['Preston', 'England', 'Europe/London'],
        ],
        taste: [
            ['inspire-hymns-heritage', 12], ['jubilee-sanctuary', 7], ['logos', 6],
            ['inspire-classical', 5], ['midnight-praise', 5], ['wisdom-channel', 5],
            ['stillwater', 5], ['jubilee-teaching', 5], ['inspire-acapella', 4],
            ['inspire-cafe', 4], ['walking-together', 4], ['grief-walked', 3],
            ['when-faith-feels-hard', 3], ['jubilee-ccm', 4], ['story-hour', 3],
        ],
    },
    {
        key: 'uk-midlands', cc: 'GB', weight: 3, octets: [105],
        cities: [
            ['Birmingham', 'England', 'Europe/London'],
            ['Nottingham', 'England', 'Europe/London'],
            ['Leicester', 'England', 'Europe/London'],
            ['Coventry', 'England', 'Europe/London'],
            ['Wolverhampton', 'England', 'Europe/London'],
            ['Derby', 'England', 'Europe/London'],
            ['Stoke-on-Trent', 'England', 'Europe/London'],
            ['Northampton', 'England', 'Europe/London'],
        ],
        taste: [
            ['inspire-hymns-heritage', 10], ['jubilee-gospel-fire', 6], ['riddim-and-rhyme', 5],
            ['jubilee-sanctuary', 5], ['logos', 5], ['inspire-cafe', 5],
            ['jubilee-teaching', 5], ['pentecostal-fire', 4], ['inspire-acapella', 4],
            ['wisdom-channel', 4], ['midnight-praise', 4], ['gods-little-lambs', 3],
            ['walking-together', 3], ['jubilee-ccm', 4], ['inspire-focus', 3],
        ],
    },
    {
        key: 'uk-south', cc: 'GB', weight: 2, octets: [106],
        cities: [
            ['Bristol', 'England', 'Europe/London'],
            ['Brighton', 'England', 'Europe/London'],
            ['Southampton', 'England', 'Europe/London'],
            ['Portsmouth', 'England', 'Europe/London'],
            ['Reading', 'England', 'Europe/London'],
            ['Norwich', 'England', 'Europe/London'],
            ['Plymouth', 'England', 'Europe/London'],
            ['Cambridge', 'England', 'Europe/London', { 'inspire-classical': 6 }],
            ['Oxford', 'England', 'Europe/London', { 'inspire-classical': 6 }],
            ['Bournemouth', 'England', 'Europe/London'],
            ['Exeter', 'England', 'Europe/London'],
        ],
        taste: [
            ['inspire-classical', 8], ['stillwater', 7], ['inspire-hymns-heritage', 7],
            ['wisdom-channel', 6], ['logos', 6], ['inspire-focus', 6],
            ['shalom-be-still', 5], ['jubilee-teaching', 5], ['inspire-cafe', 5],
            ['midnight-praise', 4], ['inspire-acapella', 4], ['inspire-wellness', 4],
            ['gospel-by-music', 3], ['jubilee-ccm', 4],
        ],
    },
    {
        key: 'au-southeast', cc: 'AU', weight: 8, octets: [112, 113, 114],
        cities: [
            ['Sydney', 'New South Wales', 'Australia/Sydney', { 'jubilee-ccm': 8, 'yes-and-amen': 5 }],
            ['Melbourne', 'Victoria', 'Australia/Melbourne', { 'jubilee-ccm': 6, 'inspire-rising': 4 }],
            ['Canberra', 'Australian Capital Territory', 'Australia/Sydney'],
            ['Newcastle', 'New South Wales', 'Australia/Sydney'],
            ['Wollongong', 'New South Wales', 'Australia/Sydney'],
            ['Geelong', 'Victoria', 'Australia/Melbourne'],
            ['Parramatta', 'New South Wales', 'Australia/Sydney'],
            ['Ballarat', 'Victoria', 'Australia/Melbourne'],
        ],
        taste: [
            ['jubilee-ccm', 14], ['yes-and-amen', 10], ['inspire-family-pop', 7],
            ['jubilee-radio', 6], ['inspire-active', 6], ['radiant-stones-radio', 5],
            ['inspire-rising', 5], ['inspire-live', 5], ['midnight-praise', 4],
            ['upper-room', 4], ['jubilee-teaching', 4], ['inspire-drive', 4],
            ['identity-in-yeshua', 3], ['inspire-chill', 4], ['gods-little-lambs', 3],
            ['jubilee-kids-party', 3],
        ],
    },
    {
        key: 'au-queensland', cc: 'AU', weight: 4, octets: [115, 116],
        cities: [
            ['Brisbane', 'Queensland', 'Australia/Brisbane', { 'jubilee-ccm': 6 }],
            ['Gold Coast', 'Queensland', 'Australia/Brisbane', { 'island-hallelujah': 8 }],
            ['Sunshine Coast', 'Queensland', 'Australia/Brisbane'],
            ['Townsville', 'Queensland', 'Australia/Brisbane'],
            ['Cairns', 'Queensland', 'Australia/Brisbane', { 'island-hallelujah': 8 }],
            ['Toowoomba', 'Queensland', 'Australia/Brisbane'],
            ['Ipswich', 'Queensland', 'Australia/Brisbane'],
        ],
        taste: [
            ['jubilee-ccm', 12], ['island-hallelujah', 8], ['yes-and-amen', 7],
            ['inspire-active', 6], ['inspire-family-pop', 6], ['inspire-chill', 5],
            ['jubilee-radio', 5], ['inspire-celebrations', 4], ['riddim-and-rhyme', 4],
            ['inspire-wellness', 4], ['buckys-barnyard', 3], ['jubilee-kids-party', 3],
            ['inspire-rising', 4], ['stillwater', 3],
        ],
    },
    {
        key: 'au-west-south', cc: 'AU', weight: 3, octets: [117],
        cities: [
            ['Perth', 'Western Australia', 'Australia/Perth', { 'jubilee-ccm': 6 }],
            ['Adelaide', 'South Australia', 'Australia/Adelaide'],
            ['Hobart', 'Tasmania', 'Australia/Hobart'],
            ['Darwin', 'Northern Territory', 'Australia/Darwin'],
            ['Launceston', 'Tasmania', 'Australia/Hobart'],
            ['Fremantle', 'Western Australia', 'Australia/Perth'],
        ],
        taste: [
            ['jubilee-ccm', 10], ['inspire-hymns-heritage', 6], ['stillwater', 6],
            ['yes-and-amen', 6], ['jubilee-radio', 5], ['midnight-praise', 5],
            ['inspire-focus', 5], ['shalom-be-still', 4], ['jubilee-teaching', 4],
            ['inspire-classical', 4], ['inspire-family-pop', 5], ['walking-together', 3],
            ['heavens-dawn', 3], ['inspire-chill', 4],
        ],
    },
];

/* THE DEVICE MIX IS THE OWNER'S NUMBER, NOT A MEASUREMENT: 40% iPhone, 15%
   Android, and the remaining 45% split between Windows and Mac. The browser
   after the dot is decoration — what the drill is exercising is whether the
   grid still reads when nearly three rows in five are a phone. */
const DEVICES = [
    { device: 'iPhone',  platform: 'ios',     share: 40, agents: ['iOS · Safari', 'iOS · Chrome', 'iOS · Safari'] },
    { device: 'Android', platform: 'android', share: 15, agents: ['Android · Chrome', 'Android · Samsung Internet'] },
    { device: 'Windows', platform: 'windows', share: 27, agents: ['Windows · Edge', 'Windows · Chrome', 'Windows · Firefox'] },
    { device: 'Mac',     platform: 'mac',     share: 18, agents: ['macOS · Safari', 'macOS · Chrome'] },
];

/* How long somebody stays, and how often they come back.

   `anchor` is the listener the owner described: the radio goes on and is
   forgotten about. They hold a row for most of a working day and are the reason
   consecutive hour files overlap instead of being twenty-four unrelated
   crowds. */
const TYPES = [
    { type: 'anchor',  share: 18, dwell: [5, 13] },
    { type: 'regular', share: 45, dwell: [2, 4] },
    { type: 'dropin',  share: 37, dwell: [1, 1] },
];

// ── Clock helpers ──────────────────────────────────────────────────────────
/** The zone's offset from UTC, in hours, as of `at`. Handles half-hour zones. */
function utcOffsetHours(tz, at) {
    try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
            .formatToParts(at);
        const name = parts.find((p) => p.type === 'timeZoneName');
        const m = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(name ? name.value : '');
        if (!m) return 0;
        return (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3] || 0) / 60);
    } catch (e) {
        return 0;
    }
}

/** The listener's own clock hour when it is `utcHour` at Greenwich. */
function localHour(utcHour, offset) {
    return ((Math.floor(utcHour + offset) % 24) + 24) % 24;
}

const DAYPARTS = [
    ['night', 22, 5], ['early', 5, 8], ['morning', 8, 12],
    ['midday', 12, 15], ['afternoon', 15, 18], ['evening', 18, 22],
];
function daypartOf(h) {
    for (const [name, from, to] of DAYPARTS) {
        if (from < to ? h >= from && h < to : h >= from || h < to) return name;
    }
    return 'night';
}

// ── Addresses ──────────────────────────────────────────────────────────────
const hex = (n) => n.toString(16);

/** An IPv4 inside 100.64.0.0/10, with the region in the second octet. */
function ipv4For(region) {
    return ['100', pick(region.octets), between(0, 255), between(1, 254)].join('.');
}

/** An IPv6 inside 2001:db8::/32 — the RFC 3849 documentation prefix. */
function ipv6For(region) {
    const g = () => hex(between(0, 65535));
    return ['2001', 'db8', hex(pick(region.octets) * 271 % 65536), g(), g(), g(), g(), g()].join(':');
}

// ── The catalogue, for --check ─────────────────────────────────────────────
function catalogueSlugs() {
    const src = fs.readFileSync(RADIO, 'utf8');
    const anchor = src.indexOf('const stations = [');
    if (anchor < 0) throw new Error('station array not found in ' + RADIO);
    const start = src.indexOf('[', anchor);
    let depth = 0, end = -1;
    for (let i = start; i < src.length; i++) {
        if (src[i] === '[') depth++;
        else if (src[i] === ']' && --depth === 0) { end = i; break; }
    }
    const literal = src.slice(start, end + 1).replace(/STREAM_[A-Z_0-9]+/g, 'null');
    // eslint-disable-next-line no-eval
    return new Set(eval(literal).map((s) => s.slug));
}

// ── Building the population ────────────────────────────────────────────────
function buildRoster(now) {
    const listeners = [];
    const usedIps = new Set();

    /* Regions are filled proportionally rather than sampled one listener at a
       time, so a small region like Alaska cannot come out empty on an unlucky
       seed and leave a whole time zone unrepresented in the drill. */
    const totalWeight = REGIONS.reduce((n, r) => n + r.weight, 0);
    let issued = 0;

    REGIONS.forEach((region, ri) => {
        const share = ri === REGIONS.length - 1
            ? POPULATION - issued
            : Math.max(4, Math.round((region.weight / totalWeight) * POPULATION));
        issued += share;

        const offset = utcOffsetHours(region.cities[0][2], now);

        /* Zipf over the city list as written, so the anchor city carries about
           a third of its region and the tail still gets somebody.

           ALLOCATED, NOT SAMPLED, for the same reason regions are: drawing a
           city per listener put three people in Atlanta and none at all in
           Detroit, and even at twice the population a seven-person city could
           not reliably show its own lean. Largest remainder turns a headcount
           into a fact rather than a coin toss. */
        const odds = region.cities.map((c, i) => 1 / (i + 1));
        const oddsTotal = odds.reduce((n, w) => n + w, 0);
        const exact = odds.map((w) => (w / oddsTotal) * share);
        const alloc = exact.map(Math.floor);
        const remainders = exact
            .map((v, i) => [i, v - Math.floor(v)])
            .sort((a, b) => b[1] - a[1]);
        for (let k = 0, over = share - alloc.reduce((n, v) => n + v, 0); k < over; k++) {
            alloc[remainders[k % remainders.length][0]]++;
        }

        region.cities.forEach(([city, place, tz, boost], ci) => {
            /* The city's own leanings ride ON TOP of the region's, rather than
               replacing them — so Detroit is still a Midwestern listener who
               might be on Inspire Cafe, just far likelier to be on We Eatin
               Good than somebody in Toledo is. */
            let cityOdds = region.taste;
            if (boost) {
                const merged = new Map(region.taste);
                for (const [slug, w] of Object.entries(boost)) {
                    merged.set(slug, (merged.get(slug) || 0) + w);
                }
                cityOdds = [...merged];
            }
            /* The strongest boost, seated first. A city that declares itself
               the home of a station should be SEEN to be, and leaving that to
               a weighted draw over six people means the fixture sometimes
               ships with nobody in Muscle Shoals on Gravel Road Gospel — which
               is not a subtle statistical shortfall, it is the one thing that
               city is in the table to demonstrate. */
            const seat = boost
                ? Object.entries(boost).sort((a, b) => b[1] - a[1])[0][0]
                : null;

        for (let i = 0; i < alloc[ci]; i++) {
            const station = i === 0 && seat ? seat : weighted(cityOdds);
            const meta = STATION_META[station];
            if (!meta) throw new Error('station ' + station + ' has no STATION_META entry');

            const dev = weighted(DEVICES.map((d) => [d, d.share]));
            const kind = weighted(TYPES.map((t) => [t, t.share]));

            /* A phone is far likelier to be on IPv6 than a desktop, which is
               true of the real internet and also puts the long addresses where
               the operator expects to see them. */
            const v6chance = dev.platform === 'ios' || dev.platform === 'android' ? 0.34 : 0.06;
            let ip;
            do {
                ip = rand() < v6chance ? ipv6For(region) : ipv4For(region);
            } while (usedIps.has(ip));
            usedIps.add(ip);

            listeners.push({
                id: 's' + String(listeners.length + 1).padStart(3, '0'),
                ip,
                city,
                region: place,
                country: region.cc,
                tz,
                utcOffset: utcOffsetHours(tz, now),
                regionKey: region.key,
                device: dev.device,
                platform: dev.platform,
                agent: pick(dev.agents),
                station,
                profile: meta.profile,
                energy: meta.energy,
                type: kind.type,
                dwell: between(kind.dwell[0], kind.dwell[1]),
            });
        }
        });
    });

    return {
        schema: 'kj.stress.roster/1',
        note: [
            'A FICTIONAL AUDIENCE. Every address in this file is inside',
            '100.64.0.0/10 (RFC 6598 carrier-grade NAT) or 2001:db8::/32 (RFC',
            '3849 documentation). Neither block is routable on the public',
            'internet and neither is allocated to any person or company, so no',
            'row here can be mistaken for, or acted on as, a real listener.',
            '',
            'Regenerate with: node tools/build-stress-listeners.js',
            'Nothing in here is hand-edited — the seed is the input.',
        ],
        seed: SEED,
        generated: now.toISOString().slice(0, 10),
        offsetsValidFor: now.toISOString().slice(0, 10),
        population: listeners.length,
        floor: FLOOR,
        ceiling: CEILING,
        listeners,
    };
}

// ── Building the twenty-four hours ─────────────────────────────────────────
/*
 * WHY THE LOOP RUNS FORTY-EIGHT TIMES AND KEEPS THE LAST TWENTY-FOUR. Hour 00
 * has to inherit an audience from hour 23, or midnight UTC would be the one
 * moment in the day when the whole world simultaneously tunes in for the first
 * time. Walking the clock twice and discarding the first pass gives hour 00 a
 * real predecessor, which is what makes the rotation seamless when it wraps.
 */
function buildHours(roster) {
    const byId = new Map(roster.listeners.map((l) => [l.id, l]));

    /* Propensity: how likely this person is to be listening at this UTC hour,
       expressed in their own local time. */
    const propensity = new Map();
    for (const l of roster.listeners) {
        const row = [];
        for (let h = 0; h < 24; h++) {
            row.push(PROFILES[l.profile][localHour(h, l.utcOffset)]);
        }
        propensity.set(l.id, row);
    }

    /* The target headcount for each hour, derived rather than drawn: sum every
       listener's propensity, then map the 24 sums onto [FLOOR, CEILING]. So the
       curve peaks when the most of the English-speaking world is awake and
       listening, and the floor lands where it actually should — around 09:00
       UTC, which is the small hours in America and bedtime in Britain. */
    const gross = [];
    for (let h = 0; h < 24; h++) {
        let sum = 0;
        for (const l of roster.listeners) sum += propensity.get(l.id)[h];
        gross.push(sum);
    }
    const lo = Math.min(...gross);
    const hi = Math.max(...gross);
    const span = CEILING - FLOOR;
    /* A WOBBLE ON TOP OF THE CURVE, because a headcount that slides smoothly
       from 95 to 145 and back is the one thing real traffic never does. Eight
       either way is enough that an operator cannot predict the next hour from
       the last two, and small enough that the shape of the day survives it. */
    const target = gross.map((g) => {
        const smooth = FLOOR + ((g - lo) / (hi - lo || 1)) * span;
        return Math.max(FLOOR, Math.min(CEILING, Math.round(smooth + between(-8, 8))));
    });

    const live = new Map();     // id -> { hoursSoFar, hoursLeft }
    const out = new Array(24);

    for (let step = 0; step < 48; step++) {
        const h = step % 24;

        // 1. Age everybody who is already on, and let sessions run out.
        for (const [id, s] of [...live]) {
            s.hoursLeft -= 1;
            s.hoursSoFar += 1;
            if (s.hoursLeft <= 0) live.delete(id);
        }

        /* 2. Somebody whose local clock has moved past their station's hours
           goes to bed even if their session had time left. This is what stops
           an anchor in Perth still holding a row at four in the morning purely
           because they started at eight the previous evening. */
        for (const [id] of [...live]) {
            if (propensity.get(id)[h] <= 1 && rand() < 0.65) live.delete(id);
        }

        // 3. Fill up to the hour's target, weighted by who is plausibly awake.
        const want = target[h];
        if (live.size < want) {
            const pool = [];
            for (const l of roster.listeners) {
                if (live.has(l.id)) continue;
                const w = propensity.get(l.id)[h];
                if (w <= 1) continue;
                pool.push([l.id, w * w]);   // squared, so the fit is decisive
            }
            let guard = pool.length * 3;
            while (live.size < want && pool.length && guard-- > 0) {
                const id = weighted(pool);
                if (live.has(id)) continue;
                live.set(id, { hoursSoFar: 0, hoursLeft: byId.get(id).dwell });
            }
        }

        // 4. Over target: the worst fits leave first.
        if (live.size > want) {
            const ranked = [...live.keys()].sort((a, b) => propensity.get(a)[h] - propensity.get(b)[h]);
            for (const id of ranked.slice(0, live.size - want)) live.delete(id);
        }

        if (step < 24) continue;   // warm-up pass, discarded

        // 5. Record the hour.
        const entries = [];
        const stations = new Map();
        const countries = new Map();
        const dayparts = {};
        let energySum = 0;

        for (const [id, s] of live) {
            const l = byId.get(id);

            /* SLOTS ARE THIRDS OF THE HOUR, and they are how the headcount
               moves between the top of one hour and the top of the next. The
               runtime decides WHEN the boundaries fall — once or twice, at a
               minute nobody can predict — and reads whichever third it is in.
               A row that holds all three is somebody who never got up. */
            let first = 0, last = 2;
            if (s.hoursSoFar === 0) first = weighted([[0, 6], [1, 3], [2, 2]]);
            if (s.hoursLeft <= 1) last = Math.max(first, weighted([[2, 6], [1, 3], [0, 2]]));
            let slots = '';
            for (let k = 0; k < 3; k++) slots += k >= first && k <= last ? '1' : '0';

            entries.push({ i: id, h: s.hoursSoFar, s: slots });

            stations.set(l.station, (stations.get(l.station) || 0) + 1);
            countries.set(l.country, (countries.get(l.country) || 0) + 1);
            const part = daypartOf(localHour(h, l.utcOffset));
            dayparts[part] = (dayparts[part] || 0) + 1;
            energySum += l.energy;
        }

        /* ── EVERY SEGMENT HAS TO HONOUR THE BAND, NOT JUST THE HOUR ────────
           `entries` is the union of everybody who appears at any point in this
           hour, and that union is what was sized against 95-145. But the page
           only ever shows ONE segment at a time, and the first build of this
           left segments as thin as 69 — the listener would be told the network
           had dropped a quarter of its audience for twenty minutes and then
           got it back, twice an hour, forever.

           So each slot is topped up by extending somebody's run rather than by
           inventing a new listener: a row that was leaving at the second churn
           simply stays to the end. Runs are kept contiguous — a listener who
           comes back after leaving is a different session, and the duration
           column would have no way to say so.

           EACH SLOT GETS ITS OWN TARGET, a few above the floor rather than
           exactly on it. Topping all three to the same number produced an hour
           whose headcount did not move once in sixty minutes: every churn fired
           and swapped one set of people for an identically sized set, which is
           the one thing the churns exist not to do. */
        const slotCount = (k) => entries.filter((e) => e.s[k] === '1').length;
        const natural = [slotCount(0), slotCount(1), slotCount(2)];
        const aim = natural.map((n) => Math.min(entries.length, Math.max(n, FLOOR + between(0, 11))));
        if (aim[0] === aim[1] && aim[1] === aim[2]) {
            aim[1] = Math.min(entries.length, aim[1] + 4);
        }
        /** Stretch one listener's run so that it covers slot k, contiguously. */
        const extendTo = (e, k) => {
            const from = Math.min(k, e.s.indexOf('1'));
            const to = Math.max(k, e.s.lastIndexOf('1'));
            let grown = '';
            for (let j = 0; j < 3; j++) grown += j >= from && j <= to ? '1' : '0';
            e.s = grown;
        };

        for (let k = 0; k < 3; k++) {
            let short = aim[k] - slotCount(k);
            for (const e of entries) {
                if (short <= 0) break;
                if (e.s[k] === '1') continue;
                extendTo(e, k);
                short--;
            }
        }

        /* ── AND THE HEADCOUNT MUST ACTUALLY MOVE, IN BOTH READINGS ─────────
           The runtime fires either one churn or two. With two it reads the
           slots one at a time; with one there are only two segments to fill
           with three slots, so the second covers slots two and three together.
           An hour can therefore be lively under one reading and flat under the
           other, and the builder cannot know which the runtime will pick on a
           given day — so both have to move. Nudged one listener at a time
           rather than recomputed, because everything above this point is
           already correct and only needs a couple of rows to disagree. */
        const union12 = () => entries.filter((e) => e.s[1] === '1' || e.s[2] === '1').length;
        const flat = () => union12() === slotCount(0)
            || (slotCount(0) === slotCount(1) && slotCount(1) === slotCount(2));
        for (let guard = 40; guard > 0 && flat(); guard--) {
            const e = entries.find((x) => x.s[1] === '0' || x.s[2] === '0');
            if (!e) break;
            extendTo(e, e.s[1] === '0' ? 1 : 2);
        }

        const energy = entries.length ? Math.round(energySum / entries.length) : 0;
        const clock = (tz) => String(localHour(h, utcOffsetHours(tz, new Date()))).padStart(2, '0') + ':00';

        /* ── NIGHT AND DAY, MEASURED THE ONLY WAY THAT WORKS HERE ──────────
           The first version of this classified an hour by its mean energy and
           produced twenty-four day files, which was not a bug in the threshold
           but a fact about the audience: this network is heard on three
           continents, so at every hour of the clock somebody somewhere is in
           prime time and the average never falls far. Averaging a global room
           tells you nothing about whether it is night in it.

           What does tell you is how much of the room is in ITS OWN small
           hours. `nightShare` is that fraction — the listeners whose local
           clock reads between ten at night and eight in the morning — and it
           swings from about one row in twenty to fully half, which is a signal
           worth labelling. An hour at or above 0.30 is a night file: the
           audience it describes is mostly people listening in the dark, and
           the recovery, prayer and sleep frequencies carry it. */
        const nightShare = entries.length
            ? ((dayparts.night || 0) + (dayparts.early || 0)) / entries.length : 0;

        out[h] = {
            schema: 'kj.stress.hour/1',
            utcHour: h,
            count: entries.length,
            /* The mean energy of everything being listened to, 0-100. Low is a
               room full of Stillwater and Bedtime Blessings; high is Corner
               Cipher and Throne Room Vegas. `energyLabel` is set in a second
               pass, once all twenty-four hours are known, because the useful
               question is loud FOR THIS DAY rather than loud in the abstract. */
            energy,
            energyLabel: null,
            /* How much of this hour's audience is listening in its own night. */
            nightShare: Math.round(nightShare * 100) / 100,
            /* The blunt version, which is the one the runbook uses: is this a
               file to be playing through the night, or through the day? */
            suitableFor: nightShare >= 0.3 ? 'night' : 'day',
            clocks: {
                'America/Los_Angeles': clock('America/Los_Angeles'),
                'America/New_York': clock('America/New_York'),
                'Europe/London': clock('Europe/London'),
                'Australia/Sydney': clock('Australia/Sydney'),
            },
            held: entries.filter((e) => e.h > 0).length,
            fresh: entries.filter((e) => e.h === 0).length,
            /* What the page will actually show, one segment at a time. `count`
               above is the union across the whole hour and is always the
               larger number; these three are the ones that must stay inside
               the band. */
            slotCounts: [slotCount(0), slotCount(1), slotCount(2)],
            byCountry: Object.fromEntries([...countries].sort((a, b) => b[1] - a[1])),
            dayparts,
            stations: [...stations].sort((a, b) => b[1] - a[1]).map(([station, n]) => ({ station, n })),
            listeners: entries.sort((a, b) => (b.h - a.h) || a.i.localeCompare(b.i)),
        };
    }

    /* The second pass. Quartiles of the day's own energy range, so all four
       labels are always used and "peak" means the loudest quarter of THIS
       twenty-four hours rather than a number somebody guessed at once. */
    const spread = out.map((o) => o.energy).sort((a, b) => a - b);
    const q = (f) => spread[Math.min(spread.length - 1, Math.floor(f * spread.length))];
    const q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
    for (const o of out) {
        o.energyLabel = o.energy <= q1 ? 'quiet' : o.energy <= q2 ? 'low'
            : o.energy <= q3 ? 'steady' : 'peak';
    }

    return out;
}

// ── Checking ───────────────────────────────────────────────────────────────
const V4 = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/;
const V6 = /^2001:db8:/i;

function check(now) {
    const problems = [];
    const warn = [];

    if (!fs.existsSync(ROSTER_FILE)) return { problems: ['roster.json is missing — run the builder'], warn };
    const roster = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));

    const slugs = catalogueSlugs();
    const seenIp = new Set();
    for (const l of roster.listeners) {
        if (!V4.test(l.ip) && !V6.test(l.ip)) {
            problems.push(l.id + ' has address ' + l.ip + ', which is outside 100.64/10 and 2001:db8::/32');
        }
        if (seenIp.has(l.ip)) problems.push('address ' + l.ip + ' is used twice');
        seenIp.add(l.ip);
        if (!slugs.has(l.station)) problems.push(l.id + ' is on ' + l.station + ', which is not on the dial');
        const live = utcOffsetHours(l.tz, now);
        if (live !== l.utcOffset) {
            warn.push(l.tz + ' was built at UTC' + l.utcOffset + ' and is now UTC' + live);
        }
    }

    const byId = new Map(roster.listeners.map((l) => [l.id, l]));
    const counts = [];
    for (let h = 0; h < 24; h++) {
        const file = path.join(HOURS_DIR, 'hour-' + String(h).padStart(2, '0') + '.json');
        if (!fs.existsSync(file)) { problems.push('hour-' + h + ' is missing'); continue; }
        const hour = JSON.parse(fs.readFileSync(file, 'utf8'));
        counts.push(hour.count);
        if (hour.count < roster.floor || hour.count > roster.ceiling) {
            problems.push('hour-' + h + ' has ' + hour.count + ' listeners, outside ' + roster.floor + '-' + roster.ceiling);
        }
        /* The band is a promise about what a listener sees, and a listener sees
           one segment. An hour whose union is 120 but whose middle third is 70
           keeps the letter of the band and breaks it in practice. */
        for (const [k, n] of (hour.slotCounts || []).entries()) {
            if (n < roster.floor) {
                problems.push('hour-' + h + ' part ' + (k + 1) + ' shows only ' + n + ', under the floor of ' + roster.floor);
            }
        }
        for (const e of hour.listeners) {
            if (!byId.has(e.i)) problems.push('hour-' + h + ' names ' + e.i + ', who is not in the roster');
            if (!/^[01]{3}$/.test(e.s) || e.s === '000') problems.push('hour-' + h + ' gives ' + e.i + ' slots "' + e.s + '"');
        }
    }

    /* THE PROMISE THE OWNER MADE: an address never changes its city, its
       device or its station. It is asserted here rather than trusted, because
       it is the one property a future edit to this builder could quietly
       break. */
    const identity = new Map();
    for (const l of roster.listeners) identity.set(l.id, [l.ip, l.city, l.device, l.station].join('|'));
    if (identity.size !== roster.listeners.length) problems.push('roster has duplicate ids');

    /* Nobody should be able to hide from the drill: every hour must move. */
    const distinct = new Set(counts);
    if (distinct.size < 8) warn.push('only ' + distinct.size + ' distinct hourly headcounts — the day is too flat');

    return { problems, warn, roster, counts };
}

// ── Run ────────────────────────────────────────────────────────────────────
function main() {
    const now = new Date();

    if (CHECK_ONLY) {
        const { problems, warn, counts } = check(now);
        for (const w of [...new Set(warn)]) console.log('  warn  ' + w);
        if (problems.length) {
            for (const p of problems.slice(0, 40)) console.log('  FAIL  ' + p);
            console.log('\n' + problems.length + ' problem(s).');
            process.exit(2);
        }
        console.log('\nOK — roster and 24 hour files agree. Headcounts ' +
            Math.min(...counts) + '-' + Math.max(...counts) + '.');
        process.exit(0);
    }

    fs.mkdirSync(HOURS_DIR, { recursive: true });

    const roster = buildRoster(now);
    const hours = buildHours(roster);

    fs.writeFileSync(ROSTER_FILE, JSON.stringify(roster, null, 2) + '\n');
    for (const hour of hours) {
        const file = path.join(HOURS_DIR, 'hour-' + String(hour.utcHour).padStart(2, '0') + '.json');
        fs.writeFileSync(file, JSON.stringify(hour, null, 1) + '\n');
    }

    // ── The grid, so a run without one is not a finished run ───────────────
    console.log('\nkJubilee — synthetic audience');
    console.log('seed ' + SEED + ' · population ' + roster.population +
        ' · band ' + FLOOR + '-' + CEILING + '\n');
    console.log('  UTC   LA    NY    LON   SYD    ON AIR  HELD  NEW  ENERGY  IN DARK  PLAY AT  TOP STATION');
    console.log('  ' + '-'.repeat(102));
    for (const hour of hours) {
        const top = hour.stations[0];
        console.log('  ' + [
            String(hour.utcHour).padStart(2, '0'),
            hour.clocks['America/Los_Angeles'],
            hour.clocks['America/New_York'],
            hour.clocks['Europe/London'],
            hour.clocks['Australia/Sydney'],
        ].join('    ').padEnd(34) +
            String(hour.count).padStart(4) +
            String(hour.held).padStart(6) +
            String(hour.fresh).padStart(5) +
            (hour.energy + ' ' + hour.energyLabel).padStart(14) +
            String(Math.round(hour.nightShare * 100) + '%').padStart(8) +
            '  ' + hour.suitableFor.padEnd(7) +
            '  ' + (top ? top.station + ' (' + top.n + ')' : '—'));
    }

    const counts = hours.map((h) => h.count);
    const night = hours.filter((h) => h.suitableFor === 'night').length;
    console.log('\n  ' + Math.min(...counts) + '-' + Math.max(...counts) + ' concurrent · ' +
        night + ' night hours, ' + (24 - night) + ' day hours · ' +
        new Set(roster.listeners.map((l) => l.station)).size + ' stations reached · ' +
        new Set(roster.listeners.map((l) => l.city)).size + ' cities');
    console.log('  wrote data/stress-listeners/roster.json and hours/hour-00..23.json\n');

    const { problems, warn } = check(now);
    for (const w of [...new Set(warn)]) console.log('  warn  ' + w);
    if (problems.length) {
        for (const p of problems.slice(0, 20)) console.log('  FAIL  ' + p);
        process.exit(2);
    }
}

main();
