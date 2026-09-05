import { verifyJWT } from '@/lib/auth';

/*
 * WHO IS TUNED TO WHAT, RIGHT NOW.
 *
 * Lifted out of app/api/radio/listeners/route.js so two routes can read one
 * truth: the public one that answers "3 / 17" to the dial, and the gated one
 * behind /listeners that shows the station operator the individual rows.
 *
 * ══ PRESENCE, NOT ANALYTICS. THIS IS STILL THE WHOLE POINT ══
 *
 * A listener count is only true for about a minute, worth nothing the moment it
 * is stale, and worth nothing tomorrow at all. So this lives in a Map in this
 * process and dies with it — no table, no rows, no write on every heartbeat
 * from every open tab. A restart shows zero for one heartbeat interval and
 * rebuilds itself from the clients still out there, which is correct behaviour
 * for a fact that is only ever about right now.
 *
 * ══ WHAT CHANGED, AND WHAT DID NOT ══
 *
 * This file used to store a random string and a slug, and its comment said so
 * proudly: no account, no IP. The station operator asked to see who is
 * listening and roughly where from, so it now also holds the connecting IP, the
 * rough location Cloudflare puts on that IP, and the account the request was
 * signed with — when it was signed with one at all.
 *
 * WHAT DID NOT CHANGE IS THE RETENTION, and that is the part that matters. All
 * of it is still in memory, still expires in 62 seconds, still vanishes on
 * restart, and is still never written anywhere. This is a live view of a room,
 * not a log of who was in it. Nothing here can answer "where was this person
 * last Tuesday", and it must stay that way: the moment any of this is
 * persisted it stops being presence and becomes surveillance with a different
 * retention policy, which is a decision for the owner and not a refactor.
 *
 * Who may SEE the rows is enforced elsewhere — lib/access.js, section
 * 'listeners'. The public route exposes COUNTS ONLY: how many are listening,
 * how many of those hold an account, and how many do not. Three integers about
 * a crowd, which is a different kind of fact from a row about a person — and
 * the line this file exists to keep on the correct side of.
 */

/* Three heartbeats of grace. The client beats every 20s, so a tab that is
   closed, slept, or driven into a tunnel disappears within a minute — long
   enough that a slow network does not blink somebody out of their own count,
   short enough that the number means "now". */
export const TTL_MS = 62_000;

/* A ceiling, because this Map is reachable by anyone who can POST. At 20,000
   sessions it is a few megabytes and far past any real audience; beyond it new
   sessions are refused rather than allowed to grow the process without bound.
   Existing listeners keep beating normally, so an attack degrades new joins
   rather than the live count. */
export const MAX_SESSIONS = 20_000;

/* Module scope, so it survives between requests in one process. `globalThis`
   rather than a bare const because Next's dev server re-evaluates route
   modules on edit and would otherwise hand every reload a fresh, empty Map.
   The key is the one this map has always used, so a deploy of this change does
   not orphan the listeners already beating into the old one. */
const LIVE = globalThis.__kjListeners || (globalThis.__kjListeners = new Map());

/* Sweep on read rather than on a timer: a timer keeps the process awake and has
   to be torn down on reload, and this Map is only ever interesting at the
   moment somebody asks about it. */
export function sweep(now = Date.now()) {
    for (const [id, row] of LIVE) {
        if (now - row.at > TTL_MS) LIVE.delete(id);
    }
}

export function tally(station) {
    let total = 0;
    let here = 0;
    for (const row of LIVE.values()) {
        total++;
        if (station && row.station === station) here++;
    }
    return { here, total };
}

/**
 * The same walk, split by whether the listener signed in.
 *
 * ══ THIS FUNCTION IS WHY THE REAL AUDIENCE HAS ITS OWN FILE ══
 *
 * The dial reads "X / Y / Z LISTENING": everybody, then the people with an
 * account, then everybody without one. The middle number is the only one on
 * that readout that is a fact about REAL PEOPLE and nothing else, and it stays
 * true precisely because this Map has never held anything but real people. The
 * stress fixture lives in lib/stress-listeners.js, is read from disk, is
 * appended at the route, and cannot reach in here — so `accounts` cannot be
 * inflated by a drill even by accident.
 *
 * Keep it that way. If a synthetic listener ever needs to exist, it gets its
 * own store; it does not get a flag in this one.
 *
 * `anon` is derived rather than counted so the two can never disagree.
 */
export function breakdown(station) {
    let total = 0;
    let here = 0;
    let accounts = 0;
    for (const row of LIVE.values()) {
        total++;
        if (station && row.station === station) here++;
        if (row.user) accounts++;
    }
    return { here, total, accounts, anon: total - accounts };
}

export function size() { return LIVE.size; }
export function has(session) { return LIVE.has(session); }
export function drop(session) { LIVE.delete(session); }

/**
 * Record a heartbeat.
 *
 * `since` is carried forward from any row already there, so the operator's view
 * can say how long somebody has been listening rather than how long ago their
 * last heartbeat was — which would read as "4 seconds" for everyone, forever.
 */
export function beat(session, { station, playing, ip, geo, user }) {
    const now = Date.now();
    const prior = LIVE.get(session);
    LIVE.set(session, {
        station,
        playing,
        at: now,
        since: prior?.since ?? now,
        /* The station they were on when the row was created. A listener who
           spins the dial is one listener, and the operator wants to see where
           they ARE, so this is overwritten every beat — but the arrival time
           is not, which is the distinction the two fields exist to make. */
        ip: ip || prior?.ip || null,
        geo: geo || prior?.geo || null,
        /* SIGNED-OUT DOES NOT UNDO SIGNED-IN mid-session: a token that has
           expired between beats would otherwise turn a named listener
           anonymous while they are still sitting there. A new session id is
           what a new person looks like. */
        user: user || prior?.user || null,
    });
}

/** A snapshot for the operator's view. Never the Map itself. */
export function rows() {
    sweep();
    return [...LIVE.entries()].map(([session, r]) => ({ session, ...r }));
}

/* ── Where the request came from ────────────────────────────────────────────
   kjubilee.com is behind Cloudflare, so cf-connecting-ip is the client and is
   set by the edge rather than by the client — unlike x-forwarded-for, which
   anyone can send and which arrives here as a chain once nginx has added to
   it. The fallbacks exist for a direct request that never crossed the edge. */
export function connectingIp(request) {
    const h = request.headers;
    return h.get('cf-connecting-ip')
        || (h.get('x-forwarded-for') || '').split(',')[0].trim()
        || h.get('x-real-ip')
        || null;
}

/**
 * The general vicinity, from Cloudflare's own headers.
 *
 * DELIBERATELY NOT A LOOKUP SERVICE. Resolving these ourselves would mean
 * sending every listener's IP to a third party on a 20-second heartbeat, which
 * is a far larger disclosure than the page it feeds. Cloudflare already knows
 * the IP — it terminated the connection — so taking what the edge volunteers
 * costs nothing and tells nobody new.
 *
 * WHAT ARRIVES DEPENDS ON THE PLAN. `cf-ipcountry` is on every plan including
 * Free; city, region and coordinates need Business or Enterprise, or the
 * "Add visitor location headers" Managed Transform switched on. So this
 * degrades on purpose: city if we have it, else region, else the country, else
 * nothing — and the page shows what it got rather than inventing a precision
 * that was never sent.
 */
export function edgeGeo(request) {
    const h = request.headers;
    const pick = (k) => {
        const v = h.get(k);
        return v && v !== 'XX' && v !== 'T1' ? v : null;   // Tor and unknown
    };

    const geo = {
        city: pick('cf-ipcity'),
        region: pick('cf-region') || pick('cf-region-code'),
        country: pick('cf-ipcountry'),
        continent: pick('cf-ipcontinent'),
        timezone: pick('cf-timezone'),
    };
    return Object.values(geo).some(Boolean) ? geo : null;
}

/**
 * The account this heartbeat was signed with, or null.
 *
 * READ FROM THE TOKEN, NOT THE DATABASE. Access tokens carry {sub, email}, so
 * naming a listener costs a HMAC rather than a query — which matters when the
 * caller is every open tab on the network every twenty seconds. The role is
 * deliberately not read here: this is a label on a live row, not a permission
 * check, and permission checks belong in lib/access.js where they are made
 * against the database every time.
 */
export function signedInAs(request) {
    const auth = request.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer ')) return null;
    const payload = verifyJWT(auth.slice(7));
    if (!payload) return null;
    const id = payload.sub || payload.userId || payload.id || null;
    if (!id) return null;
    return { id, email: payload.email || null };
}
