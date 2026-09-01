import { json, NO_STORE } from '@/lib/api';
import { requireSection } from '@/lib/access';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// /api/admin/station-images — "this cover is wrong, make it again".
//
// WHAT IT IS FOR. Every station card carries a generated cover. Some come back
// wrong in ways only a person looking at the card can see — the wrong city, a
// mangled hand, a host who is not the host. Until now the only way to say so
// was to delete public/images/stations/<slug>.webp, which is how the Station
// Image Studio decides what to render next. That works, and it blanks the card
// on a live site until somebody happens to run the Studio on a workstation.
//
// So this records the REQUEST instead of destroying the evidence. The cover
// stays up, the station joins a queue, and the Studio picks it up next run.
// migrations/006-station-image-queue.sql has the longer version of why this is
// not a second answer to the Studio's "done-ness is the file" rule.
//
// GATED ON 'stations'. The queue names who asked and carries free text they
// typed; more to the point, an open POST here lets anyone order the image
// pipeline to redo the entire dial. requireSection asks the database on every
// call — the red button in the card panel is painted from /api/auth/me, which
// decides what a browser DRAWS and never what it may do.
// ─────────────────────────────────────────────────────────────────────────

// Slugs reach this file from a request body and go into SQL as a parameter, so
// injection is not the risk; a typo silently queueing a station that does not
// exist is. The shape is the one build-home-data emits.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_REASON = 500;

/** GET — what is outstanding. The Station Image Studio's only question. */
export async function GET(request) {
    const admin = await requireSection(request, 'stations');
    if (!admin) return json({ error: 'Forbidden' }, 403, NO_STORE);

    const url = new URL(request.url);
    const all = url.searchParams.get('all') === '1';

    const { rows } = await pool.query(
        `SELECT slug, requested_by, requested_at, reason, done_at
           FROM kj_station_image_queue
          ${all ? '' : 'WHERE done_at IS NULL'}
          ORDER BY requested_at ASC`
    );
    return json({ queue: rows, open: rows.filter(r => !r.done_at).length }, 200, NO_STORE);
}

/** POST {slug, reason?} — queue one station. Pressing twice is not two jobs. */
export async function POST(request) {
    const admin = await requireSection(request, 'stations');
    if (!admin) return json({ error: 'Forbidden' }, 403, NO_STORE);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Bad JSON' }, 400, NO_STORE); }

    const slug = String(body?.slug || '').trim();
    if (!SLUG_RE.test(slug)) return json({ error: 'Bad slug' }, 400, NO_STORE);

    const reason = String(body?.reason || '').slice(0, MAX_REASON) || null;
    const who = admin.email || admin.name || String(admin.id || '');

    // Re-requesting clears done_at: the point of asking again is that the last
    // render did not settle it, and a row still marked done would be skipped.
    const { rows } = await pool.query(
        `INSERT INTO kj_station_image_queue (slug, requested_by, reason)
              VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO UPDATE
                SET requested_by = EXCLUDED.requested_by,
                    requested_at = NOW(),
                    reason       = EXCLUDED.reason,
                    done_at      = NULL
          RETURNING slug, requested_by, requested_at, reason`,
        [slug, who, reason]
    );
    return json({ queued: rows[0] }, 200, NO_STORE);
}

/** DELETE ?slug=… — take one back off the queue, or mark it rendered.
 *
 *  `?done=1` is the Studio saying it has produced a replacement; without it
 *  this is a person undoing a click. The two are different events and the row
 *  records which: a withdrawn request leaves no trace, a satisfied one stays
 *  so the console can show that somebody acted on it. */
export async function DELETE(request) {
    const admin = await requireSection(request, 'stations');
    if (!admin) return json({ error: 'Forbidden' }, 403, NO_STORE);

    const url = new URL(request.url);
    const slug = String(url.searchParams.get('slug') || '').trim();
    if (!SLUG_RE.test(slug)) return json({ error: 'Bad slug' }, 400, NO_STORE);

    if (url.searchParams.get('done') === '1') {
        await pool.query(
            'UPDATE kj_station_image_queue SET done_at = NOW() WHERE slug = $1', [slug]);
        return json({ slug, done: true }, 200, NO_STORE);
    }
    await pool.query('DELETE FROM kj_station_image_queue WHERE slug = $1', [slug]);
    return json({ slug, removed: true }, 200, NO_STORE);
}
