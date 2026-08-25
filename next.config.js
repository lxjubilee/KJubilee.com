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
];

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
    { key: 'Referrer-Policy', value: 'no-referrer' },
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
    '/js/(.*)',
    '/css/(.*)',
    '/data/(.*)',
    '/images/(.*)',
    '/audio/(.*)',
];

/** @type {import('next').NextConfig} */
module.exports = {
    reactStrictMode: true,

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

    async headers() {
        return [
            { source: '/:path*', headers: SECURITY_HEADERS },
            ...NO_CACHE_SOURCES.map((source) => ({ source, headers: NO_CACHE })),
        ];
    },

};
