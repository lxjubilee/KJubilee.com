import { json, NO_STORE } from '@/lib/api';
import {
    MAX_SESSIONS, beat, breakdown, connectingIp, drop, edgeGeo, has, signedInAs, size, sweep,
} from '@/lib/presence';
import { stressTally } from '@/lib/stress-listeners';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ── THE DIAL'S THREE INTEGERS ──────────────────────────────────────────────
   The corner of the dial reads "X / Y / Z LISTENING":

     total     everybody on the dial right now, drill included
     accounts  how many of them signed in — REAL PEOPLE ONLY, always
     anon      everybody else, drill included

   total === accounts + anon, always, and that identity is the point: the middle
   number cannot be inflated by a stress drill, so the first number and the
   third can be padded for a drill while the second stays a fact. The counting
   of real listeners happens entirely inside lib/presence.js and the fixture is
   only ever ADDED here, which is what makes that guarantee structural rather
   than a promise.

   `here` — how many are on the frequency under the needle — is still returned
   and is still worth having; it moved to the readout's tooltip when the visible
   figure went from two numbers to three.

   The fixture contributes nothing at all unless BOTH switches are on, and
   STRESS_TEST_PUBLIC_COUNT is meaningless while STRESS_TEST_LISTENERS is off —
   which is what production runs, so production sees the identity function. */
function counts(station) {
    const real = breakdown(station);
    const fake = stressTally(station);
    return {
        here: real.here + fake.here,
        total: real.total + fake.total,
        accounts: real.accounts,
        anon: real.anon + fake.total,
    };
}

// ─────────────────────────────────────────────────────────────────────────
// /api/radio/listeners — who is tuned to what, right now.
//
// The dial shows "17 / 4 / 13 LISTENING": seventeen across the network, four of
// them signed in, thirteen not. This is where all three numbers come from, plus
// `here` — how many are on the frequency under the needle — which the readout
// keeps in its tooltip.
//
// THE STORE MOVED TO lib/presence.js, which is where the reasoning about
// retention now lives, because a second route reads it: /api/admin/listeners
// serves the operator's view at /listeners.
//
// WHAT THIS ROUTE ANSWERS IS STILL ONLY INTEGERS, to anyone, and that is the
// line worth keeping visible. It went from two of them to four, and the new
// pair is a count of a crowd rather than anything about a person: "four of the
// people listening have accounts" names nobody and narrows nobody down.
// Nothing about a named listener is reachable through this path, and adding one
// would be a change of kind, not of degree.
//
// COUNTS ARE TUNED, NOT PLAYING. Someone sitting on a frequency with the sound
// paused is on that frequency — the dial says so, and gating on playback would
// make the number drop every time somebody paused to take a call. `playing` is
// still recorded so the operator's view can tell the two apart.
//
// SINGLE PROCESS, AND THAT IS A REAL LIMIT. Production is one Next standalone
// server, so one Map is the whole truth. Behind two instances this would count
// only the listeners that happened to land on the same one; the fix then is a
// shared store (Redis), not a bigger Map, and this comment is the warning that
// the change is not free.
// ─────────────────────────────────────────────────────────────────────────

/* The station key is a catalogue slug — `throne-room-vegas`, `jubilee-radio`.
   Pinned to the shape slugs actually have rather than accepted as free text:
   this string is a Map key and goes back out in a response, and "it is only a
   key" is how a key becomes an injection point later. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;

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

    sweep();

    if (leaving) {
        // A closing tab says so on the way out, so the count drops immediately
        // rather than after the TTL. Best effort — sendBeacon is not delivery.
        drop(session);
    } else if (station) {
        if (!has(session) && size() >= MAX_SESSIONS) {
            // Full. Report honestly rather than silently not counting them.
            return json({ ...counts(station), capped: true }, 200, NO_STORE);
        }
        /* THE IP AND THE ACCOUNT ARE TAKEN HERE, FROM THE REQUEST, and never
           from the body. A client that could name itself could name itself
           anything — the whole value of both fields is that the browser has no
           say in them. */
        beat(session, {
            station,
            playing,
            ip: connectingIp(request),
            geo: edgeGeo(request),
            user: signedInAs(request),
        });
    } else {
        // Tuned to nothing (the dial between stations): stop counting them on
        // whatever they were on, but do not pretend they left the site.
        drop(session);
    }

    return json(counts(station), 200, NO_STORE);
}

// Read-only, for a page that wants the numbers without claiming a seat — and
// for checking the thing from a terminal. `station` is optional; without it
// `here` is zero and `total` is the network.
export async function GET(request) {
    const station = new URL(request.url).searchParams.get('station') || '';
    if (station && !SLUG_RE.test(station)) return json({ error: 'bad station' }, 400, NO_STORE);
    sweep();
    return json(counts(station), 200, NO_STORE);
}
