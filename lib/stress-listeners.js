import fs from 'node:fs';
import path from 'node:path';

/*
 * THE SYNTHETIC AUDIENCE, READ OFF THE CLOCK.
 *
 * tools/build-stress-listeners.js writes a roster of a few hundred fictional
 * listeners and twenty-four hour files saying which of them are on air during
 * each UTC hour. This is the other half: it decides which hour file is live at
 * this instant, which third of that hour we are in, and hands the result to
 * /api/admin/listeners in the same shape lib/presence.js hands it real rows.
 *
 * ══ OFF UNLESS SOMEBODY TURNED IT ON ══
 *
 * STRESS_TEST_LISTENERS must be exactly "true". Anything else — unset, empty,
 * "1", "yes", "TRUE" — is off. A fixture that invents an audience is not the
 * kind of thing that should start because a value was almost right.
 *
 * ══ NOTHING IN HERE CALLS Math.random, AND THAT IS LOAD-BEARING ══
 *
 * /listeners polls every ten seconds. If any of this were random, the grid
 * would reshuffle six times a minute: durations would jump backwards, rows
 * would appear and vanish mid-sentence, and the page would be unreadable
 * exactly when somebody was trying to read it. So every decision here — the
 * minute the hour rolls over, when the churns fall, who is playing and who is
 * paused, how long each person has been listening — is a hash of the day, the
 * hour and the listener's id. Two requests a second apart get identical
 * answers; two requests an hour apart get properly different ones.
 *
 * ══ THE HOUR DOES NOT TURN OVER ON THE HOUR ══
 *
 * Real audiences do not change on a round number, and an operator watching a
 * grid that visibly re-deals itself at :00 learns to discount it. So each hour
 * has its own switch minute somewhere in the first ten minutes past — derived
 * from the date and the hour, so it is stable within a run and different
 * tomorrow. Inside that window the headcount moves again at one or two churn
 * points, which is what the hour files' three slots per listener are for.
 *
 * ══ WHAT IT IS NOT ══
 *
 * It never touches lib/presence.js. The real Map stays the real Map: a
 * genuine listener is never mixed into this file's bookkeeping, and turning
 * the switch off returns the page to the truth with no cleanup. And nothing
 * here is ever written anywhere — the same rule presence has always had.
 *
 * setup/radio-stress-testing.md is authoritative over this comment.
 */

const DIR = path.join(process.cwd(), 'data', 'stress-listeners');
const ROSTER = path.join(DIR, 'roster.json');
const HOURS = path.join(DIR, 'hours');

/** Exactly "true", and nothing else. */
export function stressEnabled() {
    return process.env.STRESS_TEST_LISTENERS === 'true';
}

/**
 * Whether the dial's "X / Y / Z LISTENING" should count them too.
 *
 * OPT-OUT, NOT OPT-IN, AND THE ASYMMETRY WITH THE SWITCH ABOVE IS DELIBERATE.
 * That one must be exactly "true" because it is the difference between a real
 * page and a fabricated one. This one cannot do anything at all unless that one
 * is already on, so a strict default would only produce a quiet failure: a box
 * whose .env predates this flag would run a drill whose dial never moved, and
 * the operator would be debugging the dial instead of watching it.
 *
 * It moves X and Z. It cannot move Y — the fixture has no accounts to count.
 */
export function stressCountsPublicly() {
    return stressEnabled() && process.env.STRESS_TEST_PUBLIC_COUNT !== 'false';
}

/* FNV-1a, turned into a number in [0,1). Not a cryptographic hash and does not
   need to be: its whole job is to be the same on every call for the same
   string, and different enough for strings that differ by one character. */
function h01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
}

/* ── The files, cached against their own mtime ──────────────────────────────
   Re-parsing four hundred roster entries every ten seconds for every open tab
   would be silly, and caching them forever would mean a rebuild needed a
   server restart to show up — which, during a drill, is exactly the moment
   nobody wants to bounce the site. One stat() per read splits the difference. */
const CACHE = globalThis.__kjStressCache || (globalThis.__kjStressCache = new Map());

function readCached(file) {
    let stat;
    try { stat = fs.statSync(file); } catch { CACHE.delete(file); return null; }
    const hit = CACHE.get(file);
    if (hit && hit.mtime === stat.mtimeMs) return hit.data;
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        CACHE.set(file, { mtime: stat.mtimeMs, data });
        return data;
    } catch {
        /* A half-written file during a rebuild. Keep the last good copy rather
           than blanking the grid mid-drill. */
        return hit ? hit.data : null;
    }
}

function roster() {
    const data = readCached(ROSTER);
    if (!data) return null;
    if (!data.__index) {
        Object.defineProperty(data, '__index', {
            value: new Map(data.listeners.map((l) => [l.id, l])),
            enumerable: false,
        });
    }
    return data;
}

function hourFile(h) {
    return readCached(path.join(HOURS, 'hour-' + String(h).padStart(2, '0') + '.json'));
}

// ── The clock ──────────────────────────────────────────────────────────────

const dayKey = (d) => d.toISOString().slice(0, 10);

/** How many minutes past the hour this hour's file takes over. 0 to <10. */
function switchMinute(day, hour) {
    return Math.floor(h01(day + ':' + hour + ':switch') * 10);
}

/** One or two churns inside the hour, and the minute each falls on. */
function churnsFor(day, hour) {
    const two = h01(day + ':' + hour + ':churns') < 0.55;
    if (!two) return [12 + Math.floor(h01(day + ':' + hour + ':c1') * 30)];
    return [
        10 + Math.floor(h01(day + ':' + hour + ':c1') * 16),
        30 + Math.floor(h01(day + ':' + hour + ':c2') * 18),
    ];
}

/**
 * Which hour file is live, how far into its window we are, and which segment.
 *
 * The window for hour H runs from H:switchMinute(H) to (H+1):switchMinute(H+1),
 * so it is a little under or a little over sixty minutes and never lines up
 * with the clock face.
 */
export function stressClock(now = new Date()) {
    const pinned = process.env.STRESS_TEST_HOUR;
    const utcHour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    /* Before this hour's switch minute we are still inside the PREVIOUS hour's
       window — including, at 00:0x UTC, yesterday's hour 23. */
    let hour = utcHour;
    let day = dayKey(now);
    let elapsed;
    let windowStartMs;

    const sw = switchMinute(day, utcHour);
    if (minute < sw) {
        const before = new Date(now.getTime() - 3600_000);
        hour = before.getUTCHours();
        day = dayKey(before);
        const swPrev = switchMinute(day, hour);
        elapsed = 60 - swPrev + minute;
        windowStartMs = Date.UTC(before.getUTCFullYear(), before.getUTCMonth(), before.getUTCDate(),
            hour, swPrev, 0, 0);
    } else {
        elapsed = minute - sw;
        windowStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
            utcHour, sw, 0, 0);
    }

    if (pinned !== undefined && pinned !== '') {
        const p = Number(pinned);
        if (Number.isInteger(p) && p >= 0 && p <= 23) hour = p;
    }

    const churns = churnsFor(day, hour);
    let segment = 0;
    for (const c of churns) if (elapsed >= c) segment++;

    /* The next boundary, so the page can say when the picture changes rather
       than leaving an operator wondering whether it has frozen. */
    const upcoming = churns.find((c) => c > elapsed);
    const nextInMin = upcoming !== undefined
        ? upcoming - elapsed
        : (60 - elapsed) + switchMinute(dayKey(new Date(now.getTime() + 3600_000)), (hour + 1) % 24);

    return {
        hour, day, elapsed, segment, churns,
        segments: churns.length + 1,
        /* The wall-clock instant this hour's window opened. Every session start
           is anchored to it rather than derived from `now`, so a row's start
           time is the same on every poll and the "For" column climbs in real
           time instead of standing still between whole minutes. */
        windowStartMs,
        nextInMin,
        pinned: pinned !== undefined && pinned !== '',
    };
}

/**
 * Is this listener on air in this segment?
 *
 * The hour file cuts each hour into three slots. When the runtime only picked
 * ONE churn there are two segments to fill with three slots, so the second
 * segment covers slots two and three together — otherwise everybody written
 * into the middle slot would silently never appear on a one-churn hour.
 */
function inSegment(slots, segment, segments) {
    if (segments === 3) return slots[segment] === '1';
    return segment === 0 ? slots[0] === '1' : slots[1] === '1' || slots[2] === '1';
}

/**
 * The minute of the window at which somebody whose first slot is `startSlot`
 * came on. Zero for anyone here from the top; otherwise the churn that let
 * them in — which, because they are only visible once that churn has passed,
 * is always a minute already behind us.
 */
function joinMinute(clock, startSlot) {
    if (startSlot <= 0) return 0;
    if (clock.segments === 3) return clock.churns[startSlot - 1];
    return clock.churns[0];
}

/**
 * The synthetic rows for right now, in the same shape lib/presence.js `rows()`
 * returns — so /api/admin/listeners maps one list, not two.
 *
 * `user` is always null and always will be. These are addresses, not accounts:
 * nobody in this fixture has signed in, because inventing a signed-in listener
 * would mean inventing an email address that could collide with a real one.
 */
export function stressRows(now = new Date()) {
    if (!stressEnabled()) return [];
    const book = roster();
    if (!book) return [];

    const clock = stressClock(now);
    const hour = hourFile(clock.hour);
    if (!hour) return [];

    const at = now.getTime();
    const out = [];

    for (const entry of hour.listeners) {
        if (!inSegment(entry.s, clock.segment, clock.segments)) continue;
        const p = book.__index.get(entry.i);
        if (!p) continue;

        /* WHEN THEY TUNED IN, as an instant rather than a duration.
           Anchored to the window's own start, never to `now` — a start time
           derived from the clock would slide forward on every poll, freezing
           the "For" column at whole minutes and, for anybody who joined
           mid-hour, pinning them at zero seconds forever.

           Somebody already here at the top of the hour gets `entry.h` whole
           hours plus a fixed per-person offset, so the column is not twenty
           rows all reading exactly "2h 14m". Somebody who joined part-way
           through this hour is dated to the churn they actually arrived on,
           which is a minute the clock knows and is never in the future. */
        const since = entry.h === 0
            ? clock.windowStartMs + joinMinute(clock, entry.s.indexOf('1')) * 60_000
            : clock.windowStartMs
                - (entry.h * 60 + Math.floor(h01(entry.i + ':joined') * 50)) * 60_000;

        out.push({
            session: 'stress-' + entry.i,
            station: p.station,
            /* Paused rows are re-rolled at each churn, so somebody who steps
               away between segments shows as tuned-but-quiet — the same
               distinction the dot on the real rows makes. */
            playing: h01(entry.i + clock.day + clock.hour + clock.segment + ':play') < 0.88,
            at,
            since,
            ip: p.ip,
            geo: { city: p.city, region: p.region, country: p.country },
            user: null,
            /* Not on a real row, because a browser cannot be trusted to state
               its own platform and lib/presence.js therefore never asks. Here
               it is fixture data, and the device mix is the thing being
               drilled. */
            device: p.device,
            agent: p.agent,
            synthetic: true,
        });
    }

    return out;
}

/**
 * What the page puts in its banner. Present whenever the switch is on, so an
 * operator can always find out that what they are looking at is a drill.
 *
 * THIS IS NOT OPTIONAL AND HAS NO SWITCH OF ITS OWN. Rows that could not be
 * told apart from a real audience are how a stress test ends up in somebody's
 * board pack as a listener number. The drill is realistic because the grid is
 * full, not because the page is lying about what it is.
 */
export function stressStatus(now = new Date()) {
    if (!stressEnabled()) return null;
    const clock = stressClock(now);
    const hour = hourFile(clock.hour);
    const book = roster();
    return {
        active: true,
        seed: book ? book.seed : null,
        built: book ? book.generated : null,
        population: book ? book.population : 0,
        hour: clock.hour,
        pinned: clock.pinned,
        segment: clock.segment + 1,
        segments: clock.segments,
        nextChangeMin: Math.max(0, Math.round(clock.nextInMin)),
        energy: hour ? hour.energy : null,
        energyLabel: hour ? hour.energyLabel : null,
        suitableFor: hour ? hour.suitableFor : null,
        nightShare: hour ? hour.nightShare : null,
        publicCount: stressCountsPublicly(),
    };
}

/**
 * The counts alone, for the dial's public readout. Zero unless opted in.
 *
 * THERE IS NO `accounts` FIELD AND THERE NEVER WILL BE. Every listener in this
 * fixture is anonymous by construction — see `stressRows`, where `user` is
 * hard-wired to null — so a drill can move the dial's first and third numbers
 * and can never touch the second. That is the whole reason the middle number is
 * worth printing: it is the one figure on the dial that a stress test cannot
 * reach.
 */
export function stressTally(station, now = new Date()) {
    if (!stressCountsPublicly()) return { here: 0, total: 0 };
    const rows = stressRows(now);
    let here = 0;
    for (const r of rows) if (station && r.station === station) here++;
    return { here, total: rows.length };
}
