import path from 'node:path';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import { getUserIdFromAuth } from '@/lib/auth';
import { json, CDN_LOCAL_ROOT } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;   // what express.raw({ limit: '8mb' }) enforced

// POST /api/radio/voicemail — listener voice message, stored "pending" for
// human moderation. Octet-stream body up to 8MB; metadata in query string.
export async function POST(request) {
    const { searchParams } = new URL(request.url);
    const station_id   = searchParams.get('station_id');
    const station_name = searchParams.get('station_name');
    const session_id   = searchParams.get('session_id');
    const duration_s   = searchParams.get('duration_s');
    const mime         = searchParams.get('mime');

    if (!station_id) return json({ success: false, error: 'station_id is required' }, 400);

    // Express rejected an oversized body before it was buffered; do the same
    // from Content-Length so an 8MB+ upload is refused rather than read.
    const declared = parseInt(request.headers.get('content-length') || '0', 10);
    if (declared > MAX_BYTES) return json({ success: false, error: 'audio body too large' }, 413);

    const audio = Buffer.from(await request.arrayBuffer());
    if (audio.length === 0) return json({ success: false, error: 'audio body is required' }, 400);
    if (audio.length > MAX_BYTES) return json({ success: false, error: 'audio body too large' }, 413);

    const safe = String(station_id).toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!safe || !/^[a-z0-9][a-z0-9._-]*$/.test(safe) || safe.includes('..')) return json({ success: false, error: 'invalid station_id' }, 400);

    const mimeStr = typeof mime === 'string' ? mime.toLowerCase() : 'audio/webm';
    const ext = mimeStr.includes('ogg') ? 'ogg'
              : (mimeStr.includes('mp4') || mimeStr.includes('m4a')) ? 'm4a'
              : (mimeStr.includes('mpeg') || mimeStr.includes('mp3')) ? 'mp3' : 'webm';

    try {
        const id = crypto.randomUUID();
        const dir = path.join(CDN_LOCAL_ROOT, 'radio', '_voicemail', safe, 'pending');
        await fsp.mkdir(dir, { recursive: true });
        await fsp.writeFile(path.join(dir, id + '.' + ext), audio);
        const meta = {
            id, station_id: safe,
            station_name: typeof station_name === 'string' ? station_name.slice(0, 200) : null,
            session_id:   typeof session_id   === 'string' ? session_id.slice(0, 80)    : null,
            user_id: getUserIdFromAuth(request) || null,
            duration_s: duration_s ? (parseInt(duration_s, 10) || null) : null,
            mime_type: mimeStr.slice(0, 60),
            audio_file: id + '.' + ext,
            bytes: audio.length,
            status: 'pending',
            received_at: new Date().toISOString(),
        };
        await fsp.writeFile(path.join(dir, id + '.json'), JSON.stringify(meta, null, 2));
        console.log(`[radio/voicemail] pending ${id} for ${safe} (${audio.length} bytes)`);
        return json({ success: true, id });
    } catch (err) {
        console.error('[radio/voicemail]', err.message);
        return json({ success: false, error: 'Failed to store voice message' }, 500);
    }
}
