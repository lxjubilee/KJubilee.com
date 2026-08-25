'use client';

import { usePageScripts } from '@/lib/use-page-script';
import AccountButton from './_account-button';

/*
 * Ported from public/index.html.
 *
 * The markup is that file's markup; its <style> block is now
 * public/css/pages/home.css and its inline
 * <script> is now /js/pages/home.js.
 * Nothing about the behaviour changed — the scripts are the same classic
 * scripts, loaded in the same order, and usePageScripts unwinds what they
 * register when this page goes away.
 */
export default function HomePage() {
    usePageScripts(['/js/station-articles.js', '/js/pages/home.js']);

    return (
        <>
            <link rel="stylesheet" href="/css/pages/home.css" precedence="kj-page" />
            <header className="topbar">
              <div className="topbar-row1">
                <a className="logo" href="/" aria-label="kJubilee.com home">
                  <img className="logo-img" src="/images/members/JubileeInspire-Circle-200.png" alt="" width="32" height="32" />
                  <span className="logo-name"><span className="logo-k">k</span><span className="logo-accent">Jubilee</span>.com</span>
                </a>
                <div className="spacer"></div>
                <a className="nav-textlink" href="https://www.jubileeinspire.com" rel="noopener">Jubilee AI Bible Chat</a>
                <a className="nav-textlink" href="/player.html">The Dial</a>
                <a className="nav-textlink" href="/stations.html">HM Radio Stations</a>
                <a className="nav-textlink" href="/map.html">AI Towers Map</a>
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

            <main className="scroll" id="scroll">
              <div className="scroll-inner" id="view"></div>
              <footer className="site-footer">
                <div className="site-footer-inner">
                  <strong>kJubilee.com</strong> — Kingdom Jubilee Radio · Heavenly Modulation band<br />
                  <span id="stat"></span><br />
                  <a href="/radio">Radio player</a> · <a href="/music">Music</a> · <a href="/signup">Create an account</a> · <a href="/backup/">Previous site</a><br />
                  © <span id="year"></span> Jubilee Enterprises. Station pages below are placeholders while programming is finalised.
                </div>
              </footer>
            </main>

        </>
    );
}
