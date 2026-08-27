'use client';

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

const LINKS = [
  { id: 'bible',    href: 'https://www.jubileeinspire.com', label: 'Jubilee AI Bible Chat', external: true },
  { id: 'player',   href: '/player',                        label: 'The Dial' },
  { id: 'stations', href: '/stations',                      label: 'HM Radio Stations' },
  { id: 'map',      href: '/map',                           label: 'AI Towers Map' },
];

/* Sits after the four cross-site links, so the bar reads the same for everyone
   and the extra entry appears on the end rather than shifting the others along.
   Painted only for administrators — see _use-is-admin.js for why that is a
   question for the server and not for localStorage. */
const ADMIN_LINK = { id: 'admin', href: '/admin', label: 'Admin' };

export default function SiteHeader({ current }) {
    const isAdmin = useIsAdmin();

    return (
        <header className="topbar">
            <div className="topbar-row1">
                <a className="logo" href="/" aria-label="kJubilee.com home">
                    <img className="logo-img" src="/images/members/JubileeInspire-Circle-200.png" alt="" width="32" height="32" />
                    <span className="logo-name">
                        <span className="logo-k">k</span><span className="logo-accent">Jubilee</span>.com
                    </span>
                </a>
                <div className="spacer"></div>

                {(isAdmin ? [...LINKS, ADMIN_LINK] : LINKS).map((l) => (
                    <a
                        key={l.id}
                        className={'nav-textlink'
                            + (current === l.id ? ' is-here' : '')
                            + (l.id === 'admin' ? ' nav-textlink--admin' : '')}
                        href={l.href}
                        {...(l.external ? { rel: 'noopener' } : {})}
                        {...(current === l.id ? { 'aria-current': 'page' } : {})}
                    >
                        {l.label}
                    </a>
                ))}

                <div className="searchbar">
                    <svg className="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="11" cy="11" r="7"></circle>
                        <path d="m20 20-3.2-3.2"></path>
                    </svg>
                    <input id="q" type="search" placeholder="Search stations..." aria-label="Search stations" autoComplete="off" />
                    <button className="search-btn" id="qbtn">SEARCH</button>
                </div>

                <AccountButton />
            </div>

            <div className="topbar-row2">
                <nav className="primary-nav" id="nav" aria-label="Station categories"></nav>
                <div className="spacer"></div>
                {/* Right-hand side of the category bar: the HM band explainer, kept
                    apart from the station categories because it is editorial, not
                    a shelf. */}
                <nav className="primary-nav nav-right" id="nav-right" aria-label="About the band"></nav>
                <button className="lang-flag" title="English — more languages on the international shelf" aria-label="Language">
                    <img src="https://flagcdn.com/w80/us.png" alt="English" />
                </button>
            </div>
        </header>
    );
}
