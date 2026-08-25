#!/usr/bin/env node
/**
 * build-station-manifest.js — generates a station's `delivery/music.json`
 * from the canonical kJubilee music repository.
 *
 * Per BR-G2 (docs/Radio-BRD.md) every station's playable catalog is declared
 * by manifest JSON under `/cdn/radio/<STATION_ID>/delivery/`. Nothing plays
 * that isn't in a manifest. This tool builds the `music.json` half of that
 * set for the language stations, straight from `songid-registry.tsv` — the
 * SongID ledger is the authority, so a track can never reach a manifest
 * under an ID the rotation and play logs don't already know.
 *
 * Selection is declarative: a station names a language and an artist pool,
 * and every ledger row matching both is included. Re-running after an ingest
 * picks up the new tracks with no edit here — which is the point, since 11 of
 * the 12 Inspire Family members have artist codes reserved but no audio in
 * the repository yet.
 *
 * Usage:
 *   node tools/build-station-manifest.js --station HM332.16-RO --dry-run
 *   node tools/build-station-manifest.js --station HM332.16-RO
 *   node tools/build-station-manifest.js --all
 *
 * Output: <CDN_ROOT>/radio/<STATION_ID>/delivery/music.json, or --out <path>.
 *
 * --url-layout picks which CDN the track URLs address. `canonical` is the
 * default and the only correct choice for anything that goes to air:
 *
 *   canonical  (default) the kJubilee repository at J:\kjubilee.com\music,
 *              served as /cdn/music/<artist>/<lang>/<album>/HMX....mp3 and
 *              backed by the cdn.kjubilee.com bucket in production. Relative,
 *              so the same manifest is correct in dev and in prod.
 *   source     LEGACY. Absolute URLs into cdn.jubileeverse.com, the production
 *              tree of the *upstream* projects. Kept only to read manifests
 *              built before the repository existed. DO NOT build new station
 *              manifests with this: a station must play the kJubilee copy of a
 *              track, not another site's master — see the "Where the audio
 *              lives" rule in docs/MUSIC-REPOSITORY-SPEC.md.
 *
 * Either way the SongID ledger decides *which* tracks are in the manifest —
 * only the URL that points at the bytes differs.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/* HM 313.12 is selected by a WORD rather than by an artist or a genre — the
   songs that sing "Yeshua" rather than "Jesus". Nothing in the ledger records
   that, so it is derived from the lyric sheets by tools/scan-lyrics-for-name.js
   and read here. Re-run that tool after an ingest and the station grows on its
   own; see the station entry below for why it takes albums and not tracks. */
const YESHUA = require('../data/yeshua-selection.json');

// ── Roots ────────────────────────────────────────────────────────────────
// The music repository and the CDN tree are siblings under J:\kjubilee.com —
// `music/` is served as /cdn/music/* and `radio/` as /cdn/radio/*.
const CDN_ROOT   = process.env.CDN_LOCAL_ROOT || 'J:\\kjubilee.com';
const MUSIC_ROOT = process.env.MUSIC_LOCAL_ROOT || path.join(CDN_ROOT, 'music');
const REGISTRY   = path.join(MUSIC_ROOT, 'songid-registry.tsv');
const CATALOG_CONFIG = path.join(__dirname, 'music-ingest', 'catalog-config.json');

// ── The twelve Inspire Family members ────────────────────────────────────
// The network persona registry (BR-F1) — the same twelve carried by
// tools/build-home-data.js MEMBERS and by catalog-config.json artist_codes.
// Deliberately NOT derived from artist_codes: that map also holds the group
// acts (kingdom-pulse, radiant-stones), which are not family members and
// must not leak into a family-only station.
const INSPIRE_FAMILY = {
    'jubilee-inspire':  'Jubilee Inspire',
    'melody-inspire':   'Melody Inspire',
    'zariah-inspire':   'Zariah Inspire',
    'elias-inspire':    'Elias Inspire',
    'eliana-inspire':   'Eliana Inspire',
    'caleb-inspire':    'Caleb Inspire',
    'imani-inspire':    'Imani Inspire',
    'zev-inspire':      'Zev Inspire',
    'amir-inspire':     'Amir Inspire',
    'nova-inspire':     'Nova Inspire',
    'santiago-inspire': 'Santiago Inspire',
    'tahoma-inspire':   'Tahoma Inspire',
};

// ── Catalogues ───────────────────────────────────────────────────────────
// Bodies of work that are not one of the twelve personas. Torah Sings is the
// Bible sung book by book; thirteen personas perform it, but the catalogue —
// and the station — is the work, not any one voice. Kept out of INSPIRE_FAMILY
// so a family-only station cannot silently absorb 1,749 Torah Sings tracks.
const CATALOGUES = {
    'torah-sings': 'Torah Sings',
    // The children's party act, its own brand with its own site. In here for
    // the same reason Torah Sings is: a station that selects "the Inspire
    // Family" must not quietly pick up 338 kids' party tracks.
    'party-giggles': 'Party Giggles',
    // The second children's act, for the younger end: God's Little Lambs is
    // aimed at 3-5s where Jubilee Kids Party is 6-8s. Same reason it is here
    // rather than in INSPIRE_FAMILY - a family-only station must not absorb
    // another 357 kids' tracks.
    'tiny-tiggles': 'My Tiny Tiggles',
};

// ── Country Gospel selection ─────────────────────────────────────────────
// A format station cannot be selected by genre code. The 4-char code names the
// *persona's* lane, not what an individual album was actually produced as, so
// selecting on CW*/CF* returns the two country personas and misses two complete
// country records filed under other personas' codes.
//
// The three tiers below were established by reading each album's declared style
// prose (the "Styles:" blocks in the source lyrics), not by counting instrument
// names — a raw instrument scan flags Tahoma's Hawaiian kīkākila steel guitar
// and Nova's Celtic fiddle as country, which would put ~60 wrong songs on air.
//
//   artists  whole-catalogue: both country personas, every EN album.
//   albums   complete country records sitting under a non-country genre code.
//   songs    individual country tracks on albums that are otherwise not country.
//
// To narrow the station to whole albums only, delete `songs`.
const COUNTRY_SELECTION = {
    // Elias Inspire (CWBA — Country/Cowboy/Western × Bluegrass Americana) and
    // Eliana Inspire (CFBA — Country Folk × Bluegrass Americana).
    artists: ['elias-inspire', 'eliana-inspire'],
    albums: [
        'CAIM1005EN',  // Caleb — Faithful Witness: "country-folk × Americana", all 12 tracks
        'THIM1026EN',  // Tahoma — Good Road Travelin': "country-gospel", pedal steel + harmonica
    ],
    songs: [
        // Tahoma — The Narrow Road Home ("acoustic country")
        'AOBCA74NN7QS', 'JD3UAA7VTNX1', 'CQ53V7L6XEUG', 'LC0T4P6NR3JV', 'O4KNHCUJMVFI',
        // Tahoma — Going Home Together (banjo/mandolin/upright bass/boot-stomp)
        'JE251TUSB6PH', 'NR3J22ATNRGZ', '3AQHVK60SF6W', 'MZWNHQSSSSGO',
        // Tahoma — Return to Center
        'PW64YT4HCT8H', 'EIWMFOWXA3Y2', 'K3AN7SW8BJ1X',
        // Tahoma — assorted single country cuts
        '046K0IN37282', 'D9G3NB33JMN6',   // Missing No More
        'ZOU0JMYF2PPH', '1Q02T8CPF6KP',   // Sovereignty Song
        'Y0H2CY6354C6', 'GQIUBTZPGN0K',   // The Maker's Breath
        'I14IZAXZ3P1D', '0G5R9KBUXX34',   // Hozho Restored
        'B1R3X0LZQKDS',                   // Dance Before the Maker — "Boots Under the Back Pew"
        'B4RCE7RYHLMW',                   // Gathered Around the Cross — "The Ridge Road Cross"
        '4ESN6SJ5XZKQ',                   // Strong Heart Walking
        // Jubilee / Nova single cuts
        'A3PFYLCLM3MQ',                   // Hiding Place — "Old Rugged Cross Stands"
        'F6RRPBWMLZ6W',                   // Roots by the River — "Forever Bearing"
        'MDA0IP0CUQCH',                   // Gathering Fire — "The Coals Beneath the Ash"
        // Deliberately excluded: SAIM1030EN t01 "Tu Palabra Es Mi Pan" — one passing
        // "country-pop" reference on a Latin album with a Spanish title. Off-format.
    ],
};

// ── Station definitions ──────────────────────────────────────────────────
// Keyed by station id — the folder name under /cdn/radio/. `pool` names the
// artist roster; `language` matches the ledger's Lang column.
//
// ONE STATION, ONE LANGUAGE. `language` must always name a language — never
// null. A listener tuned to an English station who hits a Romanian track does
// not think "how multicultural", they think the station is broken, and they
// leave. The catalogue is deep in eleven languages precisely so each can have
// its own frequency; mixing them throws that away and costs the audience.
// Build a language edition instead: same pool, same select, different `language`.
const STATIONS = {
    // The flagship. `language: null` means every language in the repository -
    // this station is the whole Inspire Family catalogue rather than a language
    // edition, which is also the only way it carries all twelve members today:
    // Melody Inspire's English albums are not ingested yet, so an English-only
    // build of this station would silently be eleven of twelve.
    // The flagship, and now a FORMAT rather than the whole catalogue: celebration
    // praise mixed with contemporary Christian. Jubilee's anthemic worship and
    // Caleb's CCM sit in the same radio lane — a listener who likes one will sit
    // through the other — where Latin, Hebraic, indigenous and country do not,
    // which is why they have their own frequencies.
    'HM388.70-EN': {
        slug: 'jubilee-radio',
        name: 'KJubilee',
        hm: '388.70',
        mount: 'jubilee',   // Icecast mount + playlist basename on the radio host
        // English only. EVERY station is single-language — see the rule below.
        // This one carried all languages historically; that was wrong for a
        // listener, who hears a Romanian track land in the middle of an English
        // set and leaves. The other-language tracks are not lost, they belong on
        // that language's own frequency.
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Seattle',
        timezone: 'America/Los_Angeles',
        pool: 'inspire-family',
        // CAIM1027EN kingdom-revealed is excluded: all twelve of its tracks are
        // BYTE-IDENTICAL to CAIM1026EN dance-and-rejoice under different titles,
        // so airing both played the same twelve recordings under twenty-four
        // names. Verified by hash 2026-08-23. The files stay in the repository.
        select: {
            artists: ['jubilee-inspire', 'caleb-inspire', 'zev-inspire', 'nova-inspire'],
            exclude: { albums: ['CAIM1027EN'] },
        },
    },
    'HM332.16-RO': {
        slug: 'jubilee-praise-romana',
        name: 'Jubilee Praise (Română)',
        hm: '332.16',
        mount: 'romana',   // Icecast mount + playlist basename on the radio host
        language: 'RO',
        // Every Romanian track in the repository, from whichever of the twelve
        // recorded it — owner decision, 2026-08-22. A restricted roster left 83
        // of the 262 Romanian tracks with nowhere to play, and Romanian is one
        // of only two languages deep enough to carry a station at all. No
        // `select`: the language filter and the family pool are the whole rule,
        // so a future Romanian ingest by any member joins on the next build.
        languageName: 'Romanian',
        languageTag: 'ro-RO',
        mode: 'OHI',
        hostCity: 'București',
        timezone: 'Europe/Bucharest',
        pool: 'inspire-family',
    },
    // A format station rather than a language edition. The two others take
    // everything a pool records; this one takes only what is actually country,
    // which no single ledger column can express — the genre code names the
    // *persona's* lane, not each album's production, so Caleb's country-folk
    // record sits under CCPW and Tahoma's country-gospel record under INCL.
    // `select` is therefore explicit; see the block above it for how the three
    // tiers were established.
    'HM335.16-EN': {
        slug: 'country-gospel',
        name: 'Gospel Country',
        hm: '335.16',
        mount: 'country-gospel',   // Icecast mount + playlist basename on the radio host
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Nashville',
        timezone: 'America/Chicago',
        pool: 'inspire-family',
        // Elias's cowboy/Western and Eliana's country-folk, mixed. They are
        // twins in the persona roster and adjacent on any country dial.
        select: { artists: ['elias-inspire', 'eliana-inspire'] },
    },
    // A persona station: Imani Inspire's whole English catalogue. Her lane
    // (PCGC — Pentecostal/Charismatic Praise × Gospel Choir/Afro-Gospel) *is*
    // the format, so unlike Country Gospel this one needs no album picking.
    'HM339.18-EN': {
        slug: 'jubilee-gospel-fire',
        name: 'Pentecostal Shout',
        hm: '339.18',
        mount: 'gospel-fire',   // Icecast mount + playlist basename on the radio host
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Memphis',
        timezone: 'America/Chicago',
        pool: 'inspire-family',
        // Imani's COGIC praise-break gospel with Zariah's Afro-Caribbean
        // fusion — one Spirit-filled, percussive, shout-driven lane.
        select: { artists: ['imani-inspire', 'zariah-inspire'] },
    },
    // The children's party catalogue. NOT an Inspire Family persona: Party
    // Giggles is its own act with its own site (gopartygiggles.com), which is
    // why the station's host in the home-page catalogue is the brand rather
    // than one of the twelve.
    //
    // Selected explicitly by artist, so it grows when more Party Giggles albums
    // are ingested and never picks up anyone else's tracks.
    'HM329.12-EN': {
        slug: 'jubilee-kids-party',
        name: 'Jubilee Kids Party',
        hm: '329.12',
        mount: 'kids-party',   // Icecast mount + playlist basename on the radio host
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Nashville',
        timezone: 'America/Chicago',
        pool: 'catalogues',
        select: { artists: ['party-giggles'] },
    },
    // HM 325.18 God's Little Lambs - My Tiny Tiggles, for the youngest listeners.
    //
    // The catalogue's own station, and the second children's act on the dial.
    // Kids 3-5 where Jubilee Kids Party is 6-8, which is why the two are
    // separate stations selecting separate artists rather than one shelf of
    // everything filed as children's music.
    'HM325.18-EN': {
        slug: 'gods-little-lambs',
        name: "God's Little Lambs",
        hm: '325.18',
        mount: 'little-lambs',   // Icecast mount + playlist basename on the radio host
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Nashville',
        timezone: 'America/Chicago',
        pool: 'catalogues',
        select: { artists: ['tiny-tiggles'] },
    },
    // The Bible sung book by book — 276 albums, ordered by the album code so the
    // catalogue runs Genesis to Revelation rather than alphabetically.
    'HM305.12-EN': {
        slug: 'torah-sings',
        name: 'Torah Sings',
        hm: '305.12',
        mount: 'torah-sings',   // Icecast mount + playlist basename on the radio host
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'OHI',
        hostCity: 'Jerusalem',
        timezone: 'Asia/Jerusalem',
        pool: 'catalogues',
        select: { artists: ['torah-sings'] },
    },
    // Santiago's Latin and South American worship, sung in English. The music
    // is Latin; the words are not — which is the whole proposition, and why it
    // is an EN station rather than the Spanish edition. His Spanish-language
    // material is only 24 tracks, nowhere near enough to carry a frequency.
    'HM376.15-EN': {
        slug: 'latin-worship',
        name: 'Latin Worship (Sung in English)',
        hm: '376.15',
        mount: 'latin-worship',   // Icecast mount + playlist basename on the radio host
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Miami',
        timezone: 'America/New_York',
        pool: 'inspire-family',
        // Santiago's catalogue minus his nine Caribbean records. SAIM1043-1051
        // are soca, dancehall, steelpan, calypso, kompa and drill — the lane
        // HM 347.14 Riddim and Rhyme exists to carry. They aired here only
        // because the rule said "everything by Santiago". Audited 2026-08-23.
        select: {
            artists: ['santiago-inspire'],
            exclude: { albums: ['SAIM1043EN', 'SAIM1044EN', 'SAIM1045EN', 'SAIM1046EN', 'SAIM1047EN',
                       'SAIM1048EN', 'SAIM1049EN', 'SAIM1050EN', 'SAIM1051EN'] },
        },
    },
    // Zev's Messianic and Hebraic catalogue: feast-day celebration, Hebraic
    // chant and modern electronic-cinematic fusion. OHI mode — this is the one
    // persona that names God as Yahuah and Yeshua by default, so the station
    // carries that naming end to end rather than mixing conventions.
    'HM377.70-EN': {
        slug: 'hebraic-celebrations',
        name: 'Hebraic Celebrations',
        hm: '377.70',
        mount: 'hebraic-celebrations',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'OHI',
        hostCity: 'Jerusalem',
        timezone: 'Asia/Jerusalem',
        pool: 'inspire-family',
        select: { artists: ['zev-inspire'] },
    },
    // Tahoma's Pacific Island catalogue: slack-key ki ho'alu, 'ukulele, island
    // reggae-pop, Jawaiian and hapa haole worship.
    //
    // Renamed from 'Many Waters' on 2026-08-23. That name promised indigenous
    // and tribal worship — powwow, frame drum, a cappella lament — and an audit
    // of all 599 tracks found NOT ONE reference to a powwow drum, cedar flute or
    // vocable, while 301 are explicitly Hawaiian. One track says so outright:
    // "not vocables or chant." The roster was always coherent; only the label
    // was wrong, so the label is what changed.
    'HM399.18-EN': {
        slug: 'island-hallelujah',
        name: 'Island Hallelujah',
        hm: '399.18',
        mount: 'island-hallelujah',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Seattle',
        timezone: 'America/Los_Angeles',
        pool: 'inspire-family',
        select: { artists: ['tahoma-inspire'] },
    },
    // Zariah's Afro-Caribbean fusion: reggae, dancehall, soca, Afrobeats and
    // gospel-soul under teaching hymnody. Her catalogue also airs inside
    // Pentecostal Shout — deliberate; a station is a way in, not an inventory.
    'HM347.14-EN': {
        slug: 'riddim-and-rhyme',
        name: 'Riddim and Rhyme',
        hm: '347.14',
        mount: 'riddim-and-rhyme',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Kingston',
        timezone: 'America/Jamaica',
        pool: 'inspire-family',
        // Zariah's whole catalogue, plus Santiago's nine Caribbean records moved
        // off Latin Worship on 2026-08-23 — soca, dancehall, steelpan, calypso,
        // kompa and drill belong to this format, not to a Latin one.
        select: {
            artists: ['zariah-inspire'],
            albums: ['SAIM1043EN', 'SAIM1044EN', 'SAIM1045EN', 'SAIM1046EN', 'SAIM1047EN',
                       'SAIM1048EN', 'SAIM1049EN', 'SAIM1050EN', 'SAIM1051EN'],
        },
    },
    /* CELEBRATE YESHUA! — a station named for a word.
       ----------------------------------------------------------------------
       Its catalogue is not "an artist" or "a genre" but "the songs that sing
       Yeshua rather than Jesus". No ledger column carries that; it is read out
       of the lyric sheets by tools/scan-lyrics-for-name.js, which writes
       data/yeshua-selection.json.

       IT TAKES ALBUMS, NOT TRACKS, AND THAT IS DELIBERATE. Eighty-nine songs
       sing the name, but seventy-seven of them have no audio — five whole
       records (JEIM1024EN, 1068EN, 1082EN, 1083EN, 1084EN) are still
       lyrics_only_pending_audio. Selecting the twelve tracks that do exist
       would put twelve songs on a twenty-four hour frequency and repeat them
       roughly thirty times a day, which is the same starvation that took Kids
       Party off the air. So the station takes the four COMPLETE records those
       tracks came from — forty-eight tracks, all Jubilee, all of a piece with
       the theme — and the strictly-Yeshua songs sit inside them.

       The album list is generated, not typed. When JEIM1068EN and the rest are
       recorded, re-running the scan adds them here with no edit to this file.
       Owner decision, 2026-08-23. */
    'HM313.12-EN': {
        slug: 'jubilee-ccm',
        name: 'Celebrate Yeshua!',
        hm: '313.12',
        mount: 'celebrate-yeshua',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Jerusalem',
        timezone: 'Asia/Jerusalem',
        pool: 'inspire-family',
        select: { albums: YESHUA.albums },
    },
    // Nova's Celtic and European ambient: contemplative cinematic and ambient
    // healing. Her whole English catalogue — her synthwave/chillwave records are
    // real but exist only in Dutch, Romanian, Swedish and Thai, so they belong to
    // those languages' frequencies, not this one.
    //
    // This is also the overnight slot. It replaces the ambient station lost when
    // HM 376.15 became Latin Worship, and the Radio Engine spec names night and
    // soaking programming as a signature feature.
    'HM379.14-EN': {
        slug: 'midnight-praise',
        name: 'Midnight Praise',
        hm: '379.14',
        mount: 'midnight-praise',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Dublin',
        timezone: 'Europe/Dublin',
        pool: 'inspire-family',
        select: { artists: ['nova-inspire'] },
    },
    // Amir's Arabic and Middle Eastern catalogue: maqam-based worship and
    // acoustic lament. Client-side only — no Icecast mount, the browser streams
    // it straight from the CDN.
    //
    // Divine-name discipline applies to this persona's material specifically:
    // God, Jesus, al-Masih; never "Allah" in a lyric file.
    /* YES AND AMEN — the SingItDone declaration property, on the dial.
       ----------------------------------------------------------------------
       Its catalogue is a BODY OF WORK, not an artist and not a genre. All the
       promises of Elohim are Yes and Amen in Him (2 Corinthians 1:20), and
       SingItDone is that verse turned into records: first-person declarations
       of covenant identity, sung by twelve voices, one album each, under the
       property's own guard — "sing what He has already said". A declaration
       does not make the thing true; it announces what He has already spoken.

       ONE PROPERTY, TWELVE VOICES, ONE FREQUENCY. Every persona on the roster
       has an album here, so no single-artist station could carry it and a
       genre code could not find it: the 4-char code names a persona's lane, and
       these records deliberately keep that lane as their SECONDARY under a
       shared Covenant Worship primary (CV**). What they actually share is the
       2001-2003 numbering series the property files them in, which is why the
       selection is a pattern over album codes rather than a typed list.

       IT IS OHI, AND THAT IS THE PROPERTY'S OWN DECLARATION. Yahuah, Yeshua,
       Elohim, Ruach HaKodesh in the feminine — stated in the SingItDone README
       and in twenty-seven of its thirty-four blueprints, not inferred from
       counting divine names in the lyrics. Eleven of these twelve personas are
       CCI on their own jubilujah catalogues; the mode belongs to the property,
       not to the voice.

       Elias Inspire fronts it. His is the album the property opens with —
       "Chosen And Appointed", not self-appointed and not self-sustained — and
       apostolic commission is the register the whole catalogue declares in.

       191 tracks across sixteen records today. Eighteen more albums are written
       and awaiting audio; each joins this station the moment it is ingested,
       with no edit to this file. */
    'HM314.88-EN': {
        slug: 'yes-and-amen',
        name: 'Yes and Amen',
        hm: '314.88',
        mount: 'yes-and-amen',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'OHI',
        hostCity: 'Nashville',
        timezone: 'America/Chicago',
        pool: 'inspire-family',
        // The SingItDone 2001-2003 series, any persona prefix. Anchored at both
        // ends so it cannot reach a jubilujah 1xxx record or a five-digit code.
        select: { albumPattern: '^[A-Z]{4}200[0-9][A-Z]{2}$' },
    },
    'HM345.24-EN': {
        slug: 'ancient-paths',
        name: 'The Ancient Paths',
        hm: '345.24',
        mount: 'ancient-paths',
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Amman',
        timezone: 'Asia/Amman',
        pool: 'inspire-family',
        select: { artists: ['amir-inspire'] },
    },
};

// ── Album display titles ─────────────────────────────────────────────────
// The repository stores ASCII-transliterated slugs (diacritics are stripped
// for filename safety — see MUSIC-REPOSITORY-SPEC), so in a language that
// uses them the real album title cannot be recovered from the slug:
// "lasa-le-la-cruce" must render as "Lasă-le la Cruce" in the player.
//
// Titles are resolved in this order:
//   1. ALBUM_TITLES below — a manual override, always wins.
//   2. The source album's lyrics file, named "<Artist>-<Album Title>-lyrics.md",
//      which carries the full diacritics. Same source tree the ingest reads.
//   3. Title-cased slug.
// Step 2 is best-effort: on a host without the source tree mounted the build
// still succeeds, it just falls back to step 3.
const SOURCE_ROOT = process.env.MUSIC_SOURCE_ROOT || 'J:\\jubilujah.com\\music\\inspire';

const ALBUM_TITLES = {
    // Per-track lyrics files, so no album-level name to read.
    JEIM1071RO: 'Ziua Tatălui',
};

// Host the production CDN is published under. The player rewrites this prefix
// to /cdn/ at playback time (radio.html localizeCdnUrl), so an absolute URL
// here resolves through whichever origin is serving the page.
const SOURCE_CDN_BASE = process.env.PUBLIC_SOURCE_CDN_URL || 'https://cdn.jubileeverse.com';
// The kJubilee CDN — where the canonical repository is actually published.
// KJ_CDN_URL, not PUBLIC_CDN_URL: production defines the latter as the SOURCE
// cdn, and honouring it here would point an airing station at another project's
// host. See the same note in build-schedule-manifest.js.
const KJ_CDN_BASE = process.env.KJ_CDN_URL || 'https://cdn.kjubilee.com';
const SOURCE_CDN_PREFIX = '/music/albums/inspire';

// Torah Sings is its own production with its own tree and its own CDN prefix:
// books at the top, albums inside them, and the album folder named
// "<CODE> <Title>" rather than "<CODE>-<slug>". Nothing about the Inspire
// Family layout applies to it, so it gets its own resolver rather than a
// special case threaded through that one.
const TORAH_ROOT = process.env.TORAH_SOURCE_ROOT || 'J:\\torahsings.com\\music';
const TORAH_CDN_PREFIX = '/torahsings';

// albumCode -> "<NN_Book>/<CODE Title>", built once by walking the book folders.
let torahAlbumDirs = null;

function torahIndex() {
    if (torahAlbumDirs) return torahAlbumDirs;
    torahAlbumDirs = new Map();
    let books = [];
    try {
        books = fs.readdirSync(TORAH_ROOT, { withFileTypes: true })
                  .filter(d => d.isDirectory()).map(d => d.name);
    } catch (e) { return torahAlbumDirs; }   // tree not mounted
    for (const book of books) {
        let albums = [];
        try {
            albums = fs.readdirSync(path.join(TORAH_ROOT, book), { withFileTypes: true })
                       .filter(d => d.isDirectory()).map(d => d.name);
        } catch (e) { continue; }
        for (const album of albums) {
            // Four digits as well as five: two Exodus albums are named
            // ANSMX2003EN / ANSMX2007EN, missing the book's leading zero. The
            // ledger carries the same typo, so the two sides still agree and
            // the only thing a strict pattern would achieve is dropping them.
            const m = /^([A-Z]{5}\d{4,5}[A-Z]{2})\s/.exec(album);
            if (m) torahAlbumDirs.set(m[1], book + '/' + album);
        }
    }
    return torahAlbumDirs;
}

/// The album folder is "<CODE> <Title>", so the title is already there in full
/// punctuation - no need to reconstruct it from the ASCII slug.
function torahAlbumTitle(albumCode) {
    const rel = torahIndex().get(albumCode);
    if (!rel) return null;
    const folder = rel.slice(rel.indexOf('/') + 1);
    return folder.slice(albumCode.length).trim() || null;
}

/// Compare a title to a filename ignoring case, punctuation and spacing -
/// enough to survive "05  Cast Your Bread" having two spaces in it.
function looseKey(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function torahTrackUrl(albumCode, trackNumber, title) {
    const rel = torahIndex().get(albumCode);
    if (!rel) return null;
    let files = [];
    try { files = fs.readdirSync(path.join(TORAH_ROOT, rel.replace('/', path.sep), 'tracks')); }
    catch (e) { return null; }
    const mp3s = files.filter(f => /\.mp3$/i.test(f));

    let file = mp3s.find(f => {
        const m = /^(\d{1,3})\D/.exec(f);
        return m && parseInt(m[1], 10) === trackNumber;
    });

    // The track number is not always shared between the ledger and the source.
    // ANSMX21002EN is numbered 07-12 in the ledger and 01-06 on disk, so a
    // number-only lookup silently loses the whole album. The title is the same
    // on both sides, so fall back to that before giving up.
    if (!file && title) {
        const want = looseKey(title);
        file = mp3s.find(f => looseKey(f.replace(/^\d{1,3}[\s._-]*/, '').replace(/\.mp3$/i, '')) === want);
    }
    if (!file) return null;
    return SOURCE_CDN_BASE + TORAH_CDN_PREFIX + '/' +
           (rel + '/tracks/' + file).split('/').map(encodeURIComponent).join('/');
}

const sourceAlbumDirs = new Map(); // artistSlug -> Map(albumCode -> [dir names])

/// Locate the source folder for one album.
///
/// An album code is NOT unique on disk. `IMIM1009EN-healing-streams` sits beside
/// `IMIM1009EN-healing-streams-river-pocket`, and `CAIM1051EN-...` beside a
/// `.zip` of the same name - so keying on the code alone silently resolved to
/// whichever entry readdir happened to return last, and two albums' worth of
/// tracks fell out of the manifest because the winner had no tracks/ folder.
///
/// The ledger knows which one it means: its AlbumSlug is the folder's suffix.
/// Exact match wins; failing that, any candidate that actually holds audio.
function sourceAlbumDir(artistSlug, albumCode, albumSlug) {
    if (!sourceAlbumDirs.has(artistSlug)) {
        const byCode = new Map();
        let entries = [];
        try {
            entries = fs.readdirSync(path.join(SOURCE_ROOT, artistSlug), { withFileTypes: true });
        } catch (e) { /* not mounted */ }
        for (const ent of entries) {
            // Directories only: a sibling archive matches the same prefix and
            // has no tracks/ inside it.
            if (!ent.isDirectory()) continue;
            const m = /^([A-Z]{4}\d{4}[A-Z]{2})[-_ ]/.exec(ent.name);
            if (!m) continue;
            if (!byCode.has(m[1])) byCode.set(m[1], []);
            byCode.get(m[1]).push(ent.name);
        }
        sourceAlbumDirs.set(artistSlug, byCode);
    }

    const names = sourceAlbumDirs.get(artistSlug).get(albumCode);
    if (!names || !names.length) return null;
    const full = n => path.join(SOURCE_ROOT, artistSlug, n);

    if (albumSlug) {
        const exact = names.find(n => n.slice(albumCode.length + 1) === albumSlug);
        if (exact) return full(exact);
    }
    const withAudio = names.find(n => {
        try { return fs.readdirSync(path.join(full(n), 'tracks')).length > 0; }
        catch (e) { return false; }
    });
    return full(withAudio || names[0]);
}

// Resolve the production CDN URL for one track by reading the real filename
// out of the source album's tracks/ folder. Reconstructing "<NN> <Title>.mp3"
// from the ledger would be a guess — separators and punctuation vary between
// albums — and a guessed URL is a track that 404s mid-rotation.
const sourceTrackFiles = new Map(); // albumDir -> Map(trackNumber -> filename)

function sourceTrackFilename(artistSlug, albumCode, albumSlug, trackNumber) {
    const dir = sourceAlbumDir(artistSlug, albumCode, albumSlug);
    if (!dir) return null;
    if (!sourceTrackFiles.has(dir)) {
        const byNum = new Map();
        let files = [];
        try { files = fs.readdirSync(path.join(dir, 'tracks')); } catch (e) { /* no audio */ }
        for (const name of files) {
            if (!/\.mp3$/i.test(name)) continue;
            const m = /^(\d{1,3})\D/.exec(name);
            if (m) byNum.set(parseInt(m[1], 10), name);
        }
        sourceTrackFiles.set(dir, byNum);
    }
    return sourceTrackFiles.get(dir).get(trackNumber) || null;
}

function sourceTrackUrl(artistSlug, albumCode, albumSlug, trackNumber) {
    const dir = sourceAlbumDir(artistSlug, albumCode, albumSlug);
    const file = sourceTrackFilename(artistSlug, albumCode, albumSlug, trackNumber);
    if (!dir || !file) return null;
    return SOURCE_CDN_BASE + SOURCE_CDN_PREFIX + '/' + artistSlug + '/' +
           path.basename(dir) + '/tracks/' + encodeURIComponent(file);
}

function albumTitleFromLyrics(artistSlug, artistName, albumCode, albumSlug) {
    const dir = sourceAlbumDir(artistSlug, albumCode, albumSlug);
    if (!dir) return null;
    let files = [];
    try { files = fs.readdirSync(path.join(dir, 'lyrics')); } catch (e) { return null; }
    // Only the album-level sheet is named "<Artist>-<Album>-lyrics.md"; albums
    // with per-track sheets have no such file and fall through to the slug.
    const prefix = artistName + '-';
    const hits = files.filter(function (f) {
        return f.endsWith('-lyrics.md') && f.indexOf(prefix) === 0;
    });
    if (hits.length !== 1) return null;
    let title = hits[0].slice(prefix.length, -'-lyrics.md'.length).trim();
    // Some sheets carry the album's catalog position: "01-Keeper-of-Stories".
    title = title.replace(/^\d{1,3}-/, '');
    // Those same sheets also use dashes for spaces. Only rewrite when the title
    // has no spaces at all AND more than one dash, so a genuinely hyphenated
    // title like "Counter-Clockwise" survives intact.
    if (title.indexOf(' ') < 0 && (title.match(/-/g) || []).length > 1) {
        title = title.replace(/-/g, ' ');
    }
    return title || null;
}

// The album's own metadata is the most trustworthy title: correctly cased,
// correctly hyphenated ("Hand-Me-Down Faith"), full diacritics, and immune to
// the filename conventions that vary between tooling generations. It also
// catches sheets that are simply misnamed — EAIM1005EN "Hand-Me-Down Faith"
// ships a lyrics file called "...-04-Passing-It-Down-lyrics.md", which would
// otherwise put another album's name on it in the player.
// The album.json the ingest writes into the repository is the closest, most
// authoritative title: correct casing and punctuation, and readable without the
// upstream source tree mounted at all.
function albumTitleFromSidecar(musicRoot, artistSlug, lang, albumSlug) {
    try {
        const raw = fs.readFileSync(
            path.join(musicRoot, artistSlug, lang.toLowerCase(), albumSlug, 'album.json'), 'utf8');
        const t = JSON.parse(raw.replace(/^﻿/, '')).album.album_title;
        return (t && String(t).trim()) || null;
    } catch (e) { return null; }
}

function albumTitleFromMeta(artistSlug, albumCode, albumSlug) {
    const dir = sourceAlbumDir(artistSlug, albumCode, albumSlug);
    if (!dir) return null;
    try {
        const raw = fs.readFileSync(path.join(dir, 'album.meta.json'), 'utf8');
        const title = JSON.parse(raw.replace(/^﻿/, '')).album_title;
        return (title && String(title).trim()) || null;
    } catch (e) { return null; }
}

// ── MP3 duration ─────────────────────────────────────────────────────────
// Read straight off the frame headers — no ffprobe/ffmpeg dependency, which
// this box does not have. A Xing/Info or VBRI header carries the exact frame
// count; without one the file is CBR and size/bitrate is exact too.

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SAMPLE_RATES = {
    3: [44100, 48000, 32000, 0],  // MPEG 1
    2: [22050, 24000, 16000, 0],  // MPEG 2
    0: [11025, 12000, 8000, 0],   // MPEG 2.5
};

function id3v2Size(buf) {
    if (buf.length < 10 || buf.toString('latin1', 0, 3) !== 'ID3') return 0;
    // Syncsafe integer — 7 significant bits per byte.
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) |
                 ((buf[8] & 0x7f) << 7)  |  (buf[9] & 0x7f);
    const footer = (buf[5] & 0x10) ? 10 : 0;
    return 10 + size + footer;
}

function mp3DurationSeconds(file) {
    // Read a window off the front rather than the whole file. Everything this
    // needs - the ID3v2 tag length, the first frame header and the Xing/VBRI
    // block that follows it - lives in the first few tens of KB, and the
    // catalogue is thousands of multi-megabyte files on a network share: a full
    // read costs tens of GB of I/O to look at a few hundred bytes.
    const WINDOW = 256 * 1024;
    let buf, total;
    try {
        total = fs.statSync(file).size;
        const fd = fs.openSync(file, 'r');
        try {
            const want = Math.min(WINDOW, total);
            buf = Buffer.alloc(want);
            const got = fs.readSync(fd, buf, 0, want, 0);
            if (got < want) buf = buf.subarray(0, got);
        } finally { fs.closeSync(fd); }
    } catch (e) { return null; }

    const audioStart = id3v2Size(buf);
    // An ID3v1 trailer is a fixed 128-byte block that is not audio. It only
    // matters to the CBR fallback below, and it sits at the very end of the
    // file, so it is checked there rather than paid for on every track.
    const audioEnd = total;

    // Locate the first frame sync within a reasonable window past the tag.
    let f = -1;
    for (let i = audioStart; i < Math.min(audioStart + 65536, audioEnd - 4); i++) {
        if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) { f = i; break; }
    }
    if (f < 0) return null;

    const version   = (buf[f + 1] >> 3) & 0x03;   // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer     = (buf[f + 1] >> 1) & 0x03;   // 1 = Layer III
    const bitrateIx = (buf[f + 2] >> 4) & 0x0f;
    const sampleIx  = (buf[f + 2] >> 2) & 0x03;
    const channels  = (buf[f + 3] >> 6) & 0x03;   // 3 = mono

    if (layer !== 1 || version === 1) return null; // not Layer III, or reserved version
    const sampleRate = (SAMPLE_RATES[version] || [])[sampleIx];
    if (!sampleRate) return null;

    const isV1 = version === 3;
    const samplesPerFrame = isV1 ? 1152 : 576;

    // Xing/Info (LAME et al.) sits at a fixed offset from the frame header,
    // past the side-information block, whose size depends on version+channels.
    const sideInfo = isV1 ? (channels === 3 ? 17 : 32) : (channels === 3 ? 9 : 17);
    const xing = f + 4 + sideInfo;
    if (xing + 12 <= audioEnd) {
        const tag = buf.toString('latin1', xing, xing + 4);
        if (tag === 'Xing' || tag === 'Info') {
            const flags = buf.readUInt32BE(xing + 4);
            if (flags & 0x01) {
                const frames = buf.readUInt32BE(xing + 8);
                if (frames > 0) return (frames * samplesPerFrame) / sampleRate;
            }
        }
    }
    // Fraunhofer VBRI — always 32 bytes past the header, frame count at +14.
    const vbri = f + 4 + 32;
    if (vbri + 26 <= audioEnd && buf.toString('latin1', vbri, vbri + 4) === 'VBRI') {
        const frames = buf.readUInt32BE(vbri + 14);
        if (frames > 0) return (frames * samplesPerFrame) / sampleRate;
    }

    // No VBR header → constant bitrate, so bytes / byterate is exact. This is
    // the one path that cares where the audio really ends, so the 128-byte
    // ID3v1 trailer is checked here and only here.
    const bitrate = (isV1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIx];
    if (!bitrate) return null;
    let end = audioEnd;
    if (total >= 128) {
        try {
            const fd = fs.openSync(file, 'r');
            try {
                const tail = Buffer.alloc(3);
                fs.readSync(fd, tail, 0, 3, total - 128);
                if (tail.toString('latin1') === 'TAG') end -= 128;
            } finally { fs.closeSync(fd); }
        } catch (e) { /* keep the full length */ }
    }
    return (end - f) / (bitrate * 125); // kbps * 1000 / 8 bytes per second
}

// ── Registry ─────────────────────────────────────────────────────────────
function readRegistry() {
    const raw = fs.readFileSync(REGISTRY, 'utf8');
    const lines = raw.split(/\r?\n/).filter(function (l) { return l.trim().length; });
    const header = lines.shift().split('\t');
    const col = function (name) {
        const i = header.indexOf(name);
        if (i < 0) throw new Error('songid-registry.tsv is missing the "' + name + '" column');
        return i;
    };
    const ix = {
        songId: col('SongID'), filename: col('Filename'), artist: col('Artist'),
        albumCode: col('AlbumCode'), albumSlug: col('AlbumSlug'), track: col('Track'),
        title: col('Title'), genre: col('Genre'), year: col('Year'), lang: col('Lang'),
    };
    return lines.map(function (line) {
        const f = line.split('\t');
        return {
            songId: f[ix.songId], filename: f[ix.filename], artist: f[ix.artist],
            albumCode: f[ix.albumCode], albumSlug: f[ix.albumSlug],
            track: parseInt(f[ix.track], 10), title: f[ix.title],
            genre: f[ix.genre], year: parseInt(f[ix.year], 10), lang: f[ix.lang],
        };
    });
}

// ── Genre codes ──────────────────────────────────────────────────────────
// The 4-char field is primary+secondary; catalog-config.json is the naming
// authority for both halves (it is what the ingest writes them from).
function genreNames(config, code) {
    const names = [];
    const halves = [code.slice(0, 2), code.slice(2, 4)];
    for (const half of halves) {
        const label = config.genre_codes && config.genre_codes[half];
        if (label && names.indexOf(label) < 0) names.push(label);
    }
    return names;
}

function titleCase(slug) {
    return slug.split('-').map(function (w) {
        return w ? w[0].toUpperCase() + w.slice(1) : w;
    }).join(' ');
}

// ── Build ────────────────────────────────────────────────────────────────
function buildStation(stationId, urlLayout) {
    urlLayout = urlLayout || 'canonical';
    if (urlLayout !== 'source' && urlLayout !== 'canonical' && urlLayout !== 'cdn') {
        throw new Error('unknown --url-layout "' + urlLayout + '" (expected source, canonical or cdn)');
    }
    const station = STATIONS[stationId];
    const config = JSON.parse(fs.readFileSync(CATALOG_CONFIG, 'utf8'));
    const rows = readRegistry();

    const POOLS = {
        'inspire-family': INSPIRE_FAMILY,
        'catalogues': CATALOGUES,
    };
    const pool = POOLS[station.pool];
    if (!pool) {
        throw new Error('station ' + stationId + ': unknown artist pool "' + station.pool +
                        '" (known: ' + Object.keys(POOLS).join(', ') + ')');
    }

    // A null language takes the whole repository; a named one takes that
    // language only. A station may then narrow further with `select` — the
    // union of whole artists, whole albums, and individual SongIDs. Without
    // `select` the station takes everything its pool and language allow.
    const sel = station.select || null;
    const selArtists = new Set(sel && sel.artists || []);
    const selAlbums  = new Set(sel && sel.albums  || []);
    const selSongs   = new Set(sel && sel.songs   || []);
    // `albumPattern` admits every album code the regex matches, across every
    // artist in the pool. It exists for a station whose catalogue is a BODY OF
    // WORK rather than an artist or a genre: SingItDone's declaration albums are
    // twelve personas' records filed in one numbering series, and the series is
    // the only thing they have in common that the ledger records.
    //
    // A typed album list would have been the alternative, and it goes stale in
    // the one direction that is invisible: eighteen of those albums are written
    // but not yet recorded, and each one that gets audio would have to be
    // remembered here or silently miss the station it was made for. A pattern
    // grows on its own the way `artists` does.
    const selAlbumRe = sel && sel.albumPattern ? new RegExp(sel.albumPattern) : null;

    // `exclude` subtracts from whatever the include rules admitted. It exists so
    // a station can say "this artist, minus these albums" without listing the
    // other forty albums by hand — which is how a roster silently loses tracks
    // when new albums are ingested.
    const exc = sel && sel.exclude || null;
    const excArtists = new Set(exc && exc.artists || []);
    const excAlbums  = new Set(exc && exc.albums  || []);
    const excSongs   = new Set(exc && exc.songs   || []);

    const selected = rows.filter(function (r) {
        if (station.language !== null && r.lang !== station.language) return false;
        if (!pool[r.artist]) return false;
        if (!sel) return true;
        const included = selArtists.has(r.artist) || selAlbums.has(r.albumCode) ||
                         selSongs.has(r.songId) ||
                         (selAlbumRe !== null && selAlbumRe.test(r.albumCode));
        if (!included) return false;
        return !(excArtists.has(r.artist) || excAlbums.has(r.albumCode) ||
                 excSongs.has(r.songId));
    });

    // A named album or SongID that matches nothing is a typo or a track that
    // left the ledger, and it silently shrinks the station. Surface it.
    const unmatched = [];
    if (sel) {
        const gotAlbum = new Set(selected.map(function (r) { return r.albumCode; }));
        const gotSong  = new Set(selected.map(function (r) { return r.songId; }));
        const gotArtist = new Set(selected.map(function (r) { return r.artist; }));
        selArtists.forEach(function (a) { if (!gotArtist.has(a)) unmatched.push('artist ' + a); });
        selAlbums.forEach(function (a) { if (!gotAlbum.has(a)) unmatched.push('album ' + a); });
        selSongs.forEach(function (s) { if (!gotSong.has(s)) unmatched.push('song ' + s); });
        if (selAlbumRe !== null && !selected.some(function (r) { return selAlbumRe.test(r.albumCode); })) {
            unmatched.push('albumPattern ' + sel.albumPattern);
        }
        // An exclude that matches nothing is equally a typo — it silently fails
        // to remove what it names, which is the more dangerous direction.
        const allAlbums = new Set(rows.map(function (r) { return r.albumCode; }));
        const allSongs  = new Set(rows.map(function (r) { return r.songId; }));
        const allArtists = new Set(rows.map(function (r) { return r.artist; }));
        excArtists.forEach(function (a) { if (!allArtists.has(a)) unmatched.push('exclude artist ' + a); });
        excAlbums.forEach(function (a) { if (!allAlbums.has(a)) unmatched.push('exclude album ' + a); });
        excSongs.forEach(function (x) { if (!allSongs.has(x)) unmatched.push('exclude song ' + x); });
    }

    // A ledger row is the claim; the file on disk is the proof. A row whose
    // audio is missing would be a track the player 404s on, so drop it loudly
    // rather than ship a manifest that half-plays.
    const missing = [];
    const albums = new Map();
    let totalDuration = 0;
    let unreadable = 0;

    for (const r of selected) {
        // The canonical repository is the durable copy, so its file is what
        // duration is read from regardless of which URL layout ships.
        const abs = path.join(MUSIC_ROOT, r.artist, r.lang.toLowerCase(), r.albumSlug, r.filename);
        if (!fs.existsSync(abs)) { missing.push(r); continue; }

        let url;
        if (urlLayout === 'source') {
            url = r.artist === 'torah-sings'
                ? torahTrackUrl(r.albumCode, r.track, r.title)
                : sourceTrackUrl(r.artist, r.albumCode, r.albumSlug, r.track);
            // No source file means nothing to point at on the production CDN.
            // Dropping it beats shipping a URL that 404s mid-rotation.
            if (!url) { missing.push(r); continue; }
        } else {
            // `canonical` is the repository path served by whatever host is
            // reading the manifest; `cdn` is the same object addressed
            // absolutely on cdn.kjubilee.com. A station that AIRS needs the
            // second: the origin does not carry the 33 GB repository, so a
            // relative /cdn/music path resolves to a 404 on production and the
            // rotation skips silently through the whole catalogue.
            url = (urlLayout === 'cdn' ? KJ_CDN_BASE + '/music/' : '/cdn/music/') +
                  r.artist + '/' + r.lang.toLowerCase() + '/' +
                  r.albumSlug + '/' + encodeURIComponent(r.filename);
        }

        const duration = mp3DurationSeconds(abs);
        if (duration == null) unreadable++; else totalDuration += duration;

        if (!albums.has(r.albumCode)) {
            albums.set(r.albumCode, {
                album_id: r.albumCode,
                album_slug: r.albumSlug,
                title: ALBUM_TITLES[r.albumCode]
                    || (r.artist === 'torah-sings' ? torahAlbumTitle(r.albumCode) : null)
                    || albumTitleFromSidecar(MUSIC_ROOT, r.artist, r.lang, r.albumSlug)
                    || albumTitleFromMeta(r.artist, r.albumCode, r.albumSlug)
                    || albumTitleFromLyrics(r.artist, pool[r.artist], r.albumCode, r.albumSlug)
                    || titleCase(r.albumSlug),
                artist: pool[r.artist],
                artist_slug: r.artist,
                language: r.lang.toLowerCase(),
                year: r.year,
                genre_code: r.genre,
                genre: genreNames(config, r.genre),
                track_count: 0,
                tracks: [],
            });
        }
        const album = albums.get(r.albumCode);
        album.tracks.push({
            // The SongID is the primary key the rotation and play logs track
            // songs by — it travels with the track into every manifest.
            track_id: r.songId,
            track_number: r.track,
            title: r.title,
            artist: pool[r.artist],
            artist_slug: r.artist,
            album: album.title,
            album_id: r.albumCode,
            url: url,
            duration_s: duration == null ? null : Math.round(duration),
            language: r.lang.toLowerCase(),
            genre_code: r.genre,
            genre: genreNames(config, r.genre),
            mode: station.mode,
            explicit: false,
            family_friendly: true,
        });
    }

    const albumList = Array.from(albums.values()).sort(function (a, b) {
        return a.album_id.localeCompare(b.album_id);
    });
    for (const a of albumList) {
        a.tracks.sort(function (x, y) { return x.track_number - y.track_number; });
        a.track_count = a.tracks.length;
    }

    const artists = Array.from(new Set(albumList.map(function (a) { return a.artist_slug; }))).sort();
    const trackCount = albumList.reduce(function (n, a) { return n + a.track_count; }, 0);

    const manifest = {
        schema_version: '2.0',
        content_type: 'music',
        station_id: stationId,
        station_slug: station.slug,
        mount: station.mount || station.slug,
        station_name: station.name,
        hm: station.hm,
        language: station.language ? station.language.toLowerCase() : 'mul',
        language_name: station.languageName,
        language_tag: station.languageTag,
        mode: station.mode,
        host_city: station.hostCity,
        timezone: station.timezone,
        generated_at: new Date().toISOString(),
        generator: 'tools/build-station-manifest.js',
        source: {
            repository: MUSIC_ROOT,
            ledger: path.basename(REGISTRY),
            url_layout: urlLayout,
            url_base: urlLayout === 'source' ? SOURCE_CDN_BASE + SOURCE_CDN_PREFIX
                : urlLayout === 'cdn' ? KJ_CDN_BASE + '/music'
                : '/cdn/music',
        },
        selection: (function () {
            const base = {
                rule: station.language
                    ? 'every ' + station.languageName + ' track in the repository by one of the ' +
                      'twelve Inspire Family members'
                    : 'every track in the repository, in any language, by one of the ' +
                      'twelve Inspire Family members',
                languages: station.language
                    ? [station.language]
                    : [...new Set(selected.map(function (r) { return r.lang; }))].sort(),
                artist_pool: station.pool,
                artists_eligible: Object.keys(pool).sort(),
                artists_present: artists,
            };
            if (!sel) return base;
            const parts = [];
            if (selArtists.size) parts.push('every ' + station.languageName + ' track by ' +
                [...selArtists].map(function (a) { return pool[a] || a; }).join(' or '));
            if (selAlbums.size) parts.push(selAlbums.size + ' further album(s) selected whole');
            if (selSongs.size) parts.push(selSongs.size + ' individually selected track(s)');
            if (selAlbumRe) parts.push('every album whose code matches ' + sel.albumPattern +
                ', by any artist in the pool');
            base.rule = parts.join('; ');
            base.explicit = {
                artists: [...selArtists].sort(),
                albums: [...selAlbums].sort(),
                songs: [...selSongs].sort(),
            };
            if (selAlbumRe) base.explicit.albumPattern = sel.albumPattern;
            // Whole-pool stations grow on every ingest; an explicitly selected
            // one does not. Say so, so nobody expects it to self-extend.
            //
            // A PATTERN IS THE EXCEPTION, and it has to be said separately or the
            // note is simply false: an albumPattern station picks up a new album
            // the moment its code matches, exactly like a whole-artist station.
            // Telling its operator to go and re-run a selection analysis after
            // every ingest would be telling them to do nothing, forever.
            base.note = selAlbumRe && !selArtists.size && !selSongs.size && !selAlbums.size
                ? 'Pattern selection — this catalog GROWS on its own: any newly ' +
                  'ingested album whose code matches ' + sel.albumPattern + ' joins the ' +
                  'rotation on the next build, with no edit to the station definition.'
                : 'Explicit selection — unlike the language stations this ' +
                  'catalog does not grow automatically when new audio is ingested. ' +
                  'Re-run the selection analysis and update `select` in ' +
                  'tools/build-station-manifest.js when new albums land.';
            return base;
        })(),
        rotation: {
            // The player shuffles the flattened track list and reshuffles on
            // every wrap, so ordering here is catalog order, not play order.
            order: 'shuffle',
            repeat: 'continuous',
        },
        totals: {
            albums: albumList.length,
            tracks: trackCount,
            artists: artists.length,
            duration_s: Math.round(totalDuration),
        },
        albums: albumList,
    };

    return { manifest: manifest, missing: missing, unreadable: unreadable,
             eligible: selected.length, unmatched: unmatched };
}

// ── Verify ───────────────────────────────────────────────────────────────
//
// The ledger says a track exists in the repository; it cannot say the bytes
// have reached the CDN that will serve them. Those are different questions,
// and the gap is real: an album ingested this week is on the repository disk
// long before it is synced to R2.
//
// A manifest naming a track the CDN does not have produces the worst kind of
// failure - the station still loads, the rotation still runs, and the listener
// just gets silence where that track should have been, because the player
// skips a failed load and says nothing. So each URL is asked for its first few
// bytes, and anything that does not answer is dropped from the manifest and
// named in the report.

// Twelve parallel probes made the origin start answering 500 partway through a
// 4,296-track sweep, and those 500s looked exactly like missing files: ~500
// good tracks were dropped from an album that serves perfectly when asked one
// at a time. Six, with retries and a pause between them, does not provoke it.
const VERIFY_CONCURRENCY = 6;
const VERIFY_ATTEMPTS = 3;

/// Ask for a track's first bytes.
///
/// Returns 'present', 'absent', or 'unknown'. The distinction is the whole
/// point: 404/410 is the CDN telling us the file is not there, and anything
/// else - a 5xx, a timeout, a dropped socket - is the CDN failing to answer,
/// which says nothing about the file. Only the first is grounds for dropping a
/// track from the manifest.
async function probeOnce(url) {
    try {
        const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-63' } });
        if (res.body) { try { await res.body.cancel(); } catch (e) { /* already gone */ } }
        if (res.status === 200 || res.status === 206) return { state: 'present' };
        if (res.status === 404 || res.status === 410) return { state: 'absent', status: res.status };
        return { state: 'unknown', status: res.status };
    } catch (e) {
        return { state: 'unknown', status: e.message };
    }
}

async function probeWithRetry(url) {
    let last = { state: 'unknown', status: 'no attempt' };
    for (let i = 0; i < VERIFY_ATTEMPTS; i++) {
        last = await probeOnce(url);
        if (last.state !== 'unknown') return last;
        // Back off before trying again — the failure this retries is the origin
        // being overloaded, and retrying immediately just adds to it.
        await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
    return last;
}

async function verifyManifest(manifest, base, log) {
    const tracks = manifest.albums.flatMap(a => a.tracks.map(t => ({ album: a, track: t })));
    const dead = new Set();
    const failures = [];
    const unknown = [];
    let done = 0;

    const probe = async (item) => {
        // The manifest holds the CDN's own absolute URL; the site proxies the
        // same tree under /cdn/, so the probe follows exactly the path a
        // listener's browser takes rather than a different one that might
        // succeed where playback would not.
        const url = item.track.url.replace(/^https:\/\/cdn\.jubileeverse\.com\//, base + '/cdn/')
                                  .replace(/^\//, base + '/');
        const r = await probeWithRetry(url);
        if (r.state === 'absent') {
            dead.add(item.track.track_id);
            failures.push({ album: item.album.album_id, title: item.album.title,
                            artist: item.album.artist, status: r.status });
        } else if (r.state === 'unknown') {
            // Keep it. A track that might be fine is worth more than the
            // certainty of having removed it, and the count is reported so an
            // unreachable CDN cannot pass for a clean run.
            unknown.push({ album: item.album.album_id, title: item.album.title,
                           artist: item.album.artist, status: r.status });
        }
        done++;
        if (done % 500 === 0) log('    verified ' + done + '/' + tracks.length);
    };

    const queue = tracks.slice();
    const workers = Array.from({ length: VERIFY_CONCURRENCY }, async () => {
        for (let item = queue.shift(); item; item = queue.shift()) await probe(item);
    });
    await Promise.all(workers);

    // Stamp a clean run too — otherwise a manifest where nothing was dropped
    // is indistinguishable from one that was never checked, and the playlist
    // builder reports it as UNVERIFIED.
    manifest.verified = { against: base, dropped: 0 };
    if (!dead.size) return { dropped: 0, albums: [], unknown: unknown };

    // Drop the dead tracks, then any album left with nothing in it.
    for (const album of manifest.albums) {
        album.tracks = album.tracks.filter(t => !dead.has(t.track_id));
        album.track_count = album.tracks.length;
    }
    manifest.albums = manifest.albums.filter(a => a.track_count > 0);

    const artists = [...new Set(manifest.albums.map(a => a.artist_slug))].sort();
    manifest.selection.artists_present = artists;
    manifest.totals = {
        albums: manifest.albums.length,
        tracks: manifest.albums.reduce((n, a) => n + a.track_count, 0),
        artists: artists.length,
        duration_s: manifest.albums.reduce(
            (n, a) => n + a.tracks.reduce((m, t) => m + (t.duration_s || 0), 0), 0),
    };
    manifest.verified = { against: base, dropped: dead.size };

    // Report by album; 299 individual lines is noise, 25 album lines is a
    // worklist for whoever runs the CDN sync.
    const byAlbum = new Map();
    for (const f of failures) {
        if (!byAlbum.has(f.album)) byAlbum.set(f.album, { ...f, n: 0 });
        byAlbum.get(f.album).n++;
    }
    return { dropped: dead.size, albums: [...byAlbum.values()], unknown: unknown };
}

// ── Write ────────────────────────────────────────────────────────────────
function writeManifest(stationId, manifest, outPath) {
    const out = outPath || path.join(CDN_ROOT, 'radio', stationId, 'delivery', 'music.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    // Atomic rename per BR-A2 — a half-written manifest must never be served.
    const tmp = out + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, out);
    return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────
function targetsOf(all, stationArg) {
    return all ? Object.keys(STATIONS) : (stationArg ? [stationArg] : []);
}

async function main(argv) {
    const DRY_RUN = argv.indexOf('--dry-run') >= 0;
    const ALL = argv.indexOf('--all') >= 0;
    const opt = function (name, fallback) {
        const i = argv.indexOf('--' + name);
        if (i >= 0 && argv[i + 1]) return argv[i + 1];
        const eq = argv.find(function (a) { return a.indexOf('--' + name + '=') === 0; });
        return eq ? eq.slice(('--' + name + '=').length) : fallback;
    };
    const stationArg = opt('station', null);
    const VERIFY = argv.indexOf('--verify') >= 0;
    const verifyBase = opt('verify-base', 'https://www.kjubilee.com').replace(/\/$/, '');
    const urlLayout = opt('url-layout', 'canonical');
    const outPath = opt('out', null);

    if (!ALL && !stationArg) {
        console.error('Usage: node tools/build-station-manifest.js --station <STATION_ID> [options]');
        console.error('       node tools/build-station-manifest.js --all [options]');
        console.error('Options: --dry-run  --url-layout source|canonical|cdn  --out <file>');
        console.error('         --verify [--verify-base <origin>]  drop tracks the CDN does not have');
        console.error('Known stations: ' + Object.keys(STATIONS).join(', '));
        return 2;
    }
    if (urlLayout !== 'source' && urlLayout !== 'canonical' && urlLayout !== 'cdn') {
        console.error('--url-layout must be "source", "canonical" or "cdn", got "' + urlLayout + '"');
        return 2;
    }
    if (outPath && (ALL || targetsOf(ALL, stationArg).length > 1)) {
        console.error('--out writes a single file; use it with --station, not --all');
        return 2;
    }
    if (stationArg && !STATIONS[stationArg]) {
        console.error('Unknown station "' + stationArg + '". Known: ' + Object.keys(STATIONS).join(', '));
        return 2;
    }

    const targets = targetsOf(ALL, stationArg);
    let failed = false;

    for (const stationId of targets) {
        const built = buildStation(stationId, urlLayout);
        const manifest = built.manifest;
        const t = manifest.totals;

        console.log('\n' + stationId + ' — ' + manifest.station_name);
        console.log('  url layout: ' + urlLayout + ' (' + manifest.source.url_base + ')');
        const poolSize = manifest.selection.artists_eligible.length;
        console.log('  ' + t.tracks + ' tracks · ' + t.albums + ' albums · ' + t.artists +
                    ' of ' + poolSize + ' ' + (manifest.selection.artist_pool === 'inspire-family'
                        ? 'family members' : 'catalogues') +
                    ' · ' + Math.round(t.duration_s / 60) + ' min');
        for (const a of manifest.albums) {
            console.log('    ' + a.album_id + '  ' + String(a.track_count).padStart(2) +
                        ' tracks  ' + a.artist + ' — ' + a.title);
        }
        if (built.unmatched.length) {
            failed = true;
            console.log('  ERROR: ' + built.unmatched.length + ' selection entr(ies) matched ' +
                        'nothing in the ledger — the station is smaller than intended:');
            for (const u of built.unmatched) console.log('    ' + u);
        }
        const silent = manifest.selection.explicit ? 0
            : manifest.selection.artists_eligible.length - t.artists;
        if (silent) {
            console.log('  note: ' + silent + ' eligible member(s) have no' +
                        (manifest.selection.languages.length === 1 ? ' ' + manifest.language_name : '') +
                        ' audio in the repository yet — they join the rotation automatically once ingested.');
        }
        if (built.unreadable) {
            console.log('  warn: ' + built.unreadable + ' track(s) have an unreadable duration (duration_s: null)');
        }
        if (built.missing.length) {
            failed = true;
            console.log('  ERROR: ' + built.missing.length + ' of ' + built.eligible +
                        ' ledger row(s) have no resolvable audio file — excluded:');
            for (const m of built.missing.slice(0, 10)) console.log('    ' + m.songId + '  ' + m.filename);
        }
        if (!t.tracks) {
            failed = true;
            console.log('  ERROR: no tracks selected — refusing to write an empty manifest');
        }

        if (VERIFY && t.tracks) {
            console.log('  verifying ' + t.tracks + ' track(s) against ' + verifyBase + ' ...');
            const v = await verifyManifest(manifest, verifyBase, console.log);
            if (v.dropped) {
                console.log('  dropped ' + v.dropped + ' track(s) the CDN does not serve, across ' +
                            v.albums.length + ' album(s):');
                for (const a of v.albums) {
                    console.log('    ' + a.album + '  ' + String(a.n).padStart(2) + ' tracks  ' +
                                a.artist + ' — ' + a.title + '  (' + a.status + ')');
                }
                console.log('  these are in the repository but not on the CDN — sync them, then re-run.');
                console.log('  now: ' + manifest.totals.tracks + ' tracks · ' + manifest.totals.albums +
                            ' albums · ' + manifest.totals.artists + ' members');
            } else {
                console.log('  all ' + t.tracks + ' track(s) verified.');
            }
            if (v.unknown && v.unknown.length) {
                const albums = [...new Set(v.unknown.map(u => u.album))];
                console.log('  ! ' + v.unknown.length + ' track(s) across ' + albums.length +
                            ' album(s) could not be checked (the CDN did not answer after ' +
                            VERIFY_ATTEMPTS + ' tries); they were KEPT.');
                console.log('    e.g. ' + v.unknown[0].album + ' (' + v.unknown[0].status + ')');
            }
        }

        if (DRY_RUN) {
            console.log('  (dry run — nothing written)');
        } else if (t.tracks) {
            console.log('  wrote ' + writeManifest(stationId, manifest, outPath));
        }
    }

    return failed ? 1 : 0;
}

module.exports = {
    mp3DurationSeconds: mp3DurationSeconds,
    buildStation: buildStation,
    STATIONS: STATIONS,
};

if (require.main === module) {
    main(process.argv.slice(2)).then(code => process.exit(code));
}
