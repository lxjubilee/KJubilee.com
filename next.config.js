'use strict';

// ─────────────────────────────────────────────────────────────────────────
// kJubilee — Next.js config.
//
// MIGRATION STAGE 1: the API lives in app/api/**, the pages are still the
// hand-written HTML in public/. The rewrites below reproduce the res.sendFile()
// page routes from server.js so URLs do not change, and the headers reproduce
// what helmet + express.static were setting.
//
// server.js still runs and still serves everything; nothing here replaces it
// until you switch the deploy over.
// ─────────────────────────────────────────────────────────────────────────

// Every page is now a route under app/. The rewrites that used to point these
// at public/*.html are gone with the files themselves.
const PAGE_ROUTES = [
    '/', '/radio', '/music', '/player', '/dial',
    '/login', '/signin', '/signup', '/stations', '/map',
    '/forgot-password', '/reset-password',
];

// Every URL this site had before the Next migration.
//
// The pages moved from public/*.html to app routes and the files went to
// legacy/, but the LINKS did not move with them. radio.js and music.js still
// build `/login.html?redirect=…` when an anonymous listener tries to favourite
// a station, so the sign-in prompt led straight to "This page could not be
// found" — and the same for every other .html path in the shipped scripts.
//
// Rewriting those call sites fixes the ones we know about. This covers the
// rest: bookmarks, links from other Jubilee sites, anything printed, and any
// call site still lurking inside a template string.
//
// Temporary (307) rather than permanent on purpose. A 308 is cached by the
// browser more or less forever, and on a site whose URLs have just moved once
// already, being able to change these again is worth more than the redirect
// being marked canonical.
const LEGACY_HTML_ROUTES = {
    '/index.html': '/',
    '/login.html': '/login',
    '/signin.html': '/signin',
    '/signup.html': '/signup',
    '/forgot-password.html': '/forgot-password',
    '/reset-password.html': '/reset-password',
    /* /radio WAS THE OLD FULL-PAGE PLAYER, AND IT IS GONE (2026-09-03).
       It had drifted into a dead end: JubileeVerse branding on a kJubilee
       route, an empty station list, and "Select a station" over a list that
       never arrived - and ?station=<slug>, which every link into it carried,
       did nothing at all. /player is the dial that works.

       Both entries redirect rather than 404 because the address is in the
       search index, in bookmarks and on printed material. Next carries the
       query string across on its own, so ?station=<slug> survives the hop and
       public/js/pages/player.js resolves it to a frequency at the far end -
       an old deep link lands tuned, not merely somewhere. */
    '/radio.html': '/player',
    '/radio': '/player',
    '/radio/': '/player',
    '/music.html': '/music',
    '/player.html': '/player',
    '/dial.html': '/dial',
    '/stations.html': '/stations',
    '/map.html': '/map',
    // The "Previous site" link on the home page. Next serves static files but
    // has no directory index, so /backup/ alone would still 404.
    '/backup': '/backup/index.html',
    '/backup/': '/backup/index.html',
};

// helmet's defaults, minus the two it was configured to disable:
//   contentSecurityPolicy: false  — the player HTML inlines styles + scripts
//   crossOriginEmbedderPolicy: false
const SECURITY_HEADERS = [
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Origin-Agent-Cluster', value: '?1' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
    // helmet's default is 'no-referrer', which is what the static site shipped.
    // It stops being free once a page embeds a third-party challenge: Cloudflare
    // Turnstile checks the hostname against the site key's allowlist, and with
    // 'no-referrer' the browser tells it nothing to check — the widget fails to
    // render, no token is produced, and every sign-in is refused for want of one.
    //
    // 'strict-origin-when-cross-origin' sends the ORIGIN only (https://kjubilee.com,
    // never a path or query) to other sites, and it is the modern browser default.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-XSS-Protection', value: '0' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
];

// What express.static was setting on every file in public/.
const NO_CACHE = [
    { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
    { key: 'Pragma', value: 'no-cache' },
    { key: 'Expires', value: '0' },
];

// Scoped to the legacy asset trees and page routes rather than '/:path*', so
// Next keeps its own immutable caching on /_next/static — the one real perf win
// available while the pages are still plain HTML.
//
// The page routes have to be listed alongside the .html files: headers() matches
// the INCOMING path, so a request for /radio never sees a rule written against
// /radio.html even though the rewrite lands there.
const NO_CACHE_SOURCES = [
    ...PAGE_ROUTES,
    // /analytics/start.html — an operations console, and the one page here whose
    // whole value is that its numbers are current. A cached copy of it reports
    // yesterday's dial with today's confidence.
    '/analytics/(.*)',
    // /todo/* — the recording queues, and consoles for the same reason: they
    // report a backlog that changes as work is done, and they now carry a bar
    // that says who is signed in. A cached copy of one greets the wrong person.
    '/todo/(.*)',
    '/js/(.*)',
    '/css/(.*)',
    '/data/(.*)',
    '/images/(.*)',
    '/audio/(.*)',
];

/** @type {import('next').NextConfig} */
module.exports = {
    reactStrictMode: true,

    // Where the build output goes. Stays '.next' everywhere by default, so the
    // standalone deploy below is untouched. The override exists because this
    // checkout lives on an SMB share (\\HDC-INSPIRESERVER\Websites): when a dev
    // server is killed, the share keeps handles open on .next/dev/trace and on
    // Samba's delete-pending placeholders, and every later `next dev` dies with
    // EPERM before it serves a request. distDir may not leave the project
    // directory, so pointing a dev run at a sibling is the way out:
    //   NEXT_DIST_DIR=.next-dev npm run dev
    distDir: process.env.NEXT_DIST_DIR || '.next',

    // Part two of the same share problem. The dev server takes a lockfile inside
    // distDir to catch a second `next dev`; on SMB that file cannot be removed
    // when the server is killed, so the next start either refuses ("Another next
    // dev server is already running", naming a PID that no longer exists) or
    // dies with "Access is denied (os error 5)" trying to retake it. Off only
    // under the NEXT_DIST_DIR workaround, so a normal run still gets the guard.
    experimental: process.env.NEXT_DIST_DIR ? { lockDistDir: false } : {},

    // Build here, ship the result. The production box (94.72.120.231) also runs
    // jubilujah, torahsings and the radio, and has roughly 1 GB of its 11.7 GB
    // free — `next build` there gets OOM-killed, and a half-finished build
    // leaves .next in a state `next start` will not run.
    //
    // 'standalone' traces the dependencies actually reached and emits
    // .next/standalone with its own minimal node_modules and server.js, so the
    // deploy is ~50 MB and needs no `npm install` on the box at all.
    output: 'standalone',

    // pg loads its driver dynamically; bundling it breaks the build. Same for
    // the AWS SDK, which the tooling pulls in.
    serverExternalPackages: ['pg', 'pg-native', '@aws-sdk/client-s3', '@aws-sdk/lib-storage'],

    // The query string is carried across by default, so
    // /login.html?redirect=/radio arrives at /login?redirect=/radio with the
    // return path intact — which is the whole point of that link.
    async redirects() {
        return Object.entries(LEGACY_HTML_ROUTES).map(([source, destination]) => ({
            source,
            destination,
            permanent: false,
        }));
    },

    async headers() {
        return [
            { source: '/:path*', headers: SECURITY_HEADERS },
            ...NO_CACHE_SOURCES.map((source) => ({ source, headers: NO_CACHE })),
        ];
    },

};
