import path from 'node:path';
import fsp from 'node:fs/promises';
import { json, NO_STORE, CDN_LOCAL_ROOT } from '@/lib/api';
import { requireAdmin } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// /api/admin/feedback — the listener inbox.
//
// THREE WRITERS, ONE READER. /api/radio/feedback appends button presses and
// typed comments, /api/radio/request-day appends the tenant+date of a day file
// that was asked for and did not exist, and /api/radio/voicemail drops a pair
// of files per recording. Nothing has ever read any of it back. This route is
// that reader, and it is the whole reason the inbox section exists.
//
// GATED, AND NOT ONLY BECAUSE OF THE ROLE. These records carry `user_id`,
// `session_id` and free text a listener typed believing they were writing to
// the station, not to the public. Even the counts would be a leak; the comment
// bodies certainly are.
//
// READ-ONLY ON PURPOSE. Deleting a listener's message, or marking a voicemail
// handled, changes what the CDN tree says happened — and the tree is append-only
// by design so the record cannot be quietly edited. Triage belongs in a step
// that moves files deliberately, not in a DELETE hanging off a browser tab.
// ─────────────────────────────────────────────────────────────────────────

const DAY_MS = 86400000;

// Station ids reach this file from a query string and are joined into a path.
// The shape is pinned rather than sanitised: `..` and separators simply are not
// members of this pattern, so traversal is rejected before path.join sees it.
const STATION_RE = /^HM\d{3}\.\d{2}-[A-Z]{2}$/;

const MAX_DAYS = 90;
const MAX_LIMIT = 1000;

async function listDir(dir) {
    try { return await fsp.readdir(dir, { withFileTypes: true }); }
    catch (err) { if (err.code === 'ENOENT') return []; throw err; }
}

/** The set of YYYY-MM-DD day-file names inside the window, newest first. */
function dayNames(days) {
    const out = [];
    for (let i = 0; i <= days; i++) out.push(new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10));
    return out;
}

async function readJsonl(file) {
    let text;
    try { text = await fsp.readFile(file, 'utf8'); }
    catch (err) { if (err.code === 'ENOENT') return []; throw err; }
    const out = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        // One unparseable line loses one record, not the file.
        try { out.push(JSON.parse(line)); } catch (e) { /* torn write */ }
    }
    return out;
}

export async function GET(request) {
    const admin = await requireAdmin(request);
    if (!admin) return json({ error: 'Forbidden' }, 403, NO_STORE);

    const q = new URL(request.url).searchParams;
    const days = Math.min(MAX_DAYS, Math.max(1, parseInt(q.get('days'), 10) || 7));
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(q.get('limit'), 10) || 200));
    const kind = String(q.get('kind') || 'all').toLowerCase();
    const commentsOnly = q.get('comments') === '1';

    const stationFilter = String(q.get('station') || '').trim().toUpperCase();
    if (stationFilter && !STATION_RE.test(stationFilter)) {
        return json({ error: 'invalid station' }, 400, NO_STORE);
    }

    const root = path.join(CDN_LOCAL_ROOT, 'radio');
    const names = dayNames(days);
    const items = [];
    const stationsSeen = new Set();
    // Truncation has to be visible. A capped list that says nothing about the
    // cap reads as "this is everything", which is the one thing it is not.
    let matched = 0;

    const want = k => kind === 'all' || kind === k;

    try {
        if (want('feedback')) {
            for (const st of await listDir(path.join(root, '_feedback'))) {
                if (!st.isDirectory()) continue;
                if (stationFilter && st.name !== stationFilter) continue;
                stationsSeen.add(st.name);
                for (const day of names) {
                    for (const rec of await readJsonl(path.join(root, '_feedback', st.name, day + '.jsonl'))) {
                        if (commentsOnly && !(rec.event_type === 'comment' && rec.comment)) continue;
                        matched++;
                        items.push({
                            kind: 'feedback',
                            at: rec.received_at || null,
                            station_id: rec.station_id || st.name,
                            station_name: rec.station_name || null,
                            event_type: rec.event_type || null,
                            comment: rec.comment || null,
                            segment_id: rec.segment_id || null,
                            segment_type: rec.segment_type || null,
                            // Whether it was a signed-in listener, not which one.
                            // The panel never needs the id to triage a comment.
                            signed_in: Boolean(rec.user_id),
                        });
                    }
                }
            }
        }

        if (want('requests') && !stationFilter) {
            // A request record names the tenant that had no day file. It is a
            // programming gap, not a listener message — which is why it is a
            // separate kind rather than another event_type.
            for (const day of names) {
                for (const rec of await readJsonl(path.join(root, '_requests', day + '.jsonl'))) {
                    matched++;
                    items.push({
                        kind: 'request',
                        at: rec.first_seen || null,
                        station_id: rec.tenant || null,
                        station_name: null,
                        missing_date: rec.date || null,
                    });
                }
            }
        }

        if (want('voicemail')) {
            for (const st of await listDir(path.join(root, '_voicemail'))) {
                if (!st.isDirectory()) continue;
                if (stationFilter && st.name !== stationFilter) continue;
                const dir = path.join(root, '_voicemail', st.name, 'pending');
                for (const f of await listDir(dir)) {
                    if (!f.isFile() || !f.name.endsWith('.json')) continue;
                    let meta;
                    try { meta = JSON.parse(await fsp.readFile(path.join(dir, f.name), 'utf8')); }
                    catch (e) { continue; }
                    // Voicemail has no day file to filter on, so the window is
                    // applied to the record's own timestamp instead.
                    if (meta.received_at && Date.parse(meta.received_at) < Date.now() - days * DAY_MS) continue;
                    matched++;
                    items.push({
                        kind: 'voicemail',
                        at: meta.received_at || null,
                        station_id: meta.station_id || st.name,
                        station_name: meta.station_name || null,
                        duration_s: meta.duration_s || null,
                        bytes: meta.bytes || null,
                        status: meta.status || 'pending',
                        signed_in: Boolean(meta.user_id),
                        // The id, not a URL. Serving listener audio through the
                        // panel would need its own gated streaming route; until
                        // that exists the id is how an operator finds the file.
                        id: meta.id || f.name.replace(/\.json$/, ''),
                        audio_file: meta.audio_file || null,
                    });
                }
            }
        }
    } catch (err) {
        console.error('[admin/feedback]', err.message);
        return json({ error: 'Failed to read the inbox' }, 500, NO_STORE);
    }

    // Newest first, and undated records last rather than first — an empty
    // timestamp sorting to the top would bury the thing the operator opened
    // the inbox to see.
    items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));

    return json({
        window_days: days,
        kind,
        station: stationFilter || null,
        matched,
        truncated: matched > limit,
        stations: [...stationsSeen].sort(),
        items: items.slice(0, limit),
    }, 200, NO_STORE);
}
