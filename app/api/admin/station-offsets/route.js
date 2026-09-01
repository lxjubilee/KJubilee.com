import { json, NO_STORE } from '@/lib/api';
import { requireSection } from '@/lib/access';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// /api/admin/station-offsets — move a station's picture in its frame.
//
// The read side is public (/api/station-offsets): the adjustment has to reach
// every visitor or it was pointless. This is the write side, and it is gated
// on 'stations' — the same section that governs the re-render queue, because
// it is the same job: an operator looking at a card and saying the artwork is
// not sitting right.
//
// GATED AGAINST THE DATABASE, not against what the browser believes. The two
// arrows are painted from /api/auth/me, which decides what a page DRAWS; a
// browser that sets its own isAdmin flag in the console gains two buttons and
// a 403 from here.
//
// ABSOLUTE, NOT A DELTA. The client sends where the picture should end up, not
// "five more than last time". Two admins nudging the same station at once
// would otherwise compound each other's presses, and a retried request would
// move the picture twice.
// ─────────────────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Far enough to re-frame any of the artwork, not far enough to push a picture
// out of its own box and leave the ident gradient showing through. The heroes
// are ~210-520px tall against a 16:9 source, so the usable travel is well
// inside this.
const LIMIT = 400;

/** POST {slug, offsetY} — set one station's vertical nudge, in pixels. */
export async function POST(request) {
    const admin = await requireSection(request, 'stations');
    if (!admin) return json({ error: 'Forbidden' }, 403, NO_STORE);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Bad JSON' }, 400, NO_STORE); }

    const slug = String(body?.slug || '').trim();
    if (!SLUG_RE.test(slug)) return json({ error: 'Bad slug' }, 400, NO_STORE);

    const raw = Number(body?.offsetY);
    if (!Number.isFinite(raw)) return json({ error: 'Bad offsetY' }, 400, NO_STORE);
    // Rounded as well as clamped: object-position takes a length, and a
    // fractional pixel is a blurred edge on the picture for no gain.
    const offsetY = Math.max(-LIMIT, Math.min(LIMIT, Math.round(raw)));

    const who = admin.email || admin.name || String(admin.id || '');

    // Back to zero is a DELETE, not a stored zero: the default crop is what the
    // absence of a row means, and keeping rows that say "unchanged" would make
    // the public read carry a payload of nothing.
    if (offsetY === 0) {
        await pool.query('DELETE FROM kj_image_offsets WHERE slug = $1', [slug]);
        return json({ slug, offsetY: 0 }, 200, NO_STORE);
    }

    const { rows } = await pool.query(
        `INSERT INTO kj_image_offsets (slug, offset_y, updated_by)
              VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO UPDATE
                SET offset_y   = EXCLUDED.offset_y,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = NOW()
          RETURNING slug, offset_y AS "offsetY"`,
        [slug, offsetY, who]
    );
    return json(rows[0], 200, NO_STORE);
}
