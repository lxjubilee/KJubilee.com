'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ensureCatalogue, loadOnce } from '@/lib/session-scripts';
import SessionKeeper from './_session-keeper';

/*
 * The session-owned chrome: the footer player, and the click rule that keeps
 * navigation inside the document.
 *
 * Both are ports of decisions made in public/js/kj-nav.js, which this replaces.
 * Next's router does the document-swapping half; these are the two halves it
 * does not do.
 */

/*
 * THE ROUTE IS RETIRED (2026-09-03) AND THIS GUARD STAYS ON PURPOSE.
 * /radio no longer exists as a page; next.config.js redirects it, and its
 * query string, to /player. The guard is still worth having because a /radio
 * link can still be CLICKED — old content, a bookmark bar, a printed card —
 * and the link router below must let that leave as a document load so the
 * server-side redirect actually fires. Routed client-side it would ask the app
 * for a page that is not there.
 *
 * An exact match is all that is needed, and a substring test would also claim
 * any future path that merely contains the word.
 */
function isRadio(pathname) {
    const p = (pathname || '').toLowerCase();
    return p === '/radio' || p === '/radio/';
}

function isAdmin(pathname) {
    const p = (pathname || '').toLowerCase();
    return p === '/admin' || p.startsWith('/admin/');
}

function isAccount(pathname) {
    const p = (pathname || '').toLowerCase();
    return p === '/account' || p.startsWith('/account/');
}

/*
 * Where the footer bar does not belong.
 *
 * /radio runs its own full player and the two would fight over one <audio>.
 * /admin is a console, not a page of the site: it owns the whole viewport in a
 * sticky-rail grid, and a bar pinned across the bottom both covers the last row
 * of a table and puts a listener's now-playing on an operator's screen.
 * /account is Profile settings — a form about who you are, not a place to
 * listen from, and the bar sat over the bottom of it.
 */
function hidesFooterPlayer(pathname) {
    return isRadio(pathname) || isAdmin(pathname) || isAccount(pathname);
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

            // A ROUTE HANDLER IS NOT A PAGE. /api/* answers with a redirect or
            // a raw document, and the router has nothing to render for it —
            // pushed instead of navigated, the click would go nowhere. The
            // rail's "Bible Talks" row is one of these: it mints a one-time
            // Jubilee ID ticket and redirects to another origin, which is a
            // navigation by definition, so it must leave the document.
            if (url.pathname.startsWith('/api/')) return;

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
 * Hiding the bar is a CSS class, not a call to remove the element.
 *
 * THE BAR MUST NOT BE TORN DOWN. Its <audio> is the reason SiteChrome is
 * mounted in the root layout at all — streaming-services.md §9.8, "audio must
 * continue playing while the listener navigates the site". Removing the bar on
 * the way into /admin would stop whatever was playing; a class keeps the
 * element, and the sound, exactly where they were.
 *
 * A RULE RATHER THAN AN INLINE STYLE, because the bar may not exist yet. The
 * player script is loaded once per session and builds #kjPlayer when it runs,
 * which can land after this effect on a fast navigation. A stylesheet applies
 * to an element that appears later; setting .style.display on a null cannot.
 */
const NO_PLAYER_CLASS = 'kj-no-player';
const NO_PLAYER_STYLE_ID = 'kj-no-player-css';

function ensureNoPlayerRule() {
    if (document.getElementById(NO_PLAYER_STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = NO_PLAYER_STYLE_ID;
    // The padding is the other half: body.kj-has-player reserves 80px for a bar
    // that is no longer on screen, which on /admin is 80px of dead space under
    // a full-viewport grid.
    el.textContent =
        'body.' + NO_PLAYER_CLASS + ' #kjPlayer{display:none!important}' +
        'body.' + NO_PLAYER_CLASS + '{padding-bottom:0!important;--kj-player-h:0px}';
    document.head.appendChild(el);
}

/*
 * The footer bar, mounted once for the session so its <audio> is never torn
 * down. Not loaded where hidesFooterPlayer() says it does not belong — and
 * hidden there too, because "do not load it" only helps when that page is the
 * first one opened. Arriving from anywhere else, the bar is already built.
 */
function useFooterPlayer() {
    const pathname = usePathname();

    useEffect(() => {
        const hide = hidesFooterPlayer(pathname);
        ensureNoPlayerRule();
        document.body.classList.toggle(NO_PLAYER_CLASS, hide);

        if (hide) return;
        // The player reads window.KJ_STATIONS at load time, so the catalogue
        // has to be in place before it runs.
        ensureCatalogue().then(() => {
            loadOnce('/js/kj-footer-player.js');
            // Presence rides the player: it is on every page and holds the
            // station across navigations, so a listener stays counted after
            // they leave the dial. Loaded after, because it reads the
            // player's state and its state event.
            loadOnce('/js/kj-presence.js');
        });
    }, [pathname]);

    // Leaving the site entirely should not strand the class on <body> for a
    // back-navigation that restores the same document.
    useEffect(() => () => document.body.classList.remove(NO_PLAYER_CLASS), []);
}

export default function SiteChrome() {
    useInternalLinkRouting();
    useFooterPlayer();
    // Keeps the access token fresh on every page (app/_session-keeper.js).
    return <SessionKeeper />;
}
