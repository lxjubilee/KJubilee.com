'use client';

import { usePageScripts } from '@/lib/use-page-script';
import SiteHeader from './_site-header';
import Year from './_year';

/*
 * Ported from public/.
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
            <link rel="stylesheet" href="/css/site-header.css" precedence="kj-header" />
            <link rel="stylesheet" href="/css/pages/home.css" precedence="kj-page" />
            <SiteHeader />

            <main className="scroll" id="scroll">
              <div className="scroll-inner" id="view"></div>
              <footer className="site-footer">
                <div className="site-footer-inner">
                  {/* <Year /> reads the VIEWER's clock, so this rolls over on its
                      own every January. See app/_year.js. */}
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
