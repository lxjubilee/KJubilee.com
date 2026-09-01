'use client';

import { usePageScripts } from '@/lib/use-page-script';
import SiteHeader from '../_site-header';
import Year from '../_year';

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
            <link rel="stylesheet" href="/css/site-header.css" precedence="kj-header" />
            <link rel="stylesheet" href="/css/pages/stations.css" precedence="kj-page" />
            {/* No `current`: the bar no longer carries an HM Radio Stations
                link to mark, so there is nothing here for it to point at.
                SiteHeader's contract is to pass nothing on a page that is not
                one of the bar's own destinations. */}
            <SiteHeader />

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
                  {/* Same single line as the home page — one footer, worded once. */}
                  Copyright © <Year /> Jubilee Software, Inc. All rights reserved.{' '}
                  <a href="/sitemap">Sitemap</a> ·{' '}
                  <a href="/terms">Terms of Use</a> ·{' '}
                  <a href="/privacy">Privacy Policy</a>
                </div>
              </footer>
            </main>

        </>
    );
}
