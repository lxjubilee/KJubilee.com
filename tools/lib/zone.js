'use strict';
/**
 * zone.js — broadcast-day arithmetic in a named time zone.
 *
 * The dial runs on Pacific time. A "day" is therefore midnight-to-midnight in
 * America/Los_Angeles, not in UTC, and that has one consequence everything else
 * here exists to handle: **a Pacific day is not always 86,400 seconds.**
 *
 *   2026-03-08   23 hours   clocks go 01:59:59 -> 03:00:00 (spring forward)
 *   2026-11-01   25 hours   01:59:59 -> 01:00:00 happens twice (fall back)
 *
 * A generator that assumes 86,400 produces an hour of silence at the end of one
 * day a year and drops an hour of programming on another. A player that assumes
 * it puts every listener an hour out for the rest of the day. So the day length
 * is measured, never assumed.
 *
 * NO DEPENDENCY. Intl carries the IANA database, so the offsets come from the
 * platform rather than from a table in this repo that would need maintaining
 * every time a legislature moves a date.
 */

/** The zone the dial broadcasts on. */
const DEFAULT_ZONE = process.env.KJ_TIMEZONE || 'America/Los_Angeles';

/**
 * How far the zone is from UTC at a given instant, in ms. Negative west of
 * Greenwich, so Los Angeles is -7h in summer and -8h in winter.
 */
function offsetMs(utcMs, zone) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = {};
    for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
    // hour comes back as 24 at midnight in some ICU versions.
    const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
    return asIfUTC - utcMs;
}

/**
 * The UTC instant at which a local calendar day begins.
 *
 * Two passes, and the second is not belt-and-braces. The first guess uses the
 * offset in force at UTC midnight, which on a DST-change date is the offset from
 * the WRONG side of the transition; re-reading the offset at the guessed instant
 * and correcting lands it on the real local midnight.
 */
function dayStartUTC(dateISO, zone) {
    const z = zone || DEFAULT_ZONE;
    const naive = Date.parse(dateISO.slice(0, 10) + 'T00:00:00Z');
    let guess = naive - offsetMs(naive, z);
    guess = naive - offsetMs(guess, z);
    return guess;
}

/** Seconds in a local day — 82800, 86400 or 90000. */
function dayLengthSeconds(dateISO, zone) {
    const z = zone || DEFAULT_ZONE;
    return Math.round((dayStartUTC(addDays(dateISO, 1), z) - dayStartUTC(dateISO, z)) / 1000);
}

/** The local calendar date at a given instant, as YYYY-MM-DD. */
function localDate(utcMs, zone) {
    // en-CA formats as YYYY-MM-DD, which is the whole reason it is used here.
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: zone || DEFAULT_ZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(utcMs));
}

function addDays(dateISO, n) {
    const d = new Date(dateISO.slice(0, 10) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** A short label for humans: "PST" / "PDT". */
function abbrev(utcMs, zone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone || DEFAULT_ZONE, timeZoneName: 'short',
    }).formatToParts(new Date(utcMs));
    const tzn = parts.find(p => p.type === 'timeZoneName');
    return tzn ? tzn.value : '';
}

module.exports = { DEFAULT_ZONE, offsetMs, dayStartUTC, dayLengthSeconds, localDate, addDays, abbrev };
