import path from 'node:path';
import fsp from 'node:fs/promises';
import { getUserIdFromAuth } from '@/lib/auth';
import { json, readJson, CDN_LOCAL_ROOT } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/radio/feedback — listener engagement events. Stored as JSONL on
// the CDN — one file per station per UTC day — not in the database.
export async function POST(request) {
    const ALLOWED = ['thumb_up', 'thumb_down', 'thumb_clear', 'comment', 'favorite', 'skip'];
    const { station_id, station_name, segment_id, segment_type, event_type, comment, session_id, timestamp } = await readJson(request);
    if (!station_id || !event_type) return json({ success: false, error: 'station_id and event_type are required' }, 400);
    if (!ALLOWED.includes(event_type)) return json({ success: false, error: 'unknown event_type' }, 400);

    // Path-traversal-safe station id (folder name).
    const safe = String(station_id).toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!safe || !/^[a-z0-9][a-z0-9._-]*$/.test(safe) || safe.includes('..')) return json({ success: false, error: 'invalid station_id' }, 400);

    const record = {
        event_type, station_id: safe,
        station_name: typeof station_name === 'string' ? station_name.slice(0, 200) : null,
        segment_id:   typeof segment_id   === 'string' ? segment_id.slice(0, 200)   : null,
        segment_type: typeof segment_type === 'string' ? segment_type.slice(0, 40)  : null,
        comment: event_type === 'comment' && typeof comment === 'string' ? comment.trim().slice(0, 400) : null,
        session_id: typeof session_id === 'string' ? session_id.slice(0, 80) : null,
        user_id: getUserIdFromAuth(request) || null,
        client_timestamp: typeof timestamp === 'string' ? timestamp.slice(0, 40) : null,
        received_at: new Date().toISOString(),
    };
    if (event_type === 'comment' && (!record.comment || record.comment.length < 3)) return json({ success: false, error: 'comment too short' }, 400);

    try {
        const day = new Date().toISOString().slice(0, 10);
        const dir = path.join(CDN_LOCAL_ROOT, 'radio', '_feedback', safe);
        await fsp.mkdir(dir, { recursive: true });
        await fsp.appendFile(path.join(dir, day + '.jsonl'), JSON.stringify(record) + '\n', 'utf8');
        return json({ success: true });
    } catch (err) {
        console.error('[radio/feedback]', err.message);
        return json({ success: false, error: 'Failed to record feedback' }, 500);
    }
}
