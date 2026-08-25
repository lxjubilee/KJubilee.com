import { pool as pgPool } from '@/lib/db';
import { getUserIdFromAuth } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
    const userId = getUserIdFromAuth(request);
    if (!userId) return json({ success: true, isFavorited: false });
    const { stationId } = await params;
    try {
        const { rows: [favorite] } = await pgPool.query(
            `SELECT id FROM kj_radio_favorites WHERE user_id=$1 AND station_id=$2`, [userId, stationId]);
        return json({ success: true, isFavorited: !!favorite });
    } catch (err) { console.error('[radio/favorites/check]', err.message); return json({ success: false, error: 'Failed to check favorite status' }, 500); }
}
