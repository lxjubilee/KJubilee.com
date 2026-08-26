import { requireAdmin } from '@/lib/admin';
import { BAND_PLAN_HTML } from './content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The HM Band Reallocation plan, for administrators only.
 *
 * THE DOCUMENT IS SERVED FROM HERE RATHER THAN BUNDLED INTO THE PAGE. A client
 * component that imported the HTML would ship all 35 KB of it into the public
 * JavaScript bundle, where anyone could read it without ever signing in — the
 * page would *look* gated and the content would be world-readable. Keeping it
 * behind this handler means the bytes never leave the server without an admin
 * token attached.
 *
 * `dynamic = 'force-dynamic'` for the same reason: a cached or statically
 * prerendered response is a response served without checking who is asking.
 */
export async function GET(request) {
    const admin = await requireAdmin(request);
    if (!admin) {
        // One answer for every failure — no token, unknown user, wrong role.
        // Distinguishing them tells a prober which half of the problem to work on.
        return new Response('Forbidden', {
            status: 403,
            headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
        });
    }
    return new Response(BAND_PLAN_HTML, {
        status: 200,
        headers: {
            'content-type': 'text/html; charset=utf-8',
            // Never let a shared cache or a browser hold an authorised copy that
            // could later be served to someone who is not.
            'cache-control': 'no-store, private',
            'x-robots-tag': 'noindex, nofollow',
        },
    });
}
