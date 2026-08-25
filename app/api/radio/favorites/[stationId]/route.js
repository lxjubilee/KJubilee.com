import { pool as pgPool } from '@/lib/db';
import { getUserIdFromAuth } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
    const userId = getUserIdFromAuth(request);
    if (!userId) return json({ success: false, error: 'Authentication required' }, 401);
    const { stationId } = await params;
    try {
        const r = await pgPool.query(`DELETE FROM kj_radio_favorites WHERE user_id=$1 AND station_id=$2`, [userId, stationId]);
        if (r.rowCount > 0) return json({ success: true, message: 'Station removed from favorites' });
        return json({ success: false, error: 'Favorite not found' }, 404);
    } catch (err) { console.error('[radio/favorites DELETE]', err.message); return json({ success: false, error: 'Failed to remove favorite' }, 500); }
}
