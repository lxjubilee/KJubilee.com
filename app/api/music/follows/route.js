import { pool as pgPool } from '@/lib/db';
import { getUserIdFromAuth } from '@/lib/auth';
import { json, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const userId = getUserIdFromAuth(request);
    if (!userId) return json({ success: false, error: 'Authentication required' }, 401);
    try {
        const { rows: follows } = await pgPool.query(
            `SELECT album_id, album_name, album_artist, album_image, followed_at
             FROM kj_album_follows WHERE user_id=$1 ORDER BY followed_at DESC`, [userId]);
        return json({ success: true, count: follows.length, follows });
    } catch (err) { console.error('[music/follows GET]', err.message); return json({ success: false, error: 'Failed to fetch follows' }, 500); }
}

export async function POST(request) {
    const userId = getUserIdFromAuth(request);
    if (!userId) return json({ success: false, error: 'Authentication required' }, 401);
    const { album_id, album_name, album_artist, album_image } = await readJson(request);
    if (!album_id || !album_name) return json({ success: false, error: 'album_id and album_name are required' }, 400);
    try {
        await pgPool.query(
            `INSERT INTO kj_album_follows (user_id, album_id, album_name, album_artist, album_image)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, album_id) DO NOTHING`,
            [userId, album_id, album_name, album_artist || '', album_image || '']);
        return json({ success: true, message: 'Album followed' });
    } catch (err) {
        if (err.code === '23505') return json({ success: true, message: 'Album already followed' });
        console.error('[music/follows POST]', err.message); return json({ success: false, error: 'Failed to follow album' }, 500);
    }
}
