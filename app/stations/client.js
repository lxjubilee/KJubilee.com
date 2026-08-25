'use client';

import { usePageScripts } from '@/lib/use-page-script';
import AccountButton from '../_account-button';

/*
 * Ported from public/stations.
 *
 * The markup is that file's markup; its <style> block is now
 * public/css/pages/stations.css and its inline
 * <script> is now /js/pages/stations.js.
 * Nothing about the behaviour changed — the scripts are the same classic
 * scripts, loaded in the same order, and usePageScripts unwinds what they
 * register when this page goes away.
 */
export default function StationsPage() {
    usePageScripts(['/js/pages/stations.js']);

    return (
        <>
            <link rel="stylesheet" href="/css/pages/stations.css" precedence="kj-page" />
            <header className="topbar">
              <div className="topbar-row1">
                <a className="logo" href="/" aria-label="kJubilee.com home">
                  <img className="logo-img" src="/images/members/JubileeInspire-Circle-200.png" alt="" width="32" height="32" />
                  <span className="logo-name"><span className="logo-k">k</span><span className="logo-accent">Jubilee</span>.com</span>
                </a>
                <div className="spacer"></div>
                <a className="nav-textlink" href="https://www.jubileeinspire.com" rel="noopener">Jubilee AI Bible Chat</a>
                <a className="nav-textlink" href="/player">The Dial</a>
                <a className="nav-textlink is-here" href="/stations">HM Radio Stations</a>
                <a className="nav-textlink" href="/map">AI Towers Map</a>
                <div className="searchbar">
                  <svg className="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path></svg>
                  <input id="q" type="search" placeholder="Search stations..." aria-label="Search stations" autoComplete="off" />
                  <button className="search-btn" id="qbtn">SEARCH</button>
                </div>
                <AccountButton />
              </div>
              <div className="topbar-row2">
                <nav className="primary-nav" id="nav" aria-label="Station categories"></nav>
                <div className="spacer"></div>
                {/* Right-hand side of the category bar: the HM band explainer, kept apart
                     from the station categories because it is editorial, not a shelf. */}
                <nav className="primary-nav nav-right" id="nav-right" aria-label="About the band"></nav>
                <button className="lang-flag" title="English — more languages on the international shelf" aria-label="Language">
                  <img src="https://flagcdn.com/w80/us.png" alt="English" />
                </button>
              </div>
            </header>

            <main className="scroll">
              <div className="scroll-inner">
                {/* No page heading: the top bar already says All Stations and carries the
                     102 / 5 on-air count, so a title and blurb here only repeated it and
                     pushed the table below the fold. An h1 is kept for document structure
                     and screen readers, visually hidden. */}
                <h1 className="sr-only">All Stations</h1>

                <div id="sections"></div>
                <div className="empty" id="empty" hidden={true}>No station matches that search.</div>
              </div>

              <footer className="site-footer">
                <div className="site-footer-inner">
                  <strong>kJubilee.com</strong> — Kingdom Jubilee Radio · Heavenly Modulation band<br />
                  <span id="stat"></span><br />
                  <a href="/">Home</a> · <a href="/radio">Radio player</a> · <a href="/music">Music</a> · <a href="/signup">Create an account</a><br />
                  © <span id="year"></span> Jubilee Enterprises.
                </div>
              </footer>
            </main>

        </>
    );
}
