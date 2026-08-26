import path from 'node:path';
import fsp from 'node:fs/promises';
import { json, readJson, CDN_LOCAL_ROOT } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/radio/request-day — a player could not find today's programming.
//
// The tenant day files are published three days ahead by a nightly job, so a
// 404 in the player means that job has been failing for long enough to burn
// through the buffer and nobody noticed. The browser is the first thing to find
// out, so it tells us.
//
// This RECORDS the miss; it does not build the file. Generating a day needs the
// track pool, which lives where the music is and not on this host, and a web
// request must never block on a build. The record is what the operator and the
// next cron run read.
//
// Rate-limited per tenant+date by simple de-duplication: ten thousand listeners
// hitting a missing day would otherwise write ten thousand identical lines.
// Held on globalThis so dev hot-reload does not forget what it has already seen.
const requestedDays = globalThis.__kjRequestedDays || new Map();   // 'tenant|date' -> firstSeen ms
globalThis.__kjRequestedDays = requestedDays;

export async function POST(request) {
    const { tenant, date } = await readJson(request);
    if (!tenant || !date) return json({ success: false, error: 'tenant and date are required' }, 400);

    // Tenant ids look like HM326.20-RO; dates like 20260822. Anything else is
    // not from our player and must never reach a filesystem path.
    if (!/^HM[0-9]{3}\.[0-9]{2}-[A-Z]{2}$/.test(String(tenant))) {
        return json({ success: false, error: 'invalid tenant id' }, 400);
    }
    if (!/^[0-9]{8}$/.test(String(date))) {
        return json({ success: false, error: 'invalid date' }, 400);
    }

    const key = tenant + '|' + date;
    const seen = requestedDays.get(key);
    const firstReport = !seen;
    if (firstReport) requestedDays.set(key, Date.now());

    // Bound the map so a long-running process cannot grow it without limit.
    if (requestedDays.size > 500) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        for (const [k, t] of requestedDays) if (t < cutoff) requestedDays.delete(k);
    }

    if (firstReport) {
        try {
            const dir = path.join(CDN_LOCAL_ROOT, 'radio', '_requests');
            await fsp.mkdir(dir, { recursive: true });
            await fsp.appendFile(
                path.join(dir, new Date().toISOString().slice(0, 10) + '.jsonl'),
                JSON.stringify({ tenant, date, first_seen: new Date().toISOString() }) + '\n', 'utf8');
            console.warn('[radio/request-day] MISSING programming: ' + tenant + ' ' + date);
        } catch (err) {
            console.error('[radio/request-day]', err.message);
        }
    }
    return json({ success: true, tenant, date, recorded: firstReport });
}
