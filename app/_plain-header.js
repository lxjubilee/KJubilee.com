/*
 * The bar the document pages wear.
 *
 * ONE COPY, because it is now on three pages and a header pasted three times
 * is a header that drifts — which is the exact fault app/_site-header.js was
 * written to fix for the other five.
 *
 * WHY THESE PAGES DO NOT GET THE FULL HEADER. /terms and /privacy open in a new
 * tab from a half-completed sign-up, and a navigation bar there is an invitation
 * to wander off mid-signup. /sitemap is itself a navigation: the category bar
 * above it was a second one, stacked on top of the page whose whole job is
 * getting you somewhere.
 *
 * A server component with no state — these pages are text, so nothing here
 * ships to the browser.
 */
export default function PlainHeader({ back = '/', backLabel = '← Back to the dial' }) {
    return (
        <div className="kj-plainbar">
            <link rel="stylesheet" href="/css/plain-header.css" precedence="kj-header" />
            <div className="kj-plainbar-in">
                <a className="kj-plainbar-brand" href="/" aria-label="kJubilee.com home">
                    <img src="/images/members/JubileeInspire-Circle-200.png" alt="" width="30" height="30" />
                    <span className="kj-plainbar-name"><span className="k">k</span>Jubilee.com</span>
                </a>
                <a className="kj-plainbar-back" href={back}>{backLabel}</a>
            </div>
        </div>
    );
}
