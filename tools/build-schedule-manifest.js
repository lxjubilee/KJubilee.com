#!/usr/bin/env node
/**
 * build-schedule-manifest.js — turns a station's track pool into a DATED
 * BROADCAST SCHEDULE: exactly which song is playing at every second of a UTC
 * day, published as a small JSON file the player resolves against its own clock.
 *
 *   node tools/build-schedule-manifest.js --station HM302.50-EN --date 2026-08-22
 *   node tools/build-schedule-manifest.js --station HM302.50-EN --days 2
 *
 * WHY THIS EXISTS
 *
 * A station can be served three ways, and they trade off very differently:
 *
 *   Icecast        one continuous encode, listeners share a timeline, and the
 *                  origin pays 192 kbps PER LISTENER. A 600 Mbit/s port is
 *                  ~2,200 listeners and no further.
 *   music.json     the player downloads the whole catalogue and shuffles it
 *                  locally. Costs the origin almost nothing and scales without
 *                  limit, but every listener hears something different, so
 *                  there is no "now playing", no schedule guide, and no way to
 *                  land a Sabbath or Feast overlay on the audience at once.
 *   THIS FILE      the schedule is decided in advance and published. The player
 *                  computes what should be sounding right now and seeks into
 *                  it, so listeners share a timeline exactly as they would on
 *                  a broadcast — while the audio still comes from the CDN and
 *                  the origin serves ~22 KB per listener per day.
 *
 * It is the third that this repository's engine spec was already reaching for:
 * §7 has a nightly cron that resolves the Kingdom Calendar for the next 48h and
 * writes station queues. That queue IS this file. Nothing here invents
 * scheduling policy — it lays an already-chosen order onto a clock.
 *
 * DETERMINISM IS THE CONTRACT. Same station + same date must always produce
 * byte-identical output, because clients re-fetch and any two of them must agree.
 * The shuffle is therefore seeded from the station id and the date and never
 * from Math.random() or the wall clock. Rebuilding a past day is safe.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const tenants = require('./lib/tenants');
const zone = require('./lib/zone');

const ROOT = path.join(__dirname, '..');

/**
 * Where the canonical audio actually lives. Verified serving 206 byte-ranges.
 *
 * READ FROM KJ_CDN_URL, NOT PUBLIC_CDN_URL. The production .env already defines
 * PUBLIC_CDN_URL as https://cdn.jubileeverse.com — the SOURCE cdn, a different
 * project's host — and an earlier version of this file honoured it. The result
 * was twelve published schedules whose every track pointed at kJubilee's
 * canonical path on JubileeVerse's host, which does not carry that layout: not
 * merely the wrong CDN but a 404 for every song. Its own variable, and a guard
 * below, so a stray environment cannot redirect a broadcast.
 */
const DEFAULT_CDN_BASE = process.env.KJ_CDN_URL || 'https://cdn.kjubilee.com';

/**
 * Refuse to write a schedule that addresses somebody else's CDN.
 *
 * docs/MUSIC-REPOSITORY-SPEC.md §1a: every airing song must be a kJubilee-owned
 * copy served from the kJubilee bucket. A schedule is the most load-bearing
 * place that rule applies — it is what every listener resolves against — and it
 * is also the easiest place to break it by accident, from one env var.
 */
function assertCdnBase(base, force) {
    let host;
    try { host = new URL(base).host; } catch (e) { throw new Error('cdn base is not a URL: ' + base); }
    if (force || host === 'cdn.kjubilee.com' || host.endsWith('.kjubilee.com')) return base;
    throw new Error(
        'refusing to publish a schedule pointing at ' + host + '.\n' +
        '  Every airing song must be a kJubilee-owned copy on cdn.kjubilee.com ' +
        '(MUSIC-REPOSITORY-SPEC §1a).\n' +
        '  Set KJ_CDN_URL, or pass --force-cdn-base if this is deliberate.');
}

/**
 * The prefix build-station-manifest.js writes under `--url-layout canonical`.
 * It is a VPS-relative path meant for local dev; on the published schedule the
 * same object is addressed absolutely on the CDN, so this is the piece that
 * gets swapped. Keeping the swap here rather than changing the other tool means
 * the manifest builder keeps behaving exactly as its own README documents.
 */
const CANONICAL_PREFIX = '/cdn/music';

// Day length is per-date and per-zone; see zone.dayLengthSeconds().

// ── deterministic shuffle ────────────────────────────────────────────────────

/** FNV-1a over a string. Stable across processes and machines, unlike hashCode. */
function seedFrom(text) {
    let h = 2166136261 >>> 0;
    for (const ch of text) { h = (h ^ ch.charCodeAt(0)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
}

/** mulberry32 — small, fast, and fully determined by its seed. */
function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffled(items, seed) {
    const out = items.slice();
    const rand = rng(seed);
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
}

// ── the schedule ─────────────────────────────────────────────────────────────

/**
 * Lay tracks end to end from 00:00:00Z until the day is covered.
 *
 * The pool is almost always shorter than a day — Gospel Fire is 11.6h of unique
 * audio against a 24h clock — so it is walked more than once, RESHUFFLED each
 * pass. Two things follow from that and both are deliberate:
 *
 *   - a fresh shuffle per pass means the second airing of a song lands at a
 *     different hour than the first, which is what stops a station sounding
 *     like a tape loop to anyone listening across the day;
 *   - a pass may not begin with the track the previous pass ended on, or the
 *     same song would play twice back to back across the seam.
 *
 * The last entry of a day overruns midnight and is CLIPPED by the next day's
 * file, which always starts a fresh track at 00:00:00Z. That costs one cut per
 * day at the quietest hour, and buys days that are independent of each other:
 * any date can be rebuilt on its own, in any order, without replaying history.
 */
function buildDay(pool, stationId, dateISO, daySeconds) {
    const baseSeed = seedFrom(stationId + '|' + dateISO);
    // NOT a constant. A Pacific day is 23 hours the morning the clocks go
    // forward and 25 the morning they go back; filling a fixed 86,400 would
    // leave an hour of silence on one and drop an hour of programming on the
    // other. See tools/lib/zone.js.
    const DAY = daySeconds || zone.dayLengthSeconds(dateISO);
    const entries = [];
    let t = 0;
    let pass = 0;
    let lastId = null;

    while (t < DAY) {
        let order = shuffled(pool, (baseSeed + pass * 0x9E3779B9) >>> 0);
        // Never repeat across the seam between passes.
        if (order.length > 1 && lastId !== null && order[0].track_id === lastId) {
            order.push(order.shift());
        }
        for (const track of order) {
            if (t >= DAY) break;
            entries.push({
                t: t,
                d: track.duration_s,
                u: track.rel,
                ti: track.title,
                ar: track.artist,
                al: track.album,
                id: track.track_id,
            });
            t += track.duration_s;
            lastId = track.track_id;
        }
        pass++;
        if (pass > 100) throw new Error('pool too short to fill a day: ' + stationId);
    }
    return entries;
}

/** Pull the playable tracks out of a canonical-layout music.json. */
// `expectStation` is not optional. A day file is built from a pool and stamped
// with a station identity, and until 2026-08-23 nothing checked that the two
// referred to the same station: pointing --pool at the wrong manifest produced
// a correctly-labelled day file full of another station's music. That is not
// hypothetical — the 2026-08-21 files for two stations were built that way
// and published, putting 188 off-roster tracks in 8 languages on an
// English-only flagship. See MUSIC-REPOSITORY-SPEC §8.
function poolFrom(manifestPath, expectStation) {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!m.station_id) {
        throw new Error(
            'pool manifest has no station_id: ' + manifestPath +
            '\n  Rebuild it with tools/build-station-manifest.js. A pool with no ' +
            'identity cannot be checked against the station it is scheduled for.');
    }
    if (m.station_id !== expectStation) {
        throw new Error(
            'POOL/STATION MISMATCH - refusing to build.' +
            '\n  --station ' + expectStation +
            '\n  --pool    ' + manifestPath +
            '  (station_id ' + m.station_id + ', slug ' + m.station_slug + ')' +
            '\n  This would have written a ' + expectStation + ' day file ' +
            'containing ' + m.station_id + ' music.');
    }
    const out = [];
    for (const album of m.albums || []) {
        for (const track of album.tracks || []) {
            // A track with no readable duration cannot be placed on a clock.
            // Dropping it is right: guessing a length would desynchronise every
            // listener for the rest of the day.
            if (!track.duration_s || !track.url) continue;
            if (track.url.indexOf(CANONICAL_PREFIX + '/') !== 0) {
                throw new Error(
                    'track url is not canonical layout: ' + track.url +
                    '\n  Rebuild the pool with --url-layout canonical. A schedule must address ' +
                    'the kJubilee copy, never another project\'s CDN (see MUSIC-REPOSITORY-SPEC §1a).');
            }
            out.push({
                track_id: track.track_id,
                title: track.title,
                artist: track.artist,
                album: track.album || '',
                duration_s: Math.round(track.duration_s),
                rel: track.url.slice(CANONICAL_PREFIX.length + 1),   // "imani-inspire/en/…"
            });
        }
    }
    return out;
}

function addDays(dateISO, n) {
    const d = new Date(dateISO + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/**
 * THE PREFLIGHT VALIDATION GATE — streaming-services.md §5.6.
 *
 * "No schedule is ever served until it passes assertion. Catching one bad
 * schedule on the server is worth a hundred recovery paths on the client."
 *
 * Every assertion here corresponds to something a listener would hear. They are
 * not sanity checks on a data structure; they are the list of ways a day file
 * has actually broken a broadcast:
 *
 *   monotonic starts   a generator ordering bug, and the player's binary search
 *                      silently returns the wrong entry on an unsorted array
 *   no gaps            the listener hits silence at a boundary
 *   no overlaps        two entries claim the same second and position math
 *                      becomes ambiguous — which song is "now" is undefined
 *   durations present  a zero or missing duration lands the next hand-over
 *                      wrong and every one after it
 *   full coverage      playback falls off the end of the day
 *
 * A failure REJECTS the schedule. §5.6 is explicit that the generator does not
 * ship a partial or patched file: it fails loudly and whatever was published
 * before stays published, because yesterday's correct schedule is worth more
 * than today's broken one.
 *
 * Returns a list of problems; empty means the schedule may be written.
 */
function validateDay(doc) {
    const problems = [];
    const es = (doc && doc.entries) || [];

    if (!es.length) { problems.push('no entries at all'); return problems; }

    for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (typeof e.t !== 'number' || !isFinite(e.t) || e.t < 0) {
            problems.push('entry ' + i + ' has no usable start (t=' + e.t + ')');
        }
        // §5.6: "Every duration_ms present and non-zero". A zero-length entry is
        // not a short song, it is an entry the clock passes straight through.
        if (typeof e.d !== 'number' || !isFinite(e.d) || e.d <= 0) {
            problems.push('entry ' + i + ' (' + (e.ti || '?') + ') has no usable duration (d=' + e.d + ')');
        }
        if (!e.u) problems.push('entry ' + i + ' has no file path');
    }

    for (let i = 1; i < es.length; i++) {
        if (!(es[i].t > es[i - 1].t)) {
            problems.push('start times are not strictly increasing at entry ' + i +
                          ' (' + es[i - 1].t + 's then ' + es[i].t + 's)');
        }
        const endOfPrev = es[i - 1].t + es[i - 1].d;
        if (es[i].t > endOfPrev) {
            problems.push('gap of ' + (es[i].t - endOfPrev) + 's before entry ' + i +
                          ' — the listener hits silence at ' + endOfPrev + 's');
        }
        if (es[i].t < endOfPrev) {
            problems.push('overlap of ' + (endOfPrev - es[i].t) + 's at entry ' + i +
                          ' — two entries claim second ' + es[i].t);
        }
    }

    if (es[0].t !== 0) problems.push('the day does not start at second 0 (first entry at ' + es[0].t + 's)');

    // The last entry is allowed to overrun midnight and be clipped by the next
    // day's file - that is the documented seam - but the day must be COVERED.
    const covered = es[es.length - 1].t + es[es.length - 1].d;
    if (covered < doc.seconds) {
        problems.push('programming stops ' + (doc.seconds - covered) + 's before the day ends (' +
                      covered + 's of ' + doc.seconds + 's) — playback would fall off the end');
    }

    return problems;
}

/**
 * §5.6's remaining two assertions need something this repository does not have
 * yet, and saying so once is better than passing a schedule that was never
 * actually checked.
 *
 *   every file_url reachable   costs one request per unique object; the
 *                              publisher is the right place for it because that
 *                              is where the CDN is in the picture. Offered here
 *                              as an opt-in rather than run on every build.
 *   every file normalized      §11.2 requires a `normalized` flag and a
 *                              measured `loudness_lufs` on every track record.
 *                              The ingest pipeline does not write either yet, so
 *                              there is nothing to gate on. The check is written
 *                              to enforce it the moment the field appears, and
 *                              to report the absence rather than quietly pass.
 */
function validateLoudness(pool) {
    const withFlag = pool.filter(t => typeof t.normalized !== 'undefined');
    if (!withFlag.length) {
        return { enforceable: false, problems: [],
                 note: 'no track carries a `normalized` flag — loudness cannot be gated ' +
                       '(streaming-services.md §11.2 requires it at ingest)' };
    }
    const bad = withFlag.filter(t => t.normalized !== true).map(t => t.track_id);
    return {
        enforceable: true,
        problems: bad.length ? ['not cleared as normalized: ' + bad.slice(0, 8).join(', ') +
                                (bad.length > 8 ? ' (+' + (bad.length - 8) + ' more)' : '')] : [],
        note: withFlag.length < pool.length
            ? (pool.length - withFlag.length) + ' of ' + pool.length + ' tracks carry no normalized flag'
            : '',
    };
}

function build(opts) {
    assertCdnBase(opts.cdnBase, opts.forceCdnBase);
    const pool = poolFrom(opts.pool, opts.station);
    if (!pool.length) throw new Error('no playable tracks in ' + opts.pool);

    // §11.2: the generator must refuse anything not cleared as normalized. It
    // can only do that once ingest writes the flag; until then this says so out
    // loud on every run rather than letting the gate look complete.
    const loud = validateLoudness(pool);
    if (loud.problems.length) {
        throw new Error('PREFLIGHT FAILED for ' + opts.station +
                        ' \u2014 refusing to schedule unnormalized audio.\n  ' + loud.problems.join('\n  '));
    }
    if (loud.note) console.warn('  note: ' + loud.note);

    const written = [];
    for (let i = 0; i < opts.days; i++) {
        const date = addDays(opts.date, i);
        const t = tenants.load(opts.station);
        const tz = (t && t.timezone) || zone.DEFAULT_ZONE;
        const startsAt = zone.dayStartUTC(date, tz);
        const seconds = zone.dayLengthSeconds(date, tz);
        const entries = buildDay(pool, opts.station, date, seconds);
        const doc = {
            schema: 'kj.tenant.day/1',
            tenant: opts.station,
            // Carried so the player can label itself from the day file alone,
            // without a second fetch of the tenant record.
            name: t ? t.name : undefined,
            hm: t ? t.hm : undefined,
            lang: t && t.language ? t.language.tag : undefined,
            // What the player shows on line two, so it needs no second fetch.
            format: t ? t.format : undefined,
            slug: t ? t.slug : undefined,
            date: date,
            tz: tz,
            // THE INSTANT THIS DAY BEGINS, and the reason the player carries no
            // timezone code at all: it subtracts this from the clock and has the
            // second-of-day directly. Without it every client would need the
            // IANA rules and the DST edges to agree with the generator.
            startsAt: new Date(startsAt).toISOString(),
            seconds: seconds,
            cdnBase: opts.cdnBase,
            prefix: 'music/',
            // NOT a timestamp of when this ran: the file must be byte-identical
            // on every rebuild of the same day, and a generated-at stamp would
            // break that for no gain. The date IS the version.
            poolTracks: pool.length,
            entries: entries,
        };

        // THE REVISION the player checks against the copy it is holding.
        //
        // A CONTENT HASH, not a timestamp, for exactly the reason the comment
        // above gives: rebuilding the same day must produce the same bytes. A
        // generated-at stamp would change on every nightly run and tell every
        // listener in the world to re-download a file identical to the one they
        // already have. This changes only when the programming does — a
        // re-ingest, a rotation change, a station renamed — and that is the only
        // time anyone should be asked to fetch it again.
        //
        // Computed over the whole document, so a change to the station's name or
        // format propagates too: the player labels itself from this file.
        doc.rev = crypto.createHash('sha256')
            .update(JSON.stringify(doc))
            .digest('hex')
            .slice(0, 12);
        // §5.6 — THE GATE. Nothing is written until the day passes, and a
        // failure takes the whole run down rather than writing the ones that
        // happened to be fine: a partially published station is a station whose
        // listeners fall off a cliff at an unpredictable hour.
        const problems = validateDay(doc);
        if (problems.length) {
            throw new Error(
                'PREFLIGHT FAILED for ' + opts.station + ' ' + date + ' — refusing to write.\n  ' +
                problems.slice(0, 12).join('\n  ') +
                (problems.length > 12 ? '\n  (+' + (problems.length - 12) + ' more)' : '') +
                '\n  Nothing was written; the previously published schedule stands.');
        }

        // The published object key IS the layout on disk, so what is staged
        // locally and what the browser asks for cannot drift apart.
        const key = tenants.deliveryKey(opts.station, date);
        const file = path.join(opts.out, key);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(doc));
        written.push({ file: file, key: key, date: date, entries: entries.length, doc: doc });
    }
    return written;
}

// ── cli ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
    const argv = process.argv.slice(2);
    const opt = (name, fallback) => {
        const i = argv.indexOf('--' + name);
        return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
    };
    const station = opt('station');
    if (!station) {
        console.error('usage: node tools/build-schedule-manifest.js --station <ID> [--date YYYY-MM-DD]');
        console.error('       [--days N] [--pool <music.json>] [--out <dir>] [--cdn-base <url>]');
        process.exit(1);
    }
    const opts = {
        station: station,
        // Default to the BROADCAST date, not the UTC one — see the note in
        // r2-publish-schedules.js.
        date: opt('date', zone.localDate(Date.now())),
        days: Number(opt('days', 1)),
        pool: opt('pool', path.join(ROOT, 'tmp', 'pools', station + '.music.json')),
        out: opt('out', process.env.CDN_LOCAL_ROOT || path.join(ROOT, 'cdn')),
        cdnBase: opt('cdn-base', DEFAULT_CDN_BASE),
        forceCdnBase: argv.includes('--force-cdn-base'),
    };
    if (!fs.existsSync(opts.pool)) {
        console.error('pool manifest not found: ' + opts.pool);
        console.error('build one first:');
        console.error('  node tools/build-station-manifest.js --station ' + station +
                      ' --url-layout canonical --out ' + opts.pool);
        process.exit(1);
    }
    for (const w of build(opts)) {
        const hours = (w.doc.entries[w.doc.entries.length - 1].t +
                       w.doc.entries[w.doc.entries.length - 1].d) / 3600;
        console.log(w.date + '  ' + String(w.entries).padStart(4) + ' entries  ' +
            'covers ' + hours.toFixed(2) + 'h  ' +
            (fs.statSync(w.file).size / 1024).toFixed(0) + ' KB  ' + w.file);
    }
}

module.exports = { build, buildDay, poolFrom, seedFrom, shuffled, assertCdnBase, validateDay, validateLoudness };
