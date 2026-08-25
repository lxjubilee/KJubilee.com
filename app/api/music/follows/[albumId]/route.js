import { pool as pgPool } from '@/lib/db';
import { getUserIdFromAuth } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
    const userId = getUserIdFromAuth(request);
    if (!userId) return json({ success: false, error: 'Authentication required' }, 401);
    const { albumId } = await params;
    try {
        const r = await pgPool.query(`DELETE FROM kj_album_follows WHERE user_id=$1 AND album_id=$2`, [userId, albumId]);
        if (r.rowCount > 0) return json({ success: true, message: 'Album unfollowed' });
        return json({ success: false, error: 'Follow not found' }, 404);
    } catch (err) { console.error('[music/follows DELETE]', err.message); return json({ success: false, error: 'Failed to unfollow album' }, 500); }
}
