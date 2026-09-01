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
 *   node tools/build-station-manifest.js --station HM326.20-RO --dry-run
 *   node tools/build-station-manifest.js --station HM326.20-RO
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

/* HM 304.80 is selected by a WORD rather than by an artist or a genre — the
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
    // Silas & Toby, from buckysbarnyard.com — barnyard bluegrass for children,
    // and the act behind HM 370.30. A catalogue rather than a family member for
    // the same reason as the other children's acts: a station that selects "the
    // Inspire Family" must not quietly pick up somebody else's property.
    'silas-toby': 'Silas & Toby',
    'torah-sings': 'Torah Sings',
    // Marcus Reed's own property. A catalogue rather than a family member for
    // the usual reason: the flagship names four voices and must not pick up
    // eighty-three rap tracks by a DJ none of them is credited as.
    'marcus-reed': 'Marcus Reed',
    // The trio - Jubilee, Melody and Zariah singing together. A body of work
    // rather than a persona, so it belongs here and not in INSPIRE_FAMILY: the
    // flagship selects four named voices and must not pick up 224 concert
    // tracks by a group none of those four is credited as.
    'radiant-stones': 'Radiant Stones',
    // The children's party act, its own brand with its own site. In here for
    // the same reason Torah Sings is: a station that selects "the Inspire
    // Family" must not quietly pick up 338 kids' party tracks.
    'party-giggles': 'Party Giggles',
    // The second children's act, for the younger end: God's Little Lambs is
    // aimed at 3-5s where Jubilee Kids Party is 6-8s. Same reason it is here
    // rather than in INSPIRE_FAMILY - a family-only station must not absorb
    // another 357 kids' tracks.
    'tiny-tiggles': 'My Tiny Tiggles',
    // The Gospel of Matthew set to music, chapter by chapter. Exactly the shape
    // Torah Sings has and here for exactly the same reason: all twelve personas
    // perform it, so the catalogue is the WORK, and a station selecting "the
    // Inspire Family" must not absorb it a chapter at a time under four names.
    'gospel-by-music': 'Gospel By Music',
    // The sung Scripture prayers - jubileeprayers.com's cantillation store.
    // A catalogue and not a persona for the usual reason, and for one more:
    // the prayer line's album code carries Jubilee's JE prefix, so filing it
    // under jubilee-inspire would have been defensible and would have been
    // wrong - the flagship names four voices and would have absorbed a body
    // of continuous chanted prayer that is not a music record at all. The
    // work is the catalogue; the persona is who carries it.
    'jubilee-prayers': 'Jubilee Prayers',
    // Hollis Ferriday - gravelroadgospel.com's own property, and a catalogue
    // for the plainest of the reasons above: he is not one of the family's
    // voices and the flagship must not pick up a Southern Gothic record by a
    // man none of its four is credited as. His station is HM 317.20.
    'hollis-ferriday': 'Hollis Ferriday',
    // Ricky Del Rey - throneroomvegas.com's own property, one act, and here
    // for the same reason Hollis is: a Vegas showroom rock act is not one of
    // the twelve voices, and 204 tracks of horns and classic rock landing on
    // the flagship would change what that station is. His is HM 317.40, next
    // along from Gravel Road because both are single-act properties.
    'ricky-del-rey': 'Ricky Del Rey',
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
    'HM308.70-EN': {
        slug: 'jubilee-radio',
        name: 'Year of Jubilee',
        hm: '308.70',
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
        hostCity: 'Sacramento',
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
    // A CONCERT RECORD, WHICH IS WHY IT IS ITS OWN FREQUENCY.
    //
    // Radiant Stones is the trio - Jubilee, Melody and Zariah - and its albums
    // are built as concerts: an opener, a coronation, a climax, an encore. That
    // shape is the station. It sits in The Crossing because it is domestic
    // English gospel-forward music, one number below the flagship.
    //
    // pool 'catalogues' + select.artists is the same shape Torah Sings uses: the
    // pool admits the four non-persona bodies of work, and the select narrows to
    // this one. Every track credited to the trio belongs here, and a future
    // Radiant Stones record joins on the next build with no edit. The Romanian album (JMZM1012RO) is excluded by
    // the language filter alone, not by a rule - it will air on HM 326.20 with
    // every other Romanian track, which is the point of one-language-per-
    // frequency.
    'HM301.90-EN': {
        slug: 'radiant-stones-radio',
        name: 'Radiant Stones Concerts',
        hm: '301.90',
        mount: 'radiant-stones',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Nashville',
        timezone: 'America/Chicago',
        pool: 'catalogues',
        select: { artists: ['radiant-stones'] },
    },
    // THE STATION FOR SOMEONE WHO IS NOT IN CHURCH YET.
    //
    // Melody carries a standing secular_universal / pre-evangelistic exemption:
    // her own blueprints describe these records as "kingdom-shaped without
    // explicit naming", and they self-rate 32-50% faith-focus against a roster
    // that is otherwise 80%+. Gratitude, family, ordinary wonder — clean enough
    // for any room and never preachy.
    //
    // `albums` rather than `artists`, and that is the whole point: Melody ALSO
    // records vertical worship sung directly to Jesus by name, and a station
    // built on her NAME would mix the two and lose the one thing that makes this
    // frequency useful. The codes below are exactly her audio-bearing
    // secular_universal records. Another joins by being added here,
    // deliberately, after someone has read its blueprint — not by default.
    //
    // 2026-08-26: ten more, MDIM1013EN through MDIM1022EN. They were absent for
    // one reason only — no audio when this station was built — and the import
    // refresh that ingested them left all 120 tracks orphaned, on no station at
    // all, which is how they were noticed. Each one's album.meta.json was read
    // before it was added here, and each declares secular_universal, the same
    // posture as the original twelve: the stoop, where the money goes, coffee
    // confessions, half the rent. Melody has ~90 English records written and
    // most are still awaiting audio, so expect this list to keep growing — and
    // expect to read a blueprint each time. That cost is the safeguard, not an
    // oversight: an albumPattern would sweep her vertical worship onto the one
    // frequency built for someone who is not in church yet.
    'HM376.20-EN': {
        slug: 'inspire-active',
        name: 'Melody’s Sparkle',
        hm: '376.20',
        mount: 'melodys-sparkle',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Nashville',
        timezone: 'America/Chicago',
        pool: 'inspire-family',
        select: {
            albums: [
                'MDIM1001EN',
                'MDIM1002EN',
                'MDIM1003EN',
                'MDIM1004EN',
                'MDIM1005EN',
                'MDIM1006EN',
                'MDIM1007EN',
                'MDIM1008EN',
                'MDIM1009EN',
                'MDIM1010EN',
                'MDIM1011EN',
                'MDIM1012EN',
                'MDIM1013EN',   // the stoop
                'MDIM1014EN',   // where the money goes
                'MDIM1015EN',   // coffee confessions
                'MDIM1016EN',   // side effects of love
                'MDIM1017EN',   // small brave moments
                'MDIM1018EN',   // solo saturdays
                'MDIM1019EN',   // the apartment
                'MDIM1020EN',   // half the rent
                'MDIM1021EN',   // no word for it yet
                'MDIM1022EN',   // three a.m. saints
            ],

            // WRITTEN, NOT YET RECORDED.
            //
            // Melody has ~90 English records written and only 22 recorded. These
            // 62 have no audio in the source tree, so they contribute nothing to
            // the manifest today — the builder selects from the LEDGER, and an
            // album with no tracks in it selects no tracks. They are named so that
            // each joins the moment its audio is ingested, without anyone having to
            // remember on that day that this file exists.
            //
            // Every one was checked against its album.meta.json first and declares
            // secular_universal, the same posture as the twenty-two above. Six
            // other Melody albums carry no such marker — MDIM1046EN, 1055EN,
            // 1064EN, 1067EN, 1086EN and the Hindi MDIM1002HI — and are
            // deliberately absent: unmarked is not the same as cleared.
            //
            // WHAT THIS TRADES AWAY. A blueprint describes what was WRITTEN, not
            // what will be recorded against it, and those can differ — Zariah's
            // ZHIM1030RO holds an entirely different album's audio under its own
            // name. Pre-registering therefore spends a reading now to avoid one
            // later, and the cost is that new audio can reach the one frequency
            // built for someone not in church yet without being heard first.
            // The builder prints GRADUATED when a pending album gains audio, and
            // the import report shows HM 376.20 gaining tracks. Those two lines
            // are the whole safety net. Listen when they appear.
            pending: [
                'MDIM1023EN',   // show up tuesday
                'MDIM1024EN',   // brand new heartbeat
                'MDIM1025EN',   // crush like its summer
                'MDIM1026EN',   // show up for me
                'MDIM1027EN',   // mirror says stay
                'MDIM1028EN',   // loudest yes in the room
                'MDIM1029EN',   // tough like tuesday
                'MDIM1030EN',   // big loud plans
                'MDIM1031EN',   // confetti on the floor
                'MDIM1032EN',   // move til morning
                'MDIM1033EN',   // alive on purpose
                'MDIM1034EN',   // sunscreen symphony
                'MDIM1035EN',   // goodbye looks good
                'MDIM1036EN',   // backyard polaroid
                'MDIM1037EN',   // same old street
                'MDIM1038EN',   // keys to my own car
                'MDIM1039EN',   // window seat forever
                'MDIM1040EN',   // tomorrow counts
                'MDIM1041EN',   // love me loud
                'MDIM1042EN',   // main character energy
                'MDIM1043EN',   // chase it
                'MDIM1044EN',   // right now looks like this
                'MDIM1045EN',   // day one crew
                'MDIM1047EN',   // bounce back
                'MDIM1048EN',   // soft place to land
                'MDIM1049EN',   // its okay today
                'MDIM1050EN',   // one of one
                'MDIM1051EN',   // growing wings
                'MDIM1052EN',   // dance floor diary
                'MDIM1053EN',   // brighter from here
                'MDIM1054EN',   // hometown heartbeat
                'MDIM1056EN',   // wings wide open
                'MDIM1057EN',   // we move together
                'MDIM1058EN',   // tiny magic
                'MDIM1059EN',   // grind and glow
                'MDIM1060EN',   // miles between us
                'MDIM1061EN',   // taillights out of town
                'MDIM1062EN',   // all odds all in
                'MDIM1063EN',   // same sky different clocks
                'MDIM1065EN',   // the hands that raised me
                'MDIM1066EN',   // my first almost
                'MDIM1068EN',   // second first day
                'MDIM1069EN',   // weird on purpose
                'MDIM1070EN',   // countdown to your face
                'MDIM1071EN',   // one loud summer
                'MDIM1072EN',   // lighter than the grudge
                'MDIM1073EN',   // ive got the heavy end
                'MDIM1074EN',   // still chasing fireflies
                'MDIM1075EN',   // seasons dont ask first
                'MDIM1076EN',   // home is a person
                'MDIM1077EN',   // 2 am blueprints
                'MDIM1078EN',   // we did the thing
                'MDIM1079EN',   // down is not done
                'MDIM1080EN',   // knew me first
                'MDIM1081EN',   // do not disturb
                'MDIM1082EN',   // you wrote my bio
                'MDIM1083EN',   // plus one forever
                'MDIM1084EN',   // out of office
                'MDIM1085EN',   // twenty questions
                'MDIM1088EN',   // filter off
                'MDIM1089EN',   // never left on read
                'MDIM1090EN',   // confetti at midnight
            ],
        },
    },
    // HM 315.20 CORNER CIPHER — Christian rap, Atlanta.
    //
    // In The Crossing because it is domestic English gospel-forward music,
    // which is what the block is for — the genre is new to the dial, the
    // function is not. Its own manifest splits the catalogue into three
    // lanes (trap, lyrical, soul-gospel) and the station takes all three:
    // they are one artist's range, not three audiences.
    'HM315.20-EN': {
        slug: 'corner-cipher',
        name: 'Corner Cipher',
        hm: '315.20',
        mount: 'corner-cipher',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Atlanta',
        timezone: 'America/New_York',
        pool: 'catalogues',
        select: { artists: ['marcus-reed'] },
    },
    // HM 317.20 GRAVEL ROAD GOSPEL - Hollis Ferriday, Southern Gothic Americana.
    //
    // In The Crossing for the same reason Corner Cipher is: domestic English
    // gospel-forward music. A genre the dial did not carry, a function it
    // already knows.
    //
    // TWELVE TRACKS, AND THAT IS BELOW EVERY FLOOR THE HOUSE KEEPS:
    //
    //   station-guidelines.md §4   under 80 -> "Not a station"      <- AUTHORITY
    //   import-refresh.md          under ~150 -> hold it back
    //   MUSIC-REPOSITORY-SPEC.md   under 60 -> unworkable
    //
    // One album, Sunday Suit, is recorded; it loops about every forty-five
    // minutes. Backrow Faith was held at exactly this depth two days ago, and
    // Gospel By Music shipped one track under the floor only because nineteen
    // written albums were behind it. This station has five, and they are
    // lyrics-complete rather than recorded.
    //
    // ON AIR ON THE OWNER'S DECISION, 2026-08-29, with that stated plainly
    // rather than smoothed over. If the five below stall, the correct move is
    // to pull this back to COMING SOON, not to lower the bar again.
    // THRONE ROOM VEGAS - one property, one act, one frequency.
    //
    // A Vegas showroom act with a redemption arc: neon, horns and classic rock
    // on the outside, and a catalogue that names Jesus 154 times and God 546
    // across its 403 lyric sheets. It gets its own dial position rather than a
    // share of an existing one because nothing else on the network sounds like
    // it - the genre lane CRSR (Classic Christian Rock x Showroom Big-Band)
    // was minted for it, measured off 372 declared Styles blocks: rock 339,
    // classic rock 95, horns 157, showroom 73.
    //
    // `artists` and nothing else. Every RDRM record is his, the property files
    // no one else, and a new album joins on the next build with no edit here -
    // which is the whole reason a roster beats a typed album list.
    'HM317.40-EN': {
        slug: 'throne-room-vegas',
        name: 'Throne Room Vegas',
        hm: '317.40',
        mount: 'throne-room-vegas',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        // CCI, and measured rather than assumed: Yahuah and Yeshua appear zero
        // times across the catalogue, Jesus 154 and Lord 487. Its blueprints
        // declare CCI on all seventeen recorded albums, which agrees.
        mode: 'CCI',
        // The act is the Strip. Nothing about the day file reads this, but a
        // station whose whole conceit is a Vegas showroom should not claim
        // Nashville.
        hostCity: 'Las Vegas',
        timezone: 'America/Los_Angeles',
        pool: 'catalogues',
        select: {
            artists: ['ricky-del-rey'],
            // Fourteen albums are written and lyrics-complete with no audio
            // yet. Named so each joins the day it is ingested rather than the
            // day somebody remembers this file exists.
            pending: [
                'RDRM2002EN', 'RDRM2007EN', 'RDRM2008EN', 'RDRM2009EN',
                'RDRM2010EN', 'RDRM2011EN', 'RDRM2012EN',
                'RDRM3001EN', 'RDRM3002EN', 'RDRM3003EN', 'RDRM3004EN',
                'RDRM4001EN', 'RDRM4002EN', 'RDRM4003EN',
            ],
        },
    },
    'HM317.20-EN': {
        slug: 'gravel-road-gospel',
        name: 'Gravel Road Gospel',
        hm: '317.20',
        mount: 'gravel-road-gospel',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        // OHI, and it is the property's own declaration: catalog-manifest.json
        // and every album.meta.json under it say OHI, and the blueprint states
        // it on the album's front page.
        mode: 'OHI',
        // The property names no home town - Bethel Rock is a fiction. Muscle
        // Shoals is the one real place its own album styles cite, it sits in
        // the Sacred Harp country these records are sung out of, and hostCity
        // is metadata the day file ignores either way.
        hostCity: 'Muscle Shoals',
        timezone: 'America/Chicago',
        pool: 'catalogues',
        select: {
            artists: ['hollis-ferriday'],
            // Season 1, albums 2 through 6. Written and lyrics-complete, no
            // audio yet. Named here so each joins the day it is ingested - the
            // builder prints GRADUATED when one does, and that is the cue to
            // listen to what arrived before it airs.
            pending: [
                'HFGR1002EN',   // every word and none of the meaning
                'HFGR1003EN',   // the map on the wall
                'HFGR1004EN',   // nobody leaves this building
                'HFGR1005EN',   // cut loose from the chapter
                'HFGR1006EN',   // the name on the sign
            ],
        },
    },
    // HM 316.00 GOSPEL BY MUSIC — the Gospel of Matthew, chapter by chapter.
    //
    // Twenty-eight albums, one per chapter, all twelve personas performing.
    // In The Crossing because it is domestic English gospel-forward music and
    // because it is the front door doing what the front door is for: someone
    // who has never read Matthew can hear it straight through.
    //
    // JUBILEE PRESENTS IT, and the selection is NOT narrowed to her. She leads
    // seventeen of the two hundred and thirty-three songs; Caleb leads forty.
    // She is the host, not the performer, so the DJ is set in radio.js where
    // every other station's host lives and where it actually renders — not as
    // a field here, which nothing on this side reads.
    //
    // IT SHIPS ONE TRACK UNDER THE DEPTH FLOOR, AND THAT IS A KNOWN DEBT.
    //
    // Nine chapters are recorded: 79 tracks, 331 minutes, about five and a half
    // hours before a repeat. Three documents set a bar and they do not agree,
    // so the strictest one governs:
    //
    //   station-guidelines.md §4   under 80 -> "Not a station"      <- AUTHORITY
    //   import-refresh.md          under ~150 -> hold it back
    //   MUSIC-REPOSITORY-SPEC.md   60-149 -> "workable, repetitive"
    //
    // §4 is the authority AGENTS.md names for programming, and 79 is one track
    // below its floor. The ambient/contemplative exception in §4 is NOT invoked
    // here: this is a narrative record with hooks, not atmosphere, and §11 is
    // explicit that a coherence problem is moved rather than smoothed over.
    //
    // Shipped anyway, on the owner's decision, because the shortfall is one
    // track and is temporary by construction: the nineteen `pending` albums
    // below are written and cast, and Matthew 10 alone clears the floor. That
    // is the difference from Backrow Faith, which was held back at twelve
    // tracks with no second album coming.
    //
    // THE DEBT IS REAL WHILE IT LASTS. Until a tenth chapter is ingested this
    // station repeats more than the house standard allows. If Matthew 10 stalls,
    // the correct move is to pull it back to COMING SOON, not to lower the bar.
    'HM316.00-EN': {
        slug: 'gospel-by-music',
        name: 'Gospel By Music',
        hm: '316.00',
        mount: 'gospel-by-music',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Los Angeles',
        timezone: 'America/Los_Angeles',
        pool: 'catalogues',
        select: {
            artists: ['gospel-by-music'],
            // Matthew 10 through 28. Written, cast and lyric-complete; not yet
            // recorded. Named here so each joins the day its audio is ingested
            // — the builder prints GRADUATED when one does, and that line is
            // the cue to listen to what arrived before it airs.
            pending: [
                'GBMX4010EN',   // sheep among wolves
                'GBMX4011EN',   // are you the one
                'GBMX4012EN',   // the sabbath belongs to him
                'GBMX4013EN',   // everything he said was a story
                'GBMX4014EN',   // a head on a platter, bread on the grass
                'GBMX4015EN',   // even the dogs get crumbs
                'GBMX4016EN',   // on this rock, and get behind me
                'GBMX4017EN',   // the face that changed on the mountain
                'GBMX4018EN',   // seventy times seven
                'GBMX4019EN',   // what the rich man kept
                'GBMX4020EN',   // the last hired, the same wage
                'GBMX4021EN',   // he rode in and turned over the tables
                'GBMX4022EN',   // whose image is on it
                'GBMX4023EN',   // woe seven times
                'GBMX4024EN',   // not one stone
                'GBMX4025EN',   // three stories about being ready
                'GBMX4026EN',   // the cup he asked to pass
                'GBMX4027EN',   // the curtain tore from the top
                'GBMX4028EN',   // go therefore
            ],
        },
    },
    // ── HM 350.00 The Upper Room ─────────────────────────────────────────
    // The station that takes its block's own name: 340.00-359.99 IS The Upper
    // Room, the prophetic office, prayer and intercession (setup/hm-bands.md).
    //
    // MOVED FROM HM 340.30 TO HM 350.00 ON 2026-08-28, board decision, the day
    // it went live. Fifty is the Pentecost number - the fiftieth day, the count
    // from the sheaf to the descent in the upper room - so the block's namesake
    // now sits on the number the block is about. It also seats the station at
    // the head of its own run: 350.50 through 359.50 are the Jubilee Prayers
    // language editions, and the English prayer station is now the round number
    // they count up from rather than an unrelated frequency 10 units below.
    //
    // The card had stood at 340.30 as a placeholder since the dial was laid
    // out, and 340.30 is retired outright rather than left as an empty card -
    // the move is a correction to the plan, not a second frequency.
    //
    // Programming is the jubileeprayers.com cantillation store: sung Scripture
    // prayers, chanted, in the four prayer voices - address, petition,
    // declaration at the mountain, thanksgiving. Programmed as a CONTINUOUS
    // PRAYER STATION, which is the reason the prayers neither introduce nor
    // conclude themselves. A listener joining at any point is not joining late.
    // That property is the format, and it is why a prayer that would be an
    // awkward radio edit anywhere else is correct here.
    //
    // OHI, and not by preference. The prayer line holds a single register -
    // Yahuah, Yeshua, Elohim, Ruach HaKodesh - and there is no alternate
    // naming edition of a prayer album and none may be produced.
    //
    // ───────────────────────────────────────────────────────────────────────
    // THE CATALOG DEPTH DEBT, RECORDED HONESTLY. 12 tracks. One album.
    //
    //   station-guidelines.md §4   under 80 -> "Not a station"     <- AUTHORITY
    //   §4 ambient exception       60-80 minimum, and this is 12
    //   import-refresh.md          under ~150 -> hold it back
    //   MUSIC-REPOSITORY-SPEC.md   under 60 -> below every tier
    //
    // This does not clear the gate on any reading. The ambient/contemplative
    // exception in §4 is the one this format genuinely qualifies for -
    // chanted prayer over drone is atmosphere, listeners are here to pray
    // rather than to hear a hook, and repetition is the point of a prayer
    // station in a way it is not of a music station - but the exception's own
    // floor is 60 tracks and twelve is a fifth of it. At 12 tracks of roughly
    // three and a half minutes the station repeats about every 42 minutes.
    //
    // SHIPPED ANYWAY, ON THE OWNER'S EXPLICIT INSTRUCTION, 2026-08-28. This is
    // the same call that shipped Gospel By Music one track under the floor,
    // and it is a much larger shortfall. Unlike Gospel By Music the relief is
    // NOT yet under construction: the eleven albums named as `pending` below
    // are scaffolded blueprints, every one DRAFT and none through the Founder
    // approval gate, so no lyric may be written against them yet. They are
    // declared here so each joins the day its audio is ingested - the builder
    // prints GRADUATED when one does - and NOT as a claim that they are close.
    //
    // THE DEBT IS REAL WHILE IT LASTS. Clearing it takes five more recorded
    // albums to reach the ambient floor. If the prayer line stalls, the
    // correct move is to pull this back to COMING SOON, not to lower the bar.
    // ───────────────────────────────────────────────────────────────────────
    'HM350.00-EN': {
        slug: 'upper-room',
        name: 'The Upper Room',
        hm: '350.00',
        mount: 'upper-room',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'OHI',
        hostCity: 'Jerusalem',
        timezone: 'Asia/Jerusalem',
        pool: 'catalogues',
        select: {
            artists: ['jubilee-prayers'],
            // The other eleven of the Core Twelve. Scaffolded and blueprinted
            // in w:\JubileePrayers.com, all DRAFT, none approved. Named here
            // for exactly the reason `pending` exists: so the album joins on
            // the day its audio lands without anyone having to remember that
            // this file exists.
            pending: [
                'JEIPX7102EN',   // because he said ask
                'JEIPX7103EN',   // the name he proclaimed
                'JEIPX7104EN',   // his mercy endures forever
                'JEIPX7105EN',   // create in me a clean heart
                'JEIPX7106EN',   // until you answered me
                'JEIPX7107EN',   // i stand in the gap
                'JEIPX7108EN',   // the eyes of my heart
                'JEIPX7109EN',   // the name upon you
                'JEIPX7110EN',   // i lift my eyes
                'JEIPX7111EN',   // give us this day
                'JEIPX7112EN',   // keep me in the watch
                // THE TEN WORDS. Ten albums, one per commandment, Exodus 20:3-17.
                // Founder instruction 2026-08-28; slate at
                // w:\JubileePrayers.com\docslbum-slate-ten-words.md. Blueprinted
                // and canon-table complete, none recorded.
                'JEIPX7113EN',   // I  no other gods
                'JEIPX7114EN',   // II  no graven image
                'JEIPX7115EN',   // III  the Name
                'JEIPX7116EN',   // IV  the Sabbath
                'JEIPX7117EN',   // V  honour father and mother
                'JEIPX7118EN',   // VI  you shall not murder
                'JEIPX7119EN',   // VII  you shall not commit adultery
                'JEIPX7120EN',   // VIII  you shall not steal
                'JEIPX7121EN',   // IX  no false witness
                'JEIPX7122EN',   // X  you shall not covet
                // THE TEACHING. Ten albums on the principles Yeshua taught.
                // Founder instruction 2026-08-28; slate at
                // w:\JubileePrayers.com\docslbum-slate-the-teaching.md
                'JEIPX7123EN',   // the Beatitudes, Matthew 5:1-12
                'JEIPX7124EN',   // salt, light and the antitheses, Matthew 5:13-48
                'JEIPX7125EN',   // the hidden life, Matthew 6
                'JEIPX7126EN',   // the new birth, John 3
                'JEIPX7127EN',   // the seven parables, Matthew 13
                'JEIPX7128EN',   // the community discourse, Matthew 18
                'JEIPX7129EN',   // the Great Commandment and the Samaritan, Luke 10
                'JEIPX7130EN',   // the vine, John 15
                'JEIPX7131EN',   // the farewell, John 14
                'JEIPX7132EN',   // the Olivet discourse, Matthew 24-25
            ],
        },
    },
    'HM326.20-RO': {
        slug: 'jubilee-praise-romana',
        name: 'Jubilee Praise (Română)',
        hm: '326.20',
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
        // `all`, not `inspire-family`. The rule above says every Romanian track
        // in the repository, and an inspire-family pool quietly broke that the
        // moment a non-persona act recorded in Romanian: Radiant Stones' twelve
        // Romanian tracks were in the ledger, on no station, and nothing
        // reported it. The family pool is right for a station that means "these
        // voices"; this station means "this language", and those are different
        // rules that happened to agree until they did not.
        pool: 'all',
    },
    // A format station rather than a language edition. The two others take
    // everything a pool records; this one takes only what is actually country,
    // which no single ledger column can express — the genre code names the
    // *persona's* lane, not each album's production, so Caleb's country-folk
    // record sits under CCPW and Tahoma's country-gospel record under INCL.
    // `select` is therefore explicit; see the block above it for how the three
    // tiers were established.
    'HM309.30-EN': {
        slug: 'country-gospel',
        name: 'Gospel Country',
        hm: '309.30',
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
    'HM302.50-EN': {
        slug: 'jubilee-gospel-fire',
        name: 'Pentecostal Shout',
        hm: '302.50',
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
    /* HM 370.30 Bucky's Barnyard — Silas & Toby, in The Living Room.
     *
     * TWO SOURCES, AND ONLY ONE ALBUM FROM THE SECOND. `artists` and `albums`
     * are OR'd, so this takes everything Silas & Toby record plus exactly one
     * Party Giggles album — the Goat's Bluegrass Hoedown, which is barnyard
     * bluegrass and belongs here rather than on the party rotation. Naming the
     * album and not the artist is what keeps the other forty-odd Party Giggles
     * records off this frequency; `artists: ['party-giggles']` would pull the
     * whole catalogue across.
     *
     * The artist list grows on its own as Silas & Toby record more. The single
     * album is pinned by code because it is a borrowing, not a body of work,
     * and a borrowing should have to be stated.
     *
     * TWENTY-FOUR TRACKS, which is far under the ~150 that setup/import-refresh.md
     * warns will loop audibly. Shipped anyway at the owner's decision
     * (2026-09-01), with more to come; the rotation is honest about what it has
     * rather than padded with music that belongs elsewhere.
     */
    'HM370.30-EN': {
        slug: 'buckys-barnyard',
        name: "Bucky's Barnyard",
        hm: '370.30',
        mount: 'buckys-barnyard',
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Nashville',
        timezone: 'America/Chicago',
        pool: 'catalogues',
        select: { artists: ['silas-toby'], albums: ['IX417EN'] },
    },
    'HM361.90-EN': {
        slug: 'jubilee-kids-party',
        name: 'Jubilee Kids Party',
        hm: '361.90',
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
    // HM 360.30 God's Little Lambs - My Tiny Tiggles, for the youngest listeners.
    //
    // The catalogue's own station, and the second children's act on the dial.
    // Kids 3-5 where Jubilee Kids Party is 6-8, which is why the two are
    // separate stations selecting separate artists rather than one shelf of
    // everything filed as children's music.
    'HM360.30-EN': {
        slug: 'gods-little-lambs',
        name: "God's Little Lambs",
        hm: '360.30',
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
    'HM305.40-EN': {
        slug: 'torah-sings',
        name: 'Torah Sings',
        hm: '305.40',
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
    'HM310.90-EN': {
        slug: 'latin-worship',
        name: 'Latin Worship (English-Spanish)',
        hm: '310.90',
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
        // HM 311.50 Riddim and Rhyme exists to carry. They aired here only
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
    'HM306.20-EN': {
        slug: 'hebraic-celebrations',
        name: 'Hebraic Celebrations',
        hm: '306.20',
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
    'HM312.10-EN': {
        slug: 'island-hallelujah',
        name: 'Island Hallelujah',
        hm: '312.10',
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
    'HM311.50-EN': {
        slug: 'riddim-and-rhyme',
        name: 'Riddim and Rhyme',
        hm: '311.50',
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
    'HM304.80-EN': {
        slug: 'jubilee-ccm',
        name: 'Celebrate Yeshua!',
        hm: '304.80',
        mount: 'celebrate-yeshua',   // Icecast mount + playlist basename
        language: 'EN',
        languageName: 'English',
        languageTag: 'en-US',
        mode: 'CCI',
        hostCity: 'Jerusalem',
        timezone: 'Asia/Jerusalem',
        pool: 'inspire-family',
        /* THE WHOLE JUBILEE INSPIRE CATALOGUE, by owner decision 2026-08-29.
           It was `albums: YESHUA.albums` — the four records that data/yeshua-
           selection.json found singing the name, scanned out of the lyric
           sheets. That is a precise rule and it produced a station 48 songs
           deep, which is under every depth floor the house keeps: a listener
           heard the same four records round in about three hours.

           The trade is stated rather than hidden. This frequency is named for
           a WORD, and selecting the artist instead means most of what airs no
           longer sings it — the station is now Jubilee Inspire's English
           catalogue under a name that promises something narrower. The precise
           rule is still there in data/yeshua-selection.json and re-running
           tools/scan-lyrics-for-name.js keeps it current, so narrowing back is
           one line whenever the catalogue is deep enough to carry it. */
        select: { artists: ['jubilee-inspire'] },
    },
    // Nova's Celtic and European ambient: contemplative cinematic and ambient
    // healing. Her whole English catalogue — her synthwave/chillwave records are
    // real but exist only in Dutch, Romanian, Swedish and Thai, so they belong to
    // those languages' frequencies, not this one.
    //
    // This is also the overnight slot. It replaces the ambient station lost when
    // HM 310.90 became Latin Worship, and the Radio Engine spec names night and
    // soaking programming as a signature feature.
    'HM314.40-EN': {
        slug: 'midnight-praise',
        name: 'Midnight Praise',
        hm: '314.40',
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
    'HM303.10-EN': {
        slug: 'yes-and-amen',
        name: 'Yes and Amen',
        hm: '303.10',
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
    'HM313.80-EN': {
        slug: 'ancient-paths',
        name: 'The Ancient Paths',
        hm: '313.80',
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

    /* ── THE INTERNATIONAL BAND ──────────────────────────────────────────
       One frequency per language, built 2026-08-26 from a scan of the
       repository: every language holding at least twelve songs gets a
       station, so a language with a catalogue has somewhere to play and a
       placeholder to grow into.

       `pool: 'all'`, never 'inspire-family'. The rule these stations state
       is "this language", and a family pool quietly breaks it the moment a
       non-persona act records in that language — the same way Radiant
       Stones' Romanian tracks sat in the ledger, on no station, with
       nothing reporting it (see HM326.20-RO below).

       No `select`. The language filter and the pool are the whole rule, so
       a future ingest in any of these languages joins on the next build
       without an edit here. That is the point of a placeholder. */

    // --- Europe & the Americas ---------------------------------------
    'HM320.30-ES': {
        slug: 'familia-inspire-espanol', name: 'Familia Inspire (Español)', hm: '320.30',
        mount: 'familia', language: 'ES', languageName: 'Spanish', languageTag: 'es-ES',
        mode: 'CCI', hostCity: 'Madrid', timezone: 'Europe/Madrid', pool: 'all',
    },
    // BR and PT are separate ledger codes carrying separate traditions —
    // samba and Brazilian popular forms against European Portuguese — and
    // the language filter takes exactly one code. Folding them together
    // would have dropped twenty-four tracks on the floor silently, so each
    // gets its own frequency.
    'HM321.90-BR': {
        slug: 'brasil-inspire-portugues', name: 'Brasil Inspire (Português)', hm: '321.90',
        mount: 'brasil', language: 'BR', languageName: 'Portuguese', languageTag: 'pt-BR',
        mode: 'CCI', hostCity: 'São Paulo', timezone: 'America/Sao_Paulo', pool: 'all',
    },
    'HM321.50-PT': {
        slug: 'portugal-inspire-portugues', name: 'Portugal Inspire (Português)', hm: '321.50',
        mount: 'portugal', language: 'PT', languageName: 'Portuguese', languageTag: 'pt-PT',
        mode: 'CCI', hostCity: 'Lisboa', timezone: 'Europe/Lisbon', pool: 'all',
    },
    'HM322.50-FR': {
        slug: 'france-inspire-francais', name: 'France Inspire (Français)', hm: '322.50',
        mount: 'france', language: 'FR', languageName: 'French', languageTag: 'fr-FR',
        mode: 'CCI', hostCity: 'Paris', timezone: 'Europe/Paris', pool: 'all',
    },
    'HM323.10-DE': {
        slug: 'deutschland-inspire-deutsch', name: 'Deutschland Inspire (Deutsch)', hm: '323.10',
        mount: 'deutschland', language: 'DE', languageName: 'German', languageTag: 'de-DE',
        mode: 'CCI', hostCity: 'Berlin', timezone: 'Europe/Berlin', pool: 'all',
    },
    'HM323.60-NL': {
        slug: 'nederland-inspire-nederlands', name: 'Nederland Inspire (Nederlands)', hm: '323.60',
        mount: 'nederland', language: 'NL', languageName: 'Dutch', languageTag: 'nl-NL',
        mode: 'CCI', hostCity: 'Amsterdam', timezone: 'Europe/Amsterdam', pool: 'all',
    },
    'HM324.20-DA': {
        slug: 'danmark-inspire-dansk', name: 'Danmark Inspire (Dansk)', hm: '324.20',
        mount: 'danmark', language: 'DA', languageName: 'Danish', languageTag: 'da-DK',
        mode: 'CCI', hostCity: 'København', timezone: 'Europe/Copenhagen', pool: 'all',
    },
    'HM324.40-SV': {
        slug: 'sverige-inspire-svenska', name: 'Sverige Inspire (Svenska)', hm: '324.40',
        mount: 'sverige', language: 'SV', languageName: 'Swedish', languageTag: 'sv-SE',
        mode: 'CCI', hostCity: 'Stockholm', timezone: 'Europe/Stockholm', pool: 'all',
    },
    'HM324.80-IT': {
        slug: 'italia-inspire-italiano', name: 'Italia Inspire (Italiano)', hm: '324.80',
        mount: 'italia', language: 'IT', languageName: 'Italian', languageTag: 'it-IT',
        mode: 'CCI', hostCity: 'Roma', timezone: 'Europe/Rome', pool: 'all',
    },
    'HM325.40-PL': {
        slug: 'polska-inspire-polski', name: 'Polska Inspire (Polski)', hm: '325.40',
        mount: 'polska', language: 'PL', languageName: 'Polish', languageTag: 'pl-PL',
        mode: 'CCI', hostCity: 'Warszawa', timezone: 'Europe/Warsaw', pool: 'all',
    },
    'HM325.80-CS': {
        slug: 'cesko-inspire-cestina', name: 'Česko Inspire (Čeština)', hm: '325.80',
        mount: 'cesko', language: 'CS', languageName: 'Czech', languageTag: 'cs-CZ',
        mode: 'CCI', hostCity: 'Praha', timezone: 'Europe/Prague', pool: 'all',
    },
    'HM326.80-HU': {
        slug: 'magyar-inspire-magyar', name: 'Magyar Inspire (Magyar)', hm: '326.80',
        mount: 'magyar', language: 'HU', languageName: 'Hungarian', languageTag: 'hu-HU',
        mode: 'CCI', hostCity: 'Budapest', timezone: 'Europe/Budapest', pool: 'all',
    },
    'HM327.20-BG': {
        slug: 'bulgaria-inspire-balgarski', name: 'Bulgaria Inspire (Български)', hm: '327.20',
        mount: 'bulgaria', language: 'BG', languageName: 'Bulgarian', languageTag: 'bg-BG',
        mode: 'CCI', hostCity: 'София', timezone: 'Europe/Sofia', pool: 'all',
    },
    'HM327.60-RU': {
        slug: 'russia-inspire-russkiy', name: 'Russia Inspire (Русский)', hm: '327.60',
        mount: 'russia', language: 'RU', languageName: 'Russian', languageTag: 'ru-RU',
        mode: 'CCI', hostCity: 'Москва', timezone: 'Europe/Moscow', pool: 'all',
    },

    // --- The Middle East ---------------------------------------------
    'HM328.20-TR': {
        slug: 'turkiye-inspire-turkce', name: 'Türkiye Inspire (Türkçe)', hm: '328.20',
        mount: 'turkiye', language: 'TR', languageName: 'Turkish', languageTag: 'tr-TR',
        mode: 'CCI', hostCity: 'İstanbul', timezone: 'Europe/Istanbul', pool: 'all',
    },
    'HM328.70-AR': {
        slug: 'inspire-crown-arabic', name: 'Inspire Crown (العربية)', hm: '328.70',
        mount: 'crown', language: 'AR', languageName: 'Arabic', languageTag: 'ar-JO',
        mode: 'CCI', hostCity: 'Amman', timezone: 'Asia/Amman', pool: 'all',
    },
    // OHI rather than CCI: a Hebrew-language catalogue uses the Hebrew names
    // throughout, so forcing the mainstream naming convention onto it would
    // describe the songs wrongly. Same reasoning as HM306.20-EN.
    'HM329.00-HE': {
        slug: 'israel-inspire-ivrit', name: 'Israel Inspire (עברית)', hm: '329.00',
        mount: 'ivrit', language: 'HE', languageName: 'Hebrew', languageTag: 'he-IL',
        mode: 'OHI', hostCity: 'ירושלים', timezone: 'Asia/Jerusalem', pool: 'all',
    },

    // --- Asia ---------------------------------------------------------
    'HM332.10-HI': {
        slug: 'inspire-india-hindi', name: 'Inspire India (हिन्दी)', hm: '332.10',
        mount: 'india', language: 'HI', languageName: 'Hindi', languageTag: 'hi-IN',
        mode: 'CCI', hostCity: 'Mumbai', timezone: 'Asia/Kolkata', pool: 'all',
    },
    'HM334.40-ZH': {
        slug: 'asia-inspire-zhongwen', name: 'Asia Inspire (中文)', hm: '334.40',
        mount: 'zhongwen', language: 'ZH', languageName: 'Mandarin', languageTag: 'zh-CN',
        mode: 'CCI', hostCity: '台北', timezone: 'Asia/Taipei', pool: 'all',
    },
    'HM336.60-JA': {
        slug: 'japan-inspire-nihongo', name: 'Japan Inspire (日本語)', hm: '336.60',
        mount: 'nihongo', language: 'JA', languageName: 'Japanese', languageTag: 'ja-JP',
        mode: 'CCI', hostCity: '東京', timezone: 'Asia/Tokyo', pool: 'all',
    },
    'HM337.20-TH': {
        slug: 'thailand-inspire-thai', name: 'Thailand Inspire (ไทย)', hm: '337.20',
        mount: 'thailand', language: 'TH', languageName: 'Thai', languageTag: 'th-TH',
        mode: 'CCI', hostCity: 'กรุงเทพมหานคร', timezone: 'Asia/Bangkok', pool: 'all',
    },
    'HM337.70-VI': {
        slug: 'vietnam-inspire-tieng-viet', name: 'Vietnam Inspire (Tiếng Việt)', hm: '337.70',
        mount: 'vietnam', language: 'VI', languageName: 'Vietnamese', languageTag: 'vi-VN',
        mode: 'CCI', hostCity: 'Thành phố Hồ Chí Minh', timezone: 'Asia/Ho_Chi_Minh', pool: 'all',
    },
    'HM339.90-TL': {
        slug: 'pilipinas-inspire-tagalog', name: 'Pilipinas Inspire (Tagalog)', hm: '339.90',
        mount: 'pilipinas', language: 'TL', languageName: 'Tagalog', languageTag: 'tl-PH',
        mode: 'CCI', hostCity: 'Maynila', timezone: 'Asia/Manila', pool: 'all',
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
        // Everything that records, personas and catalogues alike. For the one
        // station whose rule is genuinely "every track in this language" — see
        // HM326.20-RO. Not a default: a station that names `all` is saying the
        // language IS the whole selection, which is only true where the
        // language is scarce enough that leaving tracks out strands them.
        'all': Object.assign({}, INSPIRE_FAMILY, CATALOGUES),
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
    // `pending` is the third state an album can be in.
    //
    // `albums` means "this exists and belongs here"; an entry that matches
    // nothing is a typo and is an ERROR, because it silently shrinks a station.
    // But an album can also be WRITTEN AND NOT YET RECORDED, which is the normal
    // condition for most of a persona's catalogue, and naming one is neither a
    // typo nor a mistake — it is how a curated station says "when this is
    // recorded, it belongs here" without anyone having to remember this file
    // exists on the day the audio lands.
    //
    // Kept SEPARATE from `albums` rather than folded in, because collapsing the
    // two would cost the typo guard: if any unmatched entry were acceptable,
    // a mistyped code would never be reported again. Here an unmatched `albums`
    // entry is still an error, an unmatched `pending` entry is expected, and a
    // pending album that HAS appeared is reported as having graduated — which is
    // also the cue to listen to what actually arrived.
    const selPending = new Set(sel && sel.pending || []);

    const exc = sel && sel.exclude || null;
    const excArtists = new Set(exc && exc.artists || []);
    const excAlbums  = new Set(exc && exc.albums  || []);
    const excSongs   = new Set(exc && exc.songs   || []);

    const selected = rows.filter(function (r) {
        if (station.language !== null && r.lang !== station.language) return false;
        if (!pool[r.artist]) return false;
        if (!sel) return true;
        const included = selArtists.has(r.artist) || selAlbums.has(r.albumCode) ||
                         selPending.has(r.albumCode) || selSongs.has(r.songId) ||
                         (selAlbumRe !== null && selAlbumRe.test(r.albumCode));
        if (!included) return false;
        return !(excArtists.has(r.artist) || excAlbums.has(r.albumCode) ||
                 excSongs.has(r.songId));
    });

    // A named album or SongID that matches nothing is a typo or a track that
    // left the ledger, and it silently shrinks the station. Surface it.
    const unmatched = [];
    const awaiting = [];      // named in `pending`, no audio yet — expected
    const graduated = [];     // named in `pending` and now IN the ledger
    if (sel) {
        const gotAlbum = new Set(selected.map(function (r) { return r.albumCode; }));
        const gotSong  = new Set(selected.map(function (r) { return r.songId; }));
        const gotArtist = new Set(selected.map(function (r) { return r.artist; }));
        selArtists.forEach(function (a) { if (!gotArtist.has(a)) unmatched.push('artist ' + a); });
        selAlbums.forEach(function (a) { if (!gotAlbum.has(a)) unmatched.push('album ' + a); });
        selPending.forEach(function (a) {
            (gotAlbum.has(a) ? graduated : awaiting).push(a);
        });
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
             eligible: selected.length, unmatched: unmatched,
             awaiting: awaiting, graduated: graduated };
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
        if (built.graduated && built.graduated.length) {
            console.log('  GRADUATED: ' + built.graduated.length + ' album(s) named as pending now have ' +
                        'audio and are ON THIS STATION — listen before they have been on air long:');
            for (const g of built.graduated) console.log('    ' + g);
        }
        if (built.awaiting && built.awaiting.length) {
            console.log('  note: ' + built.awaiting.length + ' album(s) are named as pending and have no audio ' +
                        'yet — each joins this station automatically once ingested.');
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
