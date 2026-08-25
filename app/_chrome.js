'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ensureCatalogue, loadOnce } from '@/lib/session-scripts';

/*
 * The session-owned chrome: the footer player, and the click rule that keeps
 * navigation inside the document.
 *
 * Both are ports of decisions made in public/js/kj-nav.js, which this replaces.
 * Next's router does the document-swapping half; these are the two halves it
 * does not do.
 */

function isRadio(pathname) {
    const p = (pathname || '').toLowerCase();
    return p === '/radio' || p === '/radio/' || p.indexOf('/radio.html') >= 0;
}

/*
 * WHY THIS EXISTS. Next's router only intercepts <Link>. Every anchor on this
 * site is a plain <a href> — including the ones the page scripts build with
 * innerHTML, which no amount of JSX conversion could turn into <Link>. Left
 * alone, every click would be a full document load, and a document load
 * destroys the <audio> element with it:
 *
 *   streaming-services.md §9.8 — "Audio must continue playing while the
 *   listener navigates the site… A single stray anchor tag causing a full
 *   document load kills audio."
 *
 * So the same click rule kj-nav.js used is kept, and only its body changes:
 * where it used to fetch and swap the document itself, it now hands the URL to
 * Next's router.
 */
function useInternalLinkRouting() {
    const router = useRouter();

    useEffect(() => {
        function onClick(e) {
            if (e.defaultPrevented || e.button !== 0) return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

            const a = e.target.closest && e.target.closest('a[href]');
            if (!a || a.hasAttribute('download')) return;
            if (a.target && a.target !== '' && a.target !== '_self') return;

            let url;
            try { url = new URL(a.getAttribute('href'), location.href); } catch { return; }
            if (url.origin !== location.origin) return;

            // /radio runs its own full player and would fight the footer bar,
            // so a document load there is correct — kj-nav.js left these alone
            // for the same reason.
            if (isRadio(url.pathname)) return;

            // A hash link inside the page currently open is that page's own
            // business: the home page routes its sections and its station
            // articles that way, without touching the document.
            if (url.pathname === location.pathname && url.search === location.search && url.hash) return;

            e.preventDefault();
            router.push(url.pathname + url.search + url.hash);
        }

        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, [router]);
}

/*
 * The footer bar, mounted once for the session so its <audio> is never torn
 * down. Not loaded on /radio, which runs its own full player.
 */
function useFooterPlayer() {
    const pathname = usePathname();

    useEffect(() => {
        if (isRadio(pathname)) return;
        // The player reads window.KJ_STATIONS at load time, so the catalogue
        // has to be in place before it runs.
        ensureCatalogue().then(() => loadOnce('/js/kj-footer-player.js'));
    }, [pathname]);
}

export default function SiteChrome() {
    useInternalLinkRouting();
    useFooterPlayer();
    return null;
}
