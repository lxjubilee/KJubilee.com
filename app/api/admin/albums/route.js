import { pool as pgPool } from '@/lib/db';
import { json, readJson, NO_STORE } from '@/lib/api';
import { requireSection } from '@/lib/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// /api/admin/albums — the kj_albums catalogue.
//
// THIS ROUTE USED TO BE UNGATED. It sat under /api/admin/ and read straight
// from the database with no `requireAdmin` anywhere in the file, so the path
// implied a check that the code never made — the worst kind of gap, because it
// looks protected in a directory listing. Every method below now asks first.
//
// kj_albums IS CURATED CONTENT, NOT USER DATA (001-initial-schema.sql). It is
// the editorial layer over the music repository: which albums the site presents,
// under which persona and theme, in what order, published or not. It does NOT
// own the audio — the SongID ledger does, and `slug` doubles as the folder name
// in the CDN's audio tree, which is why renaming one is a rename on disk too.
//
// Nothing here touches a file. An album row going to `published` is a claim
// that the CDN folder it names already exists; this route does not create it.
// ─────────────────────────────────────────────────────────────────────────

const STATUSES = new Set(['draft', 'published', 'archived']);

// The slug is a CDN folder name. Lowercase, digits and single hyphens only —
// the shape build-station-manifest already assumes, pinned here so a typed
// slug cannot become a path segment nothing can serve.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MAX_LIMIT = 500;

/** Trim to a string or null; `null` and `''` both mean "clear this column". */
function text(v, max) {
    if (v === undefined) return undefined;          // absent — leave the column alone
    if (v === null) return null;
    const s = String(v).trim();
    return s ? s.slice(0, max) : null;
}

/**
 * Postgres rejects a duplicate slug with 23505 and a foreign-key miss with
 * 23503. Both are the caller's mistake, not a server fault, so they come back
 * as 409/400 with the column named — a 500 here would send an operator to the
 * logs for something the form could have told them.
 */
function dbError(err, where) {
    if (err.code === '23505') return json({ error: 'That slug is already taken.' }, 409, NO_STORE);
    if (err.code === '23503') return json({ error: 'That category does not exist.' }, 400, NO_STORE);
    if (err.code === '22P02') return json({ error: 'A numeric field was not a number.' }, 400, NO_STORE);
    console.error('[admin/albums] ' + where + ':', err.message);
    return json({ error: 'Failed to ' + where }, 500, NO_STORE);
}

const COLUMNS = `id, title, slug, persona_slug, theme_slug, category_id,
                 sort_order, status, artist_name, cover_image, description,
                 track_count, created_at, updated_at`;

/**
 * GET — list, with optional filters.
 *
 * `category_id` used to be REQUIRED and a 400 without it, which meant the only
 * way to see the catalogue was to already know its category ids. It is a filter
 * now; the panel needs an unfiltered list to render at all.
 */
export async function GET(request) {
    if (!await requireSection(request, 'albums')) return json({ error: 'Forbidden' }, 403, NO_STORE);

    const q = new URL(request.url).searchParams;
    const where = [];
    const params = [];

    const categoryId = q.get('category_id');
    if (categoryId !== null && categoryId !== '') {
        const n = parseInt(categoryId, 10);
        if (!Number.isFinite(n)) return json({ error: 'category_id must be a number' }, 400, NO_STORE);
        params.push(n);
        where.push(`category_id = $${params.length}`);
    }

    const status = String(q.get('status') || '').trim().toLowerCase();
    if (status) {
        if (!STATUSES.has(status)) return json({ error: 'unknown status' }, 400, NO_STORE);
        params.push(status);
        where.push(`status = $${params.length}`);
    }

    const search = String(q.get('q') || '').trim();
    if (search) {
        // Parameterised, so % and _ in the search box are matched literally
        // rather than turning into wildcards the typist did not ask for.
        params.push('%' + search.replace(/[%_\\]/g, '\\$&') + '%');
        where.push(`(title ILIKE $${params.length} ESCAPE '\\' OR slug ILIKE $${params.length} ESCAPE '\\'
                     OR artist_name ILIKE $${params.length} ESCAPE '\\')`);
    }

    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(q.get('limit'), 10) || 200));

    try {
        const sql = `SELECT ${COLUMNS} FROM kj_albums
                     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY sort_order ASC, title ASC
                     LIMIT ${limit}`;
        const [rows, counts] = await Promise.all([
            pgPool.query(sql, params),
            pgPool.query('SELECT status, COUNT(*)::int AS n FROM kj_albums GROUP BY status'),
        ]);
        const by_status = {};
        let total = 0;
        for (const r of counts.rows) { by_status[r.status] = r.n; total += r.n; }
        // A full page is the only evidence LIMIT had anything left to cut. Saying
        // so lets the panel warn instead of presenting a slice as the whole list.
        return json({
            albums: rows.rows,
            total,
            by_status,
            limit,
            truncated: rows.rows.length === limit,
        }, 200, NO_STORE);
    } catch (err) {
        return dbError(err, 'fetch albums');
    }
}

/** POST — create one album. `title` and `slug` are the only required fields. */
export async function POST(request) {
    if (!await requireSection(request, 'albums')) return json({ error: 'Forbidden' }, 403, NO_STORE);

    const body = await readJson(request);
    const title = text(body.title, 300);
    const slug = text(body.slug, 200);
    if (!title) return json({ error: 'title is required' }, 400, NO_STORE);
    if (!slug) return json({ error: 'slug is required' }, 400, NO_STORE);
    if (!SLUG_RE.test(slug)) {
        return json({ error: 'slug must be lowercase words joined by single hyphens' }, 400, NO_STORE);
    }

    const status = String(body.status || 'draft').toLowerCase();
    if (!STATUSES.has(status)) return json({ error: 'unknown status' }, 400, NO_STORE);

    try {
        const { rows: [row] } = await pgPool.query(
            `INSERT INTO kj_albums
               (title, slug, persona_slug, theme_slug, category_id, sort_order,
                status, artist_name, cover_image, description, track_count)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING ${COLUMNS}`,
            [title, slug,
             text(body.persona_slug, 200) ?? null,
             text(body.theme_slug, 200) ?? null,
             body.category_id === '' || body.category_id == null ? null : parseInt(body.category_id, 10),
             parseInt(body.sort_order, 10) || 0,
             status,
             text(body.artist_name, 300) ?? null,
             text(body.cover_image, 500) ?? null,
             text(body.description, 4000) ?? null,
             parseInt(body.track_count, 10) || 0]);
        return json({ success: true, album: row }, 201, NO_STORE);
    } catch (err) {
        return dbError(err, 'create the album');
    }
}

/**
 * PATCH { id, ...fields } — update the fields that were sent.
 *
 * ABSENT AND NULL ARE DIFFERENT HERE. A key that is not in the body leaves its
 * column alone; a key sent as null or "" clears it. A PUT-style whole-row
 * replace would let a form that renders six of eleven columns silently blank
 * the other five.
 */
export async function PATCH(request) {
    if (!await requireSection(request, 'albums')) return json({ error: 'Forbidden' }, 403, NO_STORE);

    const body = await readJson(request);
    const id = parseInt(body.id, 10);
    if (!Number.isFinite(id)) return json({ error: 'id is required' }, 400, NO_STORE);

    const sets = [];
    const params = [];
    const set = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

    if (body.title !== undefined) {
        const t = text(body.title, 300);
        if (!t) return json({ error: 'title cannot be empty' }, 400, NO_STORE);
        set('title', t);
    }
    if (body.slug !== undefined) {
        const s = text(body.slug, 200);
        if (!s || !SLUG_RE.test(s)) {
            return json({ error: 'slug must be lowercase words joined by single hyphens' }, 400, NO_STORE);
        }
        set('slug', s);
    }
    if (body.status !== undefined) {
        const st = String(body.status).toLowerCase();
        if (!STATUSES.has(st)) return json({ error: 'unknown status' }, 400, NO_STORE);
        set('status', st);
    }
    for (const [key, max] of [['persona_slug', 200], ['theme_slug', 200], ['artist_name', 300],
                              ['cover_image', 500], ['description', 4000]]) {
        if (body[key] !== undefined) set(key, text(body[key], max));
    }
    for (const key of ['category_id', 'sort_order', 'track_count']) {
        if (body[key] === undefined) continue;
        if (body[key] === null || body[key] === '') { set(key, key === 'category_id' ? null : 0); continue; }
        const n = parseInt(body[key], 10);
        if (!Number.isFinite(n)) return json({ error: key + ' must be a number' }, 400, NO_STORE);
        set(key, n);
    }

    if (!sets.length) return json({ error: 'nothing to update' }, 400, NO_STORE);
    sets.push('updated_at = NOW()');
    params.push(id);

    try {
        const { rows: [row] } = await pgPool.query(
            `UPDATE kj_albums SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${COLUMNS}`,
            params);
        if (!row) return json({ error: 'No album with that id.' }, 404, NO_STORE);
        return json({ success: true, album: row }, 200, NO_STORE);
    } catch (err) {
        return dbError(err, 'update the album');
    }
}

/**
 * DELETE ?id=N — remove one album row.
 *
 * `confirm=<slug>` is required, and it must match the row's own slug. The panel
 * puts the typed word in front of a delete the same way the account page does,
 * because a row id in a query string is the easiest thing in this API to get
 * wrong by one digit — and kj_album_follows rows point at these ids.
 */
export async function DELETE(request) {
    if (!await requireSection(request, 'albums')) return json({ error: 'Forbidden' }, 403, NO_STORE);

    const q = new URL(request.url).searchParams;
    const id = parseInt(q.get('id'), 10);
    if (!Number.isFinite(id)) return json({ error: 'id is required' }, 400, NO_STORE);
    const confirm = String(q.get('confirm') || '').trim();

    try {
        const { rows: [existing] } = await pgPool.query('SELECT slug FROM kj_albums WHERE id = $1', [id]);
        if (!existing) return json({ error: 'No album with that id.' }, 404, NO_STORE);
        if (confirm !== existing.slug) {
            return json({ error: 'Type the album slug to confirm.', expected: 'slug' }, 400, NO_STORE);
        }
        await pgPool.query('DELETE FROM kj_albums WHERE id = $1', [id]);
        return json({ success: true, id, slug: existing.slug }, 200, NO_STORE);
    } catch (err) {
        return dbError(err, 'delete the album');
    }
}
