import { pool as pgPool } from '@/lib/db';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const category_id = new URL(request.url).searchParams.get('category_id');
    if (!category_id) return json({ error: 'category_id is required' }, 400);
    try {
        const r = await pgPool.query(
            `SELECT id, title, slug, persona_slug, theme_slug, sort_order, status, created_at
             FROM kj_albums WHERE category_id=$1 ORDER BY sort_order ASC, title ASC`, [category_id]);
        return json(r.rows);
    } catch (err) { console.error('[admin/albums]', err.message); return json({ error: 'Failed to fetch albums', message: err.message }, 500); }
}
