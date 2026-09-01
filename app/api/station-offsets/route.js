import { json, NO_STORE } from '@/lib/api';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// /api/station-offsets — how far each station's picture is nudged in its frame.
//
// PUBLIC, AND THAT IS THE POINT. The whole feature exists so that an operator's
// adjustment is what every visitor sees; an admin-only read would mean the crop
// was corrected for the one person who did not need it corrected. There is
// nothing sensitive here — it is a list of slugs and a pixel count each.
//
// Writing is a different question and lives at /api/admin/station-offsets,
// which gates on the database the way every other admin route does.
//
// Shape is { slug: pixels }, chosen so the client can index it directly rather
// than searching an array on every slide change.
// ─────────────────────────────────────────────────────────────────────────

export async function GET() {
    try {
        const { rows } = await pool.query(
            'SELECT slug, offset_y FROM kj_image_offsets WHERE offset_y <> 0'
        );
        const offsets = {};
        for (const r of rows) offsets[r.slug] = r.offset_y;
        return json({ offsets }, 200, NO_STORE);
    } catch {
        // A station whose picture is a few pixels off is not a reason to fail
        // a page. The client treats an empty map and a failed request the same
        // way — every station renders at its default crop.
        return json({ offsets: {} }, 200, NO_STORE);
    }
}
