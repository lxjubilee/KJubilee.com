import path from 'node:path';
import fsp from 'node:fs/promises';
import { json, readJson, NO_STORE } from '@/lib/api';
import { requireSection } from '@/lib/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// /api/radio/ratings — the A/B/C rotation rating of a song ON A STATION.
//
// EVERY SONG IS C UNTIL A HUMAN SAYS OTHERWISE. C is not stored: it is the
// absence of an entry. Writing it down would put 7,700 rows in this file that
// all say "nobody has looked at this yet", and the one thing the file is for is
// the short list of songs somebody HAS looked at.
//
// The rating is per station, not per song. The same recording is deliberately
// on several frequencies (AGENTS.md — "one song on several stations is
// intended"), and it can be the anchor of one station's rotation and a
// once-a-day track on another. A global rating could not say that.
//
// GET is public. It is the same information the page renders, and gating it
// would only mean the page could not render for anyone not signed in.
// POST needs the console's `stations` section, because promoting a song is a
// programming decision — an admin always has it, an executive has it only if
// an admin granted it in Roles & permissions.
// ─────────────────────────────────────────────────────────────────────────

// Kept out of the CDN tree on purpose, unlike /api/radio/feedback's JSONL.
// Feedback is telemetry — write-mostly, read by tools. This is an editorial
// decision about what goes on air, so it belongs where it can be read in a
// diff. KJ_RATINGS_FILE moves it if the deploy tree is not writable.
const STORE = process.env.KJ_RATINGS_FILE
    || path.join(process.cwd(), 'data', 'station-ratings.json');

const RATINGS = new Set(['A', 'B', 'C']);
const EMPTY = { schema_version: 1, updated_at: null, stations: {} };

// A station id is a directory name in the delivery tree (HM308.70-EN) and ends
// up in no path here — but it is a key an admin types, so it is still pinned to
// the shape the tenant ids actually have rather than accepted as free text.
const STATION_RE = /^HM\d{3}\.\d{2}-[A-Z]{2}$/;
// A SongID is 12 chars of the ledger's own alphabet. Same reasoning.
const SONG_RE = /^[A-Z0-9]{4,32}$/;

async function read() {
    try {
        /* turbopackIgnore keeps the bundler from trying to trace this read.
           STORE is `process.env.KJ_RATINGS_FILE || <a path under data/>`, and
           that env fallback makes the path unresolvable at build time, so the
           tracer gave up narrowing it and pulled THE WHOLE PROJECT into the
           route's file trace — public/ and all. On this SMB checkout that is
           enough I/O to push `next build`'s page-data collection over its
           limit, and it failed on a different /api route on each run, none of
           which had anything to do with ratings. The read itself is unchanged
           and KJ_RATINGS_FILE still works; only the tracing is opted out. */
        const doc = JSON.parse(await fsp.readFile(/*turbopackIgnore: true*/ STORE, 'utf8'));
        if (!doc || typeof doc !== 'object' || typeof doc.stations !== 'object' || !doc.stations) return { ...EMPTY };
        return doc;
    } catch (err) {
        // A store that does not exist yet is an empty store — the first
        // promotion creates it. Anything else (unreadable, malformed) is NOT
        // treated as empty by the writer; see write().
        if (err.code === 'ENOENT') return { ...EMPTY };
        throw err;
    }
}

// Two admins promoting two songs in the same second must not lose one of them,
// and this is a read-modify-write. The chain serialises them within the
// process, and the rename makes each write atomic on disk so a crash mid-write
// cannot leave a truncated file where the ratings used to be.
//
// It does NOT serialise across processes. A multi-instance deploy needs a real
// lock here, the same caveat the rate limiter in lib/api.js carries.
let queue = Promise.resolve();
function serialise(fn) {
    const run = queue.then(fn, fn);
    queue = run.then(() => {}, () => {});
    return run;
}

async function write(doc) {
    doc.updated_at = new Date().toISOString();
    const body = JSON.stringify(doc, null, 2) + '\n';
    await fsp.mkdir(path.dirname(STORE), { recursive: true });
    const tmp = STORE + '.' + process.pid + '.tmp';
    await fsp.writeFile(tmp, body, 'utf8');
    await fsp.rename(tmp, STORE);
}

export async function GET(request) {
    try {
        const doc = await read();
        // Whether the caller MAY promote, answered here so the page does not
        // have to guess. /api/auth/me returns no role, so the alternative was
        // showing every visitor the controls and letting the 403 be the answer.
        //
        // Only asked when a token was actually sent: an anonymous reader is
        // not an admin, and that is one database round trip per page load
        // saved on the common case.
        const admin = request.headers.get('authorization') ? Boolean(await requireSection(request, 'stations')) : false;
        return json({
            schema_version: doc.schema_version || 1,
            updated_at: doc.updated_at || null,
            admin,
            stations: doc.stations || {},
        }, 200, NO_STORE);
    } catch (err) {
        console.error('[radio/ratings] read failed:', err.message);
        return json({ error: 'Failed to read ratings' }, 500, NO_STORE);
    }
}

/**
 * POST { station, ratings: { <SongID>: "A" | "B" | "C" } }
 *
 * Setting C REMOVES the entry rather than storing it, which is what makes
 * demoting a song and never having rated it the same state — as they should be.
 * Several songs may be sent at once so a rack of promotions is one write.
 */
export async function POST(request) {
    const admin = await requireSection(request, 'stations');
    // One answer for every failure — no token, unknown user, a role without
    // this section.
    if (!admin) return json({ error: 'Forbidden' }, 403, NO_STORE);

    const body = await readJson(request);
    const station = String(body.station || '').trim().toUpperCase();
    if (!STATION_RE.test(station)) return json({ error: 'invalid station' }, 400, NO_STORE);

    // { song, rating } is accepted as the one-song shape of the same request.
    const incoming = body.ratings && typeof body.ratings === 'object'
        ? body.ratings
        : (body.song ? { [body.song]: body.rating } : null);
    if (!incoming) return json({ error: 'ratings is required' }, 400, NO_STORE);

    const entries = Object.entries(incoming);
    if (!entries.length) return json({ error: 'ratings is empty' }, 400, NO_STORE);
    if (entries.length > 2000) return json({ error: 'too many ratings in one request' }, 400, NO_STORE);
    for (const [song, rating] of entries) {
        if (!SONG_RE.test(String(song))) return json({ error: 'invalid SongID: ' + song }, 400, NO_STORE);
        if (!RATINGS.has(String(rating).toUpperCase())) return json({ error: 'invalid rating for ' + song }, 400, NO_STORE);
    }

    try {
        const result = await serialise(async () => {
            const doc = await read();
            const before = doc.stations[station] || {};
            const after = { ...before };
            let promoted = 0, cleared = 0;

            for (const [song, raw] of entries) {
                const rating = String(raw).toUpperCase();
                if (rating === 'C') {
                    if (after[song]) { delete after[song]; cleared++; }
                    continue;
                }
                after[song] = {
                    r: rating,
                    // WHO promoted it is half the value of the record. A
                    // programming decision with no name on it is a decision
                    // nobody can ask about later.
                    by: admin.email || admin.name || String(admin.id),
                    at: new Date().toISOString(),
                };
                promoted++;
            }

            if (Object.keys(after).length) doc.stations[station] = after;
            else delete doc.stations[station];

            await write(doc);
            return { promoted, cleared, station: after };
        });

        return json({ success: true, ...result }, 200, NO_STORE);
    } catch (err) {
        console.error('[radio/ratings] write failed:', err.message);
        return json({ error: 'Failed to save ratings' }, 500, NO_STORE);
    }
}
