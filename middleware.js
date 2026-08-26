import { NextResponse } from 'next/server';
import { corsHeaders } from './lib/cors';

// ─────────────────────────────────────────────────────────────────────────
// What app.use(cors(...)) and app.use(rateLimit(...)) did in server.js.
//
// Deliberately self-contained: middleware runs on the Edge runtime, where
// node:path and friends are unavailable, so this cannot import lib/api.js.
// ─────────────────────────────────────────────────────────────────────────

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const MAX = parseInt(process.env.RATE_LIMIT_MAX || '300', 10);

// Per-process, exactly like express-rate-limit's default MemoryStore. A
// multi-instance deploy needs a shared store here, same as it did before.
const hits = new Map();

function clientIp(request) {
    // trust proxy 1 — the assumption server.js makes.
    const xff = request.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
    return request.headers.get('x-real-ip') || 'unknown';
}

function rateLimit(request) {
    const now = Date.now();
    const key = clientIp(request);
    let entry = hits.get(key);
    if (!entry || now > entry.reset) {
        entry = { count: 0, reset: now + WINDOW_MS };
        hits.set(key, entry);
    }
    entry.count += 1;

    if (hits.size > 10_000) {
        for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    }

    const resetIn = Math.ceil((entry.reset - now) / 1000);
    return {
        limited: entry.count > MAX,
        headers: {
            'RateLimit-Limit': String(MAX),
            'RateLimit-Remaining': String(Math.max(0, MAX - entry.count)),
            'RateLimit-Reset': String(resetIn),
        },
        resetIn,
    };
}

// ─────────────────────────────────────────────────────────────────────────
// FREQUENCY URLS — kjubilee.com/hm308.70 tunes the dial to HM 308.70.
//
// The whole conceit of this site is that a station has a frequency rather
// than a slug, so the frequency has to be a thing you can type, print, or say
// out loud on air. /hm308.70 is that address.
//
// Deliberately liberal about the shape: case is ignored (HM308.70, hm308.70),
// the separator may be a dot or a dash, and a single decimal is accepted and
// padded — somebody reading "HM 308.7" off a card should not land on a 404
// because the catalogue writes it 308.70.
//
// It does NOT validate the frequency against the catalogue. That list lives in
// stations-data.js, which is a browser script this Edge runtime cannot load,
// and duplicating 105 numbers here would guarantee the two drift. The dial
// resolves it instead, against the same data every other page reads, and says
// so plainly when a frequency is assigned but not yet on air.
// ─────────────────────────────────────────────────────────────────────────
const FREQ_URL = /^\/hm[\s._-]?(\d{3})(?:[.,](\d{1,2}))?\/?$/i;

function frequencyRedirect(request) {
    const m = FREQ_URL.exec(request.nextUrl.pathname);
    if (!m) return null;
    // Pad a single decimal so 308.7 and 308.70 are the same address, and keep
    // the two-decimal form the catalogue itself uses.
    const hm = m[1] + '.' + (m[2] ? m[2].padEnd(2, '0') : '00');
    const url = request.nextUrl.clone();
    url.pathname = '/player';
    url.search = '';
    url.searchParams.set('hm', hm);
    // 307, not 308: these are shared by hand and read by people, and a
    // permanent redirect cached in a browser would outlive any change to
    // where the dial lives.
    return NextResponse.redirect(url, 307);
}

export function middleware(request) {
    // Before the rate limiter: a frequency link is a person arriving, not an
    // API call, and it should not spend anybody's budget to be pointed at the
    // page it was always going to reach.
    const freq = frequencyRedirect(request);
    if (freq) return freq;

    const cors = corsHeaders(request);

    // Preflight — answered here rather than reaching a route handler.
    if (request.method === 'OPTIONS') {
        // No allowed-origin headers means the caller is not on the list. The
        // browser would block the real request anyway; refusing here says so
        // in the access log instead of leaving a silent 204 behind.
        if (request.headers.get('origin') && !cors['Access-Control-Allow-Origin']) {
            return new NextResponse(null, { status: 403 });
        }
        return new NextResponse(null, {
            status: 204,
            headers: {
                ...cors,
                'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
                'Access-Control-Allow-Headers':
                    request.headers.get('access-control-request-headers') || 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    const { limited, headers: rl, resetIn } = rateLimit(request);
    if (limited) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { ...cors, ...rl, 'Retry-After': String(resetIn) } },
        );
    }

    const res = NextResponse.next();
    for (const [k, v] of Object.entries({ ...cors, ...rl })) res.headers.set(k, v);
    return res;
}

export const config = {
    // Everything the Express stack covered, minus Next's own build output and
    // the CDN route — audio is byte-range streamed and must not be counted
    // against a limiter sized for API calls.
    matcher: ['/((?!_next/static|_next/image|cdn/|favicon.ico).*)'],
};
