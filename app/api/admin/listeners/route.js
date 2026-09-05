import { json, NO_STORE } from '@/lib/api';
import { requireSection } from '@/lib/access';
import { rows, TTL_MS } from '@/lib/presence';
import { stressRows, stressStatus } from '@/lib/stress-listeners';
import { readCatalogue } from '@/app/_catalogue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// /api/admin/listeners — the individual rows behind the dial's "3 / 17".
//
// GATED, AND NOT AS A FORMALITY. This is the one endpoint on the site that
// answers "who is listening, and from where" with an IP address attached. The
// public /api/radio/listeners answers two integers to anybody and must keep
// doing exactly that; everything a person could be identified by is here,
// behind section 'listeners', which an admin holds automatically and an
// executive holds only when it has been ticked in Roles & permissions.
//
// THERE IS NOTHING TO PAGINATE AND NOTHING TO SEARCH, because there is nothing
// stored: the source is a Map that holds one entry per live listener for 62
// seconds. The whole audience IS the response. If that ever stops being true
// the audience is large enough that this endpoint is the wrong shape anyway.
// ─────────────────────────────────────────────────────────────────────────

/** slug → the station's own name and frequency, so the grid is readable. */
function stationIndex() {
    const index = new Map();
    try {
        for (const s of readCatalogue().stations || []) {
            if (s?.slug) index.set(s.slug, { name: s.name || s.slug, hm: s.hm ?? null });
        }
    } catch {
        /* The catalogue is a convenience here, not the data. A page that shows
           slugs is worse than one that shows names; a page that 500s because
           the catalogue moved is worse than both. */
    }
    return index;
}

export async function GET(request) {
    const me = await requireSection(request, 'listeners');
    if (!me) return json({ error: 'Forbidden' }, 403, NO_STORE);

    const index = stationIndex();
    const now = Date.now();

    /* THE SYNTHETIC ROWS ARE APPENDED, NOT MIXED IN. lib/presence.js is
       untouched: its Map holds real listeners and only real listeners, so
       switching STRESS_TEST_LISTENERS off returns this endpoint to the truth
       with nothing to clean up. The fixture arrives in the same shape rows()
       produces, which is why one .map() below still serves both. */
    const stress = stressStatus();
    const listeners = [...rows(), ...stressRows()]
        .map((r) => {
            const station = index.get(r.station) || null;
            return {
                /* The session id is the browser's own random string and names
                   nobody. It is here because it is the only stable handle on a
                   row, which is what lets the page keep a listener in place
                   across refreshes instead of redrawing the grid. */
                session: r.session,
                station: r.station,
                stationName: station?.name || r.station,
                hm: station?.hm ?? null,
                playing: !!r.playing,
                ip: r.ip || null,
                geo: r.geo || null,
                user: r.user || null,          // { id, email } when signed in
                /* Only ever set on a fixture row. A real heartbeat cannot tell
                   us what it is running on — lib/presence.js deliberately never
                   asks the browser — so a Device cell with something in it is
                   itself a reliable marker of a simulated listener. */
                device: r.device || null,
                agent: r.agent || null,
                synthetic: r.synthetic === true,
                sinceMs: now - (r.since || now),
                idleMs: now - (r.at || now),
            };
        })
        // Longest listening first: the people who have been here an hour are
        // the interesting rows, and a grid sorted by a random id is a grid
        // whose order changes every refresh for no reason.
        .sort((a, b) => b.sinceMs - a.sinceMs);

    const byStation = new Map();
    for (const l of listeners) {
        const e = byStation.get(l.station) || { station: l.station, name: l.stationName, hm: l.hm, n: 0 };
        e.n++;
        byStation.set(l.station, e);
    }

    return json({
        total: listeners.length,
        signedIn: listeners.filter((l) => l.user).length,
        playing: listeners.filter((l) => l.playing).length,
        /* Stated separately from `total` so a number quoted off this endpoint
           can always be reduced to the real one. */
        simulated: listeners.filter((l) => l.synthetic).length,
        ttlMs: TTL_MS,
        stations: [...byStation.values()].sort((a, b) => b.n - a.n),
        listeners,
        /* null when the switch is off, which is the normal case. */
        stress,
        at: now,
    }, 200, NO_STORE);
}
