// GET /api/go/bible-talks — send the reader to JubileeBibleTalks, signed in.
//
// The rail's "Bible Talks" row used to be a plain link to jubileebibletalks.com,
// and a plain link arrives as a stranger: the two sites are different origins,
// so nothing kJubilee knows about the reader travels with the click. Someone
// who had just signed in here landed on a sign-in form there, for an account
// the family already has — or, worse, made a second one.
//
// So this hands them a ticket instead. The 90-day Jubilee ID session stays
// here, sealed in an httpOnly cookie (lib/family-session.js), and is never put
// in a URL. From it the authority mints a value that works ONCE and expires in
// about a minute; that is what rides in `?t=`, and the receiving site spends it
// server-side and never renders it. A URL captured from a log, a Referer header
// or a pasted link is dead by the time anyone else tries it.
//
// NEVER BLOCKS THE LINK. Signed out, session expired, authority unreachable,
// no service credentials on this box — every one of those simply sends the
// reader to Bible Talks as a guest, which is exactly what the old plain link
// did. A sign-in service having a bad day must not turn a navigation row into
// an error page.

import { ssoIssueTicket, ssoOpenSession } from '@/lib/sso';
import { readFamily } from '@/lib/family-session';

export const runtime = 'nodejs';
// Reads a cookie and mints a single-use credential. A cached 302 would hand one
// reader's ticket to the next.
export const dynamic = 'force-dynamic';

// The apex, not www: JubileeBibleTalks redirects www -> apex with a 308
// (its middleware.js), so linking to www would spend a hop before the ticket
// even arrives.
const HOME = 'https://jubileebibletalks.com';

// The receiving end. It redeems the ticket, finds or creates the local account,
// sets its own session cookie and redirects onward — all server-side, so the
// ticket never reaches a rendered page and there is nothing to strip afterwards.
const LANDING = `${HOME}/api/sso/land`;

export async function GET(request) {
    let target = HOME;

    try {
        const family = readFamily(request);
        let minted = null;

        if (family && family.token) {
            const issued = await ssoIssueTicket(family.token);
            if (issued.ok && issued.data && issued.data.ticket) minted = issued.data.ticket;

            // RE-OPEN A DEAD SESSION rather than degrade to a guest link.
            //
            // This cookie outlives the session it names: signing out on any
            // sibling revokes the family session, and nothing can reach across
            // origins to clear the cookie here. The reader is still signed in to
            // kJubilee, and we know who they are, so ask for a fresh session
            // instead of making them repair a token they cannot see.
            if (!minted && family.email) {
                const reopened = await ssoOpenSession(family.email);
                const token = reopened.ok && reopened.data && reopened.data.sessionToken;
                if (token) {
                    const retry = await ssoIssueTicket(token);
                    if (retry.ok && retry.data && retry.data.ticket) minted = retry.data.ticket;
                }
            }
        }

        if (minted) target = `${LANDING}?t=${encodeURIComponent(minted)}`;
    } catch {
        // Fall through as a guest — see the note above.
    }

    return new Response(null, {
        // 302, not 308: the answer differs for every reader and every visit, and
        // a permanent redirect would be cached with one reader's ticket in it.
        status: 302,
        headers: {
            Location: target,
            'Cache-Control': 'no-store, private',
            // Keep the ticket out of the next page's Referer. Belt and braces —
            // it is single-use and short-lived — but there is no reason to leak it.
            'Referrer-Policy': 'no-referrer',
        },
    });
}
