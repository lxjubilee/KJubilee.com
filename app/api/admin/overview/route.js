import path from 'node:path';
import fsp from 'node:fs/promises';
import { json, NO_STORE, CDN_LOCAL_ROOT } from '@/lib/api';
import { getAccess } from '@/lib/access';
import { pool as pgPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// /api/admin/overview — the numbers on the front of the shelf.
//
// THIS ROUTE IS ALSO THE PANEL'S GATE. Every section of /admin needs the same
// yes/no answer before it renders anything, and asking five routes for it
// would mean five role lookups and five ways to disagree. The shell probes
// this one: 403 is the whole panel's "no", 200 is its "yes" and its first
// screenful of data in the same round trip.
//
// THE GATE IS "MAY OPEN THE CONSOLE AT ALL", NOT "IS AN ADMIN". With a third
// role the two stopped being the same question: an executive granted any
// section must get through here, or the console cannot render for them. The
// response carries `sections` — the list this caller may actually open — and
// the rail is built from it, so the server decides what the navigation says
// rather than the browser guessing and a route disagreeing later.
//
// The dashboard's own figures are not gated per section. Whoever may open the
// console may see the counts; the sections are what decide who may open the
// screens behind them.
//
// NOTHING HERE IS COMPUTED. Every figure already exists — build-analytics-index
// wrote the network block, the ratings route wrote the promotions, the feedback
// routes wrote the JSONL. This reads them and adds them up. If a number here
// looks wrong, the generator that wrote it is where the bug is, not this file.
// ─────────────────────────────────────────────────────────────────────────

const INDEX_FILE = path.join(process.cwd(), 'public', 'data', 'analytics-stations.json');
// Same override the writer honours, so a deploy that moved the store does not
// leave the dashboard reading a file nobody writes any more.
const RATINGS_FILE = process.env.KJ_RATINGS_FILE
    || path.join(process.cwd(), 'data', 'station-ratings.json');

const DAY_MS = 86400000;

/**
 * A dashboard is a read of eight unrelated things, and the database is the one
 * most likely to be down. A tile that cannot be filled should go blank on its
 * own rather than take the other seven with it — so every section below is
 * wrapped, and a failure becomes `null` plus a line in the log.
 */
async function attempt(label, fn, fallback = null) {
    try { return await fn(); }
    catch (err) { console.error('[admin/overview] ' + label + ':', err.message); return fallback; }
}

async function readJsonFile(file) {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
}

/** Directory listing where "not there yet" and "empty" are the same answer. */
async function listDir(dir) {
    try { return await fsp.readdir(dir, { withFileTypes: true }); }
    catch (err) { if (err.code === 'ENOENT') return []; throw err; }
}

/**
 * Count JSONL records written in the last `days` days.
 *
 * The day is in the FILENAME, so old days are skipped without opening them.
 * These directories grow one file per station per day forever; reading the
 * whole tree to answer "how many this week" would get slower every week.
 */
async function countRecent(dir, days, onRecord) {
    const cutoff = Date.now() - days * DAY_MS;
    const keep = new Set();
    for (let i = 0; i <= days; i++) keep.add(new Date(cutoff + i * DAY_MS).toISOString().slice(0, 10));

    let total = 0;
    let last = null;
    for (const entry of await listDir(dir)) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
        if (!keep.has(entry.name.slice(0, 10))) continue;
        const text = await fsp.readFile(path.join(dir, entry.name), 'utf8');
        for (const line of text.split('\n')) {
            if (!line.trim()) continue;
            total++;
            let rec = null;
            // A torn last line is not a reason to fail the tile.
            try { rec = JSON.parse(line); } catch (e) { continue; }
            // The three writers do not agree on a timestamp field: feedback
            // writes `received_at`, request-day writes `first_seen`. Reading
            // only the first left "last activity" empty on a directory that
            // plainly had records in it.
            const at = rec.received_at || rec.first_seen || rec.at || null;
            if (at && (!last || at > last)) last = at;
            if (onRecord) onRecord(rec);
        }
    }
    return { total, last };
}

export async function GET(request) {
    const admin = await getAccess(request);
    // One answer for every failure — no token, unknown user, a plain member, or
    // a role with nothing granted.
    if (!admin) return json({ error: 'Forbidden' }, 403, NO_STORE);

    // The station index and the ratings store are the two files the whole panel
    // is a view of, so they are read once here and summarised for every tile.
    const index = await attempt('index', () => readJsonFile(INDEX_FILE));
    const stations = Array.isArray(index?.stations) ? index.stations : [];

    const ratings = await attempt('ratings', () => readJsonFile(RATINGS_FILE), null);
    const ratingStations = ratings?.stations && typeof ratings.stations === 'object' ? ratings.stations : {};
    let ratedA = 0;
    let ratedB = 0;
    for (const songs of Object.values(ratingStations)) {
        for (const entry of Object.values(songs || {})) {
            const r = String(entry?.r).toUpperCase();
            if (r === 'A') ratedA++;
            else if (r === 'B') ratedB++;
        }
    }

    // Roll the dial up by band and by language. Both are one pass over the same
    // array — the shape the section headers want, precomputed here so the
    // browser is not handed 116 rows to group itself.
    const byBand = new Map();
    const byLang = new Map();
    for (const s of stations) {
        const buckets = [
            [byBand, s.band || 'unassigned', s.pill || s.band || 'Unassigned'],
            [byLang, s.lang || 'Unknown', s.lang || 'Unknown'],
        ];
        for (const [map, key, label] of buckets) {
            const row = map.get(key) || { key, label, total: 0, onAir: 0, songs: 0 };
            row.total++;
            if (s.onAir) row.onAir++;
            row.songs += Number(s.songs) || 0;
            map.set(key, row);
        }
    }
    const byTotal = (a, b) => b.total - a.total;

    const inbox = await attempt('inbox', async () => {
        const root = path.join(CDN_LOCAL_ROOT, 'radio');
        // Feedback is one directory PER STATION, so the week's total is the sum
        // over every station a listener has ever pressed a button on.
        let events = 0;
        let comments = 0;
        let lastAt = null;
        for (const st of await listDir(path.join(root, '_feedback'))) {
            if (!st.isDirectory()) continue;
            const r = await countRecent(path.join(root, '_feedback', st.name), 7, rec => {
                if (rec.event_type === 'comment' && rec.comment) comments++;
            });
            events += r.total;
            if (r.last && (!lastAt || r.last > lastAt)) lastAt = r.last;
        }
        // Requests are one flat directory — the day file is not per station.
        const req = await countRecent(path.join(root, '_requests'), 7);
        if (req.last && (!lastAt || req.last > lastAt)) lastAt = req.last;

        // Voicemail is files on disk, not lines in a log: pending is a count of
        // what is sitting in the queue, not of what arrived this week.
        let pending = 0;
        for (const st of await listDir(path.join(root, '_voicemail'))) {
            if (!st.isDirectory()) continue;
            const files = await listDir(path.join(root, '_voicemail', st.name, 'pending'));
            pending += files.filter(f => f.isFile() && f.name.endsWith('.json')).length;
        }
        return {
            events_7d: events,
            comments_7d: comments,
            requests_7d: req.total,
            voicemail_pending: pending,
            last_at: lastAt,
        };
    });

    const catalog = await attempt('catalog', async () => {
        const { rows } = await pgPool.query(
            'SELECT status, COUNT(*)::int AS n FROM kj_albums GROUP BY status');
        const by = {};
        let total = 0;
        for (const r of rows) { by[r.status] = r.n; total += r.n; }
        return { total, by_status: by };
    });

    // Read-only audience figures. The panel does not manage accounts — these
    // are here because "is anyone out there" is a website question.
    const audience = await attempt('audience', async () => {
        const { rows: [r] } = await pgPool.query(`
            SELECT (SELECT COUNT(*)::int FROM kj_users)            AS members,
                   (SELECT COUNT(*)::int FROM kj_radio_favorites)  AS favorites,
                   (SELECT COUNT(*)::int FROM kj_radio_follows)    AS follows,
                   (SELECT COUNT(*)::int FROM kj_users
                     WHERE created_at > NOW() - INTERVAL '7 days')  AS members_7d`);
        return r;
    });

    return json({
        network: index?.network || null,
        index: index ? { generated_at: index.generated_at || null, generator: index.generator || null } : null,
        ratings: {
            updated_at: ratings?.updated_at || null,
            stations_rated: Object.keys(ratingStations).length,
            a: ratedA,
            b: ratedB,
            total: ratedA + ratedB,
        },
        bands: [...byBand.values()].sort(byTotal),
        languages: [...byLang.values()].sort(byTotal),
        inbox,
        catalog,
        audience,
        site: {
            env: process.env.NODE_ENV || 'development',
            node: process.version,
            uptime_s: Math.round(process.uptime()),
            // Either query answering means the pool is alive; both failing is
            // the only thing that distinguishes a down database from an empty one.
            db: (catalog || audience) ? 'ok' : 'unreachable',
        },
        // Who is looking, and what they may open. The panel prints the name so
        // a shared screen is never ambiguous about whose promotions are being
        // recorded, and builds its rail from `sections`.
        admin: {
            id: admin.id,
            email: admin.email || null,
            name: admin.name || null,
            role: admin.role,
            sections: admin.sections,
        },
    }, 200, NO_STORE);
}
