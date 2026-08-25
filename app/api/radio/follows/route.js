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
            `SELECT id, station_id, station_name, station_category, station_image, followed_at
             FROM kj_radio_follows WHERE user_id=$1 ORDER BY followed_at DESC`, [userId]);
        return json({ success: true, count: follows.length, follows });
    } catch (err) { console.error('[radio/follows GET]', err.message); return json({ success: false, error: 'Failed to fetch follows' }, 500); }
}

export async function POST(request) {
    const userId = getUserIdFromAuth(request);
    if (!userId) return json({ success: false, error: 'Authentication required' }, 401);
    const { station_id, station_name, station_category, station_image } = await readJson(request);
    if (!station_id || !station_name) return json({ success: false, error: 'station_id and station_name are required' }, 400);
    try {
        await pgPool.query(
            `INSERT INTO kj_radio_follows (user_id, station_id, station_name, station_category, station_image)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, station_id) DO NOTHING`,
            [userId, station_id, station_name, station_category || '', station_image || '']);
        return json({ success: true, message: 'Station followed' });
    } catch (err) {
        if (err.code === '23505') return json({ success: true, message: 'Station already followed' });
        console.error('[radio/follows POST]', err.message); return json({ success: false, error: 'Failed to follow station' }, 500);
    }
}
