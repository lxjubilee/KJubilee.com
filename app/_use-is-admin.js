'use client';

import { useEffect, useState } from 'react';
import { authToken } from './_session-store';

/*
 * May the person in this browser open the admin console?
 *
 * ASKED ON MOUNT, NOT WHEN A MENU OPENS. The earlier version of this lived
 * inside the account menu and only ran when somebody opened it, which was free
 * for everyone who never did. That stopped being possible once the Admin link
 * moved into the header bar itself: a link that is always visible has to know
 * the answer before anyone clicks anything.
 *
 * The cost is one indexed single-row lookup per header mount, and only for
 * signed-in visitors — an anonymous one never has a token to send and never
 * reaches the network. The header is remounted per navigation rather than
 * living in the root layout, so this is per page view; if that ever shows up
 * in the numbers, the fix is to lift SiteHeader into app/layout.js, not to
 * cache the answer here.
 *
 * NOT READ FROM THE STORED SESSION, and this is the part worth keeping.
 * /api/auth/login writes {id, email, name} with no role at all, so a password
 * sign-in has nothing to read; and a role copied into localStorage keeps
 * claiming admin long after the role is taken away. The server answers from
 * the database every time, which is also why a grant shows up without the
 * person signing in again.
 *
 * THIS IS NOT A PERMISSION. It decides whether a link is painted. Every
 * /api/admin/* route asks the database for itself (lib/access.js), so a browser
 * that lies to itself about this gains a link and a 403 — and an executive who
 * follows the link still only sees the sections their role was granted.
 */
export default function useIsAdmin() {
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const token = authToken();
        if (!token) { setIsAdmin(false); return; }

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/auth/me', {
                    headers: { Authorization: 'Bearer ' + token },
                    cache: 'no-store',
                });
                if (cancelled) return;
                if (!res.ok) { setIsAdmin(false); return; }
                const body = await res.json();
                // Executives reach the console too — the link is "may open it",
                // not "is an admin". Which sections they actually get is the
                // console's own question, answered by /api/admin/overview.
                const role = String(body?.user?.role || '').toLowerCase();
                if (!cancelled) setIsAdmin(role === 'admin' || role === 'executive');
            } catch {
                // Offline, or the token expired. No link is the safe answer — it
                // costs an admin one reload and tells a stranger nothing.
                if (!cancelled) setIsAdmin(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    return isAdmin;
}
