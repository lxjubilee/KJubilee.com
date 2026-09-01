import { json, NO_STORE, clientIp } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// /api/radio/listeners — who is tuned to what, right now.
//
// The dial shows "3 / 17": three people on the frequency under the needle,
// seventeen across the whole network. This is where both numbers come from.
//
// PRESENCE, NOT ANALYTICS, and the distinction decides everything else here.
// A listener count is only true for about a minute; it is worth nothing the
// moment it is stale, and it is worth nothing tomorrow at all. So it lives in
// a Map in this process and dies with it — no table, no rows, no write on
// every heartbeat from every open tab. A restart shows zero for one heartbeat
// interval and then rebuilds itself from the clients still out there, which is
// the correct behaviour for a fact that is only ever about right now.
//
// WHAT IS STORED IS A RANDOM STRING AND A SLUG. No account, no IP, no user
// agent, nothing that outlives TTL_MS. The id is minted by the browser and
// means nothing to anything else on this site; two tabs of one browser share
// it deliberately, so a person who opens the dial twice is one listener.
//
// COUNTS ARE TUNED, NOT PLAYING. Someone sitting on a frequency with the sound
// paused is on that frequency — the dial says so, and gating on playback would
// make the number drop every time somebody paused to take a call. `playing` is
// still reported so a future breakdown can tell the two apart without a client
// change.
//
// SINGLE PROCESS, AND THAT IS A REAL LIMIT. Production is one Next standalone
// server, so one Map is the whole truth. Behind two instances this would count
// only the listeners that happened to land on the same one; the fix then is a
// shared store (Redis), not a bigger Map, and this comment is the warning that
// the change is not free.
// ─────────────────────────────────────────────────────────────────────────

/* Three heartbeats of grace. The client beats every 20s, so a tab that is
   closed, slept, or driven into a tunnel disappears within a minute — long
   enough that a slow network does not blink somebody out of their own count,
   short enough that the number means "now". */
const TTL_MS = 62_000;

/* A ceiling, because this Map is reachable by anyone who can POST. At 20,000
   sessions it is a few megabytes and far past any real audience; beyond it new
   sessions are refused rather than allowed to grow the process without bound.
   Existing listeners keep beating normally, so an attack degrades new joins
   rather than the live count. */
const MAX_SESSIONS = 20_000;

/* The station key is a catalogue slug — `throne-room-vegas`, `jubilee-radio`.
   Pinned to the shape slugs actually have rather than accepted as free text:
   this string is a Map key and goes back out in a response, and "it is only a
   key" is how a key becomes an injection point later. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;

/* Module scope, so it survives between requests in one process. `globalThis`
   rather than a bare const because Next's dev server re-evaluates route
   modules on edit and would otherwise hand every reload a fresh, empty Map. */
const LIVE = globalThis.__kjListeners || (globalThis.__kjListeners = new Map());

/* Sweep on read rather than on a timer: a timer keeps the process awake and
   has to be torn down on reload, and this Map is only ever interesting at the
   moment somebody asks about it. The work is proportional to the audience, and
   the audience is the thing that would have to be huge for it to matter. */
function sweep(now) {
    for (const [id, row] of LIVE) {
        if (now - row.at > TTL_MS) LIVE.delete(id);
    }
}

function tally(station) {
    let total = 0;
    let here = 0;
    for (const row of LIVE.values()) {
        total++;
        if (station && row.station === station) here++;
    }
    return { here, total };
}

export async function POST(request) {
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'bad json' }, 400, NO_STORE);
    }

    const session = typeof body?.session === 'string' ? body.session : '';
    const station = typeof body?.station === 'string' ? body.station : '';
    const playing = body?.playing === true;
    const leaving = body?.leaving === true;

    if (!SESSION_RE.test(session)) return json({ error: 'bad session' }, 400, NO_STORE);
    if (station && !SLUG_RE.test(station)) return json({ error: 'bad station' }, 400, NO_STORE);

    const now = Date.now();
    sweep(now);

    if (leaving) {
        // A closing tab says so on the way out, so the count drops immediately
        // rather than after the TTL. Best effort — sendBeacon is not delivery.
        LIVE.delete(session);
    } else if (station) {
        if (!LIVE.has(session) && LIVE.size >= MAX_SESSIONS) {
            // Full. Report honestly rather than silently not counting them.
            const t = tally(station);
            return json({ ...t, capped: true }, 200, NO_STORE);
        }
        LIVE.set(session, { station, playing, at: now });
    } else {
        // Tuned to nothing (the dial between stations): stop counting them on
        // whatever they were on, but do not pretend they left the site.
        LIVE.delete(session);
    }

    return json(tally(station), 200, NO_STORE);
}

// Read-only, for a page that wants the numbers without claiming a seat — and
// for checking the thing from a terminal. `station` is optional; without it
// `here` is zero and `total` is the network.
export async function GET(request) {
    const station = new URL(request.url).searchParams.get('station') || '';
    if (station && !SLUG_RE.test(station)) return json({ error: 'bad station' }, 400, NO_STORE);
    sweep(Date.now());
    void clientIp;
    return json(tally(station), 200, NO_STORE);
}
