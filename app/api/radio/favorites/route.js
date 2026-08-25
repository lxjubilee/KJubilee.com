import { pool as pgPool } from '@/lib/db';
import { getUserIdFromAuth } from '@/lib/auth';
import { json, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const userId = getUserIdFromAuth(request);
    if (!userId) return json({ success: false, error: 'Authentication required' }, 401);
    try {
        const { rows: favorites } = await pgPool.query(
            `SELECT id, station_id, station_name, station_category, station_image, favorited_at
             FROM kj_radio_favorites WHERE user_id = $1 ORDER BY favorited_at DESC`, [userId]);
        return json({ success: true, count: favorites.length, favorites });
    } catch (err) { console.error('[radio/favorites GET]', err.message); return json({ success: false, error: 'Failed to fetch favorites' }, 500); }
}

export async function POST(request) {
    const userId = getUserIdFromAuth(request);
    if (!userId) return json({ success: false, error: 'Authentication required' }, 401);
    const { station_id, station_name, station_category, station_image } = await readJson(request);
    if (!station_id || !station_name) return json({ success: false, error: 'station_id and station_name are required' }, 400);
    try {
        await pgPool.query(
            `INSERT INTO kj_radio_favorites (user_id, station_id, station_name, station_category, station_image)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, station_id) DO NOTHING`,
            [userId, station_id, station_name, station_category || '', station_image || '']);
        return json({ success: true, message: 'Station added to favorites' });
    } catch (err) {
        if (err.code === '23505') return json({ success: true, message: 'Station already in favorites' });
        console.error('[radio/favorites POST]', err.message); return json({ success: false, error: 'Failed to add favorite' }, 500);
    }
}
