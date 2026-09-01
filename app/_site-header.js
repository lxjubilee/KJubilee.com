'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';

import AccountButton from './_account-button';
import useIsAdmin from './_use-is-admin';

/*
 * THE SITE HEADER — one copy, used by every page.
 *
 * This markup was pasted into four page components (home, player, map,
 * stations) and had already drifted: the map page's own link was never marked
 * as current, and two more pages carried a `is-here` class that no stylesheet
 * on those pages painted. Two further pages (/radio, /music) had a different
 * header altogether, branded JubileeVerse with Nova's avatar rather than
 * kJubilee — a visitor moving between pages of one site was shown two
 * different sites.
 *
 * `current` is the only thing a page gets to vary. It takes the id of the
 * cross-site link that should read as the page you are on:
 *
 *     <SiteHeader current="player" />
 *
 * Pass nothing on a page that is not one of them (the home page is the
 * wordmark's own destination, so it marks nothing).
 *
 * The two <nav> elements are left EMPTY on purpose. Every page's own script
 * fills them from window.KJ_SECTIONS, so the categories cannot drift from the
 * catalogue and this component never needs to know what the sections are.
 * Styling is public/css/site-header.css — the two change together.
 */

/* "Jubilee AI Bible Chat" USED TO LEAD THIS LIST. It went when the
   JubileeInspire rail landed (app/_inspire-rail.js): the rail is pinned down
   the left of every page and its Home entry is that same destination, so the
   bar was offering a second copy of a link already on screen. The rail is the
   way back to JubileeInspire now; this bar is for kJubilee's own places. */
const LINKS = [
  { id: 'player',   href: '/player',                        label: 'Radio Dial' },
  /* "HM Radio Stations" WAS HERE. It moved to the footers of the home and
     stations pages: it is the full index of the dial, which is a place you go
     once you already know you want the whole list — not a peer of the two
     ways of BROWSING the dial that are left in the bar. Removing it also gives
     row 1 back the width the strapline under the wordmark now takes. */
  { id: 'map',      href: '/map',                           label: 'AI Towers Map' },
];

/* Sits after the four cross-site links, so the bar reads the same for everyone
   and the extra entry appears on the end rather than shifting the others along.
   Painted only for administrators — see _use-is-admin.js for why that is a
   question for the server and not for localStorage. */
const ADMIN_LINK = { id: 'admin', href: '/admin', label: 'Admin' };

/*
 * WHEN THE CATEGORIES STOP FITTING, THEY BECOME A HAMBURGER.
 *
 * Measured, not a breakpoint. The labels are the section names out of
 * window.KJ_SECTIONS — a page's own script writes them into #nav after this
 * component has mounted, they differ per page, and they are editorial copy that
 * can be re-worded any day. Any width picked today would be wrong for some set
 * of them, and wrong quietly: the bar would either collapse while there was
 * room left, or scroll its links off the edge before it collapsed.
 *
 * So a hidden one-line copy of the same buttons is measured against the room
 * actually left in row 2. The copy has to exist even while collapsed, because
 * the real nav is hidden then and there would be nothing left to measure — the
 * bar could never decide to open back up on the way to a wider window.
 */
function useNavCollapse() {
    const [collapsed, setCollapsed] = useState(false);
    const [open, setOpen] = useState(false);
    const headerRef = useRef(null);
    const rowRef = useRef(null);
    const ghostRef = useRef(null);
    const tailRef = useRef(null);

    useEffect(() => {
        const row = rowRef.current;
        const ghost = ghostRef.current;
        if (!row || !ghost) return undefined;

        const nav = document.getElementById('nav');
        const navRight = document.getElementById('nav-right');

        // The ghost mirrors whatever the page script put in the two navs, with
        // the same .nav-link class, so the widths are the real widths.
        const fill = () => {
            ghost.innerHTML = (nav ? nav.innerHTML : '') + (navRight ? navRight.innerHTML : '');
        };

        const measure = () => {
            const cs = getComputedStyle(row);
            const gap = parseFloat(cs.columnGap || cs.gap || 0) || 0;
            const room =
                row.clientWidth
                - parseFloat(cs.paddingLeft || 0)
                - parseFloat(cs.paddingRight || 0)
                - (tailRef.current ? tailRef.current.offsetWidth : 0)
                - gap;
            // A hamburger costs room too, so a bar that only just fits does not
            // flip back and forth across a single pixel as the window is dragged.
            setCollapsed(ghost.scrollWidth > room - 8);

            /* The opened menu hangs below the bar, so it needs the bar's height.
               MEASURED, not described: the pages that carry this header declare
               their own --topbar-row1-h/--topbar-row2-h, /radio and /music
               declare neither, and a browser at 125% rounds each row to a
               different whole pixel. A described height is a gap or an overlap
               on some page at some zoom. */
            if (headerRef.current) {
                const h = Math.ceil(headerRef.current.getBoundingClientRect().height);
                if (h) document.documentElement.style.setProperty('--kj-hdr-h', h + 'px');
            }
        };

        fill();
        measure();

        // The navs are filled by the page's own script, which runs after this
        // effect; without watching them the first measurement would be of an
        // empty bar and the burger would never appear.
        let mo;
        if (typeof MutationObserver === 'function') {
            mo = new MutationObserver(() => { fill(); measure(); });
            if (nav) mo.observe(nav, { childList: true, subtree: true, characterData: true });
            if (navRight) mo.observe(navRight, { childList: true, subtree: true, characterData: true });
        }

        let ro;
        if (typeof ResizeObserver === 'function') {
            ro = new ResizeObserver(measure);
            ro.observe(row);
            ro.observe(ghost);
            if (headerRef.current) ro.observe(headerRef.current);
        }
        window.addEventListener('resize', measure);
        window.addEventListener('orientationchange', measure);

        return () => {
            if (mo) mo.disconnect();
            if (ro) ro.disconnect();
            window.removeEventListener('resize', measure);
            window.removeEventListener('orientationchange', measure);
        };
    }, []);

    // Nothing may leave the menu open behind the reader — a window dragged wide
    // again puts the links back in the bar, and the panel has to go with them.
    useEffect(() => { if (!collapsed) setOpen(false); }, [collapsed]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    return { collapsed, open, setOpen, headerRef, rowRef, ghostRef, tailRef };
}

export default function SiteHeader({ current }) {
    const isAdmin = useIsAdmin();
    const { collapsed, open, setOpen, headerRef, rowRef, ghostRef, tailRef } = useNavCollapse();
    const menuRef = useRef(null);

    /* The menu's category entries are CLONES of the real nav buttons, carried
       over with their .nav-link class and their data-section intact.

       That is the whole of the wiring. Every page's script delegates section
       clicks from `document` on `.nav-link[data-section]`, and paints the
       current one by walking document.querySelectorAll('.nav-link') — so a
       clone is clicked, and painted, by the code that was already there. A
       hand-rolled menu would have needed its own copy of both, on four pages. */
    const fillMenu = useCallback((node) => {
        menuRef.current = node;
        if (!node) return;
        const nav = document.getElementById('nav');
        const navRight = document.getElementById('nav-right');
        node.innerHTML = '';
        [nav, navRight].forEach((src) => {
            if (!src) return;
            src.querySelectorAll('.nav-link').forEach((link) => {
                const copy = link.cloneNode(true);
                copy.classList.add('nav-menu-link');
                node.appendChild(copy);
            });
        });
    }, []);

    const links = isAdmin ? [...LINKS, ADMIN_LINK] : LINKS;

    /* ── THE SEARCH BOX HANDS OFF TO JUBILEESEARCH ──────────────────────
       Empty box, empty search: the bare site, rather than a query for nothing.
       With text, it goes to the results page with `q`, which is the parameter
       JubileeSearch's own form and its own script both use.

       THE .html IS DELIBERATE, and it is NOT what that site links to itself.
       Its form says action="/search" and its app.js does
       `location.href = /search?q=`, but its host serves no extensionless URLs:
       /search?q=gospel is a hard nginx 404, which is why JubileeSearch's own
       search box is broken at the time of writing. /search.html?q=gospel
       answers 200 AND carries the #results element its script requires before
       it will run a query at all — without that element it silently does
       nothing. So this points at the page that works rather than the one that
       is advertised, and it keeps working unchanged if that host later maps
       the extensionless path. */
    const runSearch = () => {
        const el = typeof document !== 'undefined' ? document.getElementById('q') : null;
        const v = ((el && el.value) || '').trim();
        window.location.href = v
            ? 'https://jubileesearch.com/search.html?q=' + encodeURIComponent(v)
            : 'https://jubileesearch.com/';
    };


    return (
        <header className={'topbar' + (collapsed ? ' is-nav-collapsed' : '')} ref={headerRef}>
            <div className="topbar-row1">
                <a className="logo" href="/" aria-label="kJubilee.com home">
                    <img className="logo-img" src="/images/members/JubileeInspire-Circle-200.png" alt="" width="32" height="32" />
                    {/* Just the wordmark now. The .logo-block wrapper went with
                        the strapline: it existed only to stack the two lines so
                        the disc centred against the pair, and .logo is already
                        align-items:center, so a lone wordmark centres against
                        the disc on its own. */}
                    <span className="logo-name">
                        <span className="logo-k">k</span><span className="logo-accent">Jubilee</span>.com
                    </span>
                </a>
                <div className="spacer"></div>

                {/* A pipe between each of the cross-site links, and NOT before
                    Admin. Admin is a chip rather than a word precisely so it
                    does not read as a peer of "AI Towers Map" (see the note on
                    .nav-textlink--admin in site-header.css); a separator in
                    front of it would put it back in the run it was taken out
                    of. So the separators are interleaved through LINKS only,
                    and ADMIN_LINK is appended after them. aria-hidden, because
                    a screen reader announcing "pipe" between every link is
                    noise — the list is already a list to it. */}
                {LINKS.map((l, i) => (
                    <Fragment key={l.id}>
                        {i > 0 && <span className="nav-textsep" aria-hidden="true">|</span>}
                        <a
                            className={'nav-textlink' + (current === l.id ? ' is-here' : '')}
                            href={l.href}
                            {...(l.external ? { rel: 'noopener' } : {})}
                            {...(current === l.id ? { 'aria-current': 'page' } : {})}
                        >
                            {l.label}
                        </a>
                    </Fragment>
                ))}
                {isAdmin && (
                    <a
                        className={'nav-textlink nav-textlink--admin'
                            + (current === ADMIN_LINK.id ? ' is-here' : '')}
                        href={ADMIN_LINK.href}
                        {...(current === ADMIN_LINK.id ? { 'aria-current': 'page' } : {})}
                    >
                        {ADMIN_LINK.label}
                    </a>
                )}

                {/* Immediately before the search box, which is the top-right
                    corner of every page. An <a> rather than a <button>: it
                    leaves the site, and the browser should be able to open it
                    in a new tab or copy the address like any other link. The
                    internal-link router in _chrome.js ignores any href whose
                    origin is not this one, so it navigates away normally. */}
                <a className="hdr-cta" href="https://www.jubileepraise.com" rel="noopener">
                    Jubilee Praise
                </a>

                {/* ── THE BOX HANDS THE QUERY TO JUBILEESEARCH ────────────
                    It used to mean four different things depending on which
                    page you were on: the home page and the stations index
                    filtered their own list as you typed, while the map and the
                    dial bounced you to `/?q=` for the home page to answer.
                    Four handlers, in four files, all bound to this one input
                    by id — so what SEARCH did depended on where you happened
                    to be standing.

                    Now it does one thing everywhere, and the header owns it
                    rather than whichever page script happened to load. The
                    per-page handlers are gone; leaving any of them would mean
                    two listeners on the same button and a filter running on a
                    page that is already navigating away. */}
                <div className="searchbar" role="search">
                    <svg className="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="11" cy="11" r="7"></circle>
                        <path d="m20 20-3.2-3.2"></path>
                    </svg>
                    <input
                        id="q"
                        type="search"
                        placeholder="Search"
                        aria-label="Search"
                        autoComplete="off"
                        onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                    />
                    <button className="search-btn" id="qbtn" type="button" onClick={runSearch}>SEARCH</button>
                </div>

                <AccountButton />
            </div>

            <div className="topbar-row2" ref={rowRef}>
                {/* FIRST IN THE ROW, so it sits on the left — and first in the
                    DOM rather than moved there with CSS `order`, because this is
                    the control that stands in for the whole category bar. Tab
                    order and reading order follow the DOM, not the paint, so an
                    ordered-into-place button would be the last thing a keyboard
                    or a screen reader reached on a screen where it is the only
                    way into the site. It is display:none until the bar
                    collapses, so it costs the wide layout nothing. */}
                <button
                    type="button"
                    className={'nav-burger' + (open ? ' is-open' : '')}
                    aria-expanded={open ? 'true' : 'false'}
                    aria-controls="nav-menu"
                    aria-label="Menu"
                    onClick={() => setOpen((v) => !v)}
                >
                    <span className="nav-burger-bars" aria-hidden="true">
                        <span></span><span></span><span></span>
                    </span>
                    <span className="nav-burger-label">Menu</span>
                </button>

                <nav className="primary-nav" id="nav" aria-label="Station categories"></nav>
                <div className="spacer"></div>
                {/* Right-hand side of the category bar: the HM band explainer, kept
                    apart from the station categories because it is editorial, not
                    a shelf. */}
                <nav className="primary-nav nav-right" id="nav-right" aria-label="About the band"></nav>

                {/* The ruler. Off-canvas rather than display:none, because a box
                    that is not laid out has no width to measure. Inert: nothing
                    can tab to it and nothing can click it. */}
                <div className="nav-measure" aria-hidden="true" ref={ghostRef}></div>

                {/* The flag is the one thing in row 2 that never folds away, so
                    it is what the measurement subtracts as already spoken for. */}
                <span className="row2-tail" ref={tailRef}>
                    <button className="lang-flag" title="English — more languages on the international shelf" aria-label="Language">
                        <img src="https://flagcdn.com/w80/us.png" alt="English" />
                    </button>
                </span>
            </div>

            {/* Full width under the bar rather than a narrow dropdown: these are
                the things the site is for, on the screen where they had to be
                folded away, and they should still be a list you can hit with a
                thumb. The cross-site links come with them — row 1 drops them at
                820px and until now that left them with nowhere to be. */}
            {collapsed && open ? (
                <>
                    <div className="nav-menu-overlay" onClick={() => setOpen(false)} />
                    <nav className="nav-menu" id="nav-menu" aria-label="Menu">
                        <div className="nav-menu-group" ref={fillMenu} onClick={() => setOpen(false)}></div>
                        <div className="nav-menu-group nav-menu-cross">
                            {links.map((l) => (
                                <a
                                    key={l.id}
                                    className={'nav-menu-link'
                                        + (current === l.id ? ' is-here' : '')
                                        + (l.id === 'admin' ? ' nav-menu-link--admin' : '')}
                                    href={l.href}
                                    {...(l.external ? { rel: 'noopener' } : {})}
                                    {...(current === l.id ? { 'aria-current': 'page' } : {})}
                                    onClick={() => setOpen(false)}
                                >
                                    {l.label}
                                </a>
                            ))}
                        </div>
                        {/* Row 1 drops the CTA and the account button below
                            620px (see the phone block in site-header.css).
                            They are re-rendered here so taking them off the bar
                            is a tidy-up rather than a dead end: a header you
                            cannot sign in from is not streamlined, it is
                            broken. AccountButton is the same component, so it
                            shows Sign In or the account chip without this file
                            having to know which. */}
                        <div className="nav-menu-group nav-menu-tail">
                            <a className="hdr-cta" href="https://www.jubileepraise.com" rel="noopener">
                                Jubilee Praise
                            </a>
                            <AccountButton />
                        </div>
                    </nav>
                </>
            ) : null}
        </header>
    );
}
