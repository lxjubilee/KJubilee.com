'use client';

import { usePageScripts } from '@/lib/use-page-script';
import AccountButton from '../_account-button';

/*
 * Ported from public/map.
 *
 * The markup is that file's markup; its <style> block is now
 * public/css/pages/map.css and its inline
 * <script> is now /js/pages/map.js.
 * Nothing about the behaviour changed — the scripts are the same classic
 * scripts, loaded in the same order, and usePageScripts unwinds what they
 * register when this page goes away.
 */
export default function MapPage() {
    usePageScripts(['/js/kj-worldmap.js', '/js/pages/map.js']);

    return (
        <>
            <link rel="stylesheet" href="/css/pages/map.css" precedence="kj-page" />
            <header className="topbar">
              <div className="topbar-row1">
                <a className="logo" href="/" aria-label="kJubilee.com home">
                  <img className="logo-img" src="/images/members/JubileeInspire-Circle-200.png" alt="" width="32" height="32" />
                  <span className="logo-name"><span className="logo-k">k</span><span className="logo-accent">Jubilee</span>.com</span>
                </a>
                <div className="spacer"></div>
                <a className="nav-textlink" href="https://www.jubileeinspire.com" rel="noopener">Jubilee AI Bible Chat</a>
                <a className="nav-textlink" href="/player">The Dial</a>
                <a className="nav-textlink" href="/stations">HM Radio Stations</a>
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

            <main>
              <div className="map-wrap">
                <div className="map-head">
                  <div>
                    <h1>Heavenly Modulation (HM) — <span>AI Radio Towers Worldwide</span></h1>
                  </div>
                  <div className="map-tools" role="group" aria-label="Map controls">
                    <button className="map-tool" id="zoomOut" title="Zoom out" aria-label="Zoom out">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>
                    <button className="map-tool" id="zoomIn" title="Zoom in" aria-label="Zoom in">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>
                    <button className="map-tool" id="zoomReset" title="Reset the view" aria-label="Reset the view">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                    </button>
                  </div>
                </div>

                <div className="kjmap" id="map"></div>
                <p className="map-note" id="note">Loading the network…</p>
              </div>

              <aside className="map-side">
                <div className="side-head">
                  <h2>Broadcast locations</h2>
                  <input className="side-search" id="find" type="search" placeholder="Find a city or country code…" autoComplete="off" aria-label="Find a broadcast location" />
                </div>
                <div className="map-list" id="list"></div>
              </aside>
            </main>

        </>
    );
}
