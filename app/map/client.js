'use client';

import { usePageScripts } from '@/lib/use-page-script';
import SiteHeader from '../_site-header';

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
            <link rel="stylesheet" href="/css/site-header.css" precedence="kj-header" />
            <link rel="stylesheet" href="/css/pages/map.css" precedence="kj-page" />
            <SiteHeader current="map" />

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
                  {/* The Jubilee Praise button moved to the site header, where it
                      sits before the search box in the top-right corner of EVERY
                      page — including this one. Keeping a second copy here would
                      have put two of the same button on the map screen. */}
                  <input className="side-search" id="find" type="search" placeholder="Find a city or country code…" autoComplete="off" aria-label="Find a broadcast location" />
                </div>
                <div className="map-list" id="list"></div>
              </aside>
            </main>

        </>
    );
}
