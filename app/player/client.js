'use client';

import { usePageScripts } from '@/lib/use-page-script';
import AccountButton from '../_account-button';

/*
 * Ported from public/player.
 *
 * The markup is that file's markup; its <style> block is now
 * public/css/pages/player.css and its inline
 * <script> is now /js/pages/player.js.
 * Nothing about the behaviour changed — the scripts are the same classic
 * scripts, loaded in the same order, and usePageScripts unwinds what they
 * register when this page goes away.
 */
export default function PlayerPage() {
    usePageScripts(['/js/pages/player.js']);

    return (
        <>
            <link rel="stylesheet" href="/css/pages/player.css" precedence="kj-page" />
            <header className="topbar">
              <div className="topbar-row1">
                <a className="logo" href="/" aria-label="kJubilee.com home">
                  <img className="logo-img" src="/images/members/JubileeInspire-Circle-200.png" alt="" width="32" height="32" />
                  <span className="logo-name"><span className="logo-k">k</span><span className="logo-accent">Jubilee</span>.com</span>
                </a>
                <div className="spacer"></div>
                <a className="nav-textlink" href="https://www.jubileeinspire.com" rel="noopener">Jubilee AI Bible Chat</a>
                <a className="nav-textlink is-here" href="/player">The Dial</a>
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
                <nav className="primary-nav nav-right" id="nav-right" aria-label="About the band"></nav>
                <button className="lang-flag" title="English — more languages on the international shelf" aria-label="Language">
                  <img src="https://flagcdn.com/w80/us.png" alt="English" />
                </button>
              </div>
            </header>

            <main className="stage">
              <div className="readout">
                <div className="band">Heavenly Modulation</div>
                <div className="freq"><span className="hm">HM</span><span id="freq">—</span></div>
                <h1 className="station" id="station">Turn the dial</h1>
                <div className="sub" id="sub">Press play, or step through the band with next</div>
                <div className="onair" id="onair"><i></i><span id="onair-text">Off</span></div>
              </div>

              <div className="dial" id="dial" role="group" aria-label="Frequency dial">
                <div className="dial-track" id="track"></div>
                <div className="needle"></div>
              </div>

              <div className="controls">
                <div className="control">
                  <button className="tbtn" id="prev" type="button" aria-label="Previous station">
                    <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3 6 9-6v12z" /></svg>
                  </button>
                  <span className="tbtn-label">Back</span>
                </div>
                <div className="control">
                  <button className="tbtn play" id="play" type="button" aria-label="Play">
                    <svg id="play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                  <span className="tbtn-label" id="play-label">Play</span>
                </div>
                <div className="control">
                  <button className="tbtn" id="next" type="button" aria-label="Next station">
                    <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 6l9 6-9 6z" /></svg>
                  </button>
                  <span className="tbtn-label">Next</span>
                </div>
              </div>

              <p className="hint">
                Keep pressing <kbd>Next</kbd> and listen. Every station on the band is a mark on the
                scale — the arrow keys move along it too, and the bar at the foot of the page keeps
                playing wherever you go on the site.
              </p>
            </main>

        </>
    );
}
