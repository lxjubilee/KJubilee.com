// Which origins may call this API from a browser.
//
// Edge-safe on purpose: middleware.js runs on the Edge runtime, so nothing here
// may touch node: builtins.
//
// ── Why this replaced `origin: true` ────────────────────────────────────
//
// The Express stack ran `cors({ origin: true, credentials: true })`, which
// REFLECTS whatever Origin asked and pairs it with
// Access-Control-Allow-Credentials: true. That is the textbook CORS
// misconfiguration: it says "any website may make credentialed cross-origin
// calls to this API and read the replies".
//
// It mattered less while every call was same-origin from the page itself. It
// stops being survivable the moment the auth API answers on its own host,
// because then cross-origin IS the normal case and the header is load-bearing.
// An allowlist is the only version of this that means anything.
//
// Kept deliberately close to the Jubilee ID authority's own rule
// (JubileeSSO server.js), so the family agrees on who is family.

// Exact origins, comma-separated. Use for anything the patterns below miss —
// a preview deploy, a partner, a native app's dev proxy.
const EXTRA = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// kjubilee.com and any subdomain of it, plus the rest of the family.
const FAMILY = /^https?:\/\/([a-z0-9-]+\.)*(kjubilee|jubileeinspire|jubileeverse|jubileeintelligence|torahsings|jubilujah)\.com$/i;

// Development. Any port, and 127.0.0.1 as well as the name, because a browser
// treats them as different origins.
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export function isAllowedOrigin(origin) {
    if (!origin) return false;
    if (EXTRA.includes(origin)) return true;
    return FAMILY.test(origin) || LOCAL.test(origin);
}

/**
 * CORS headers for a request.
 *
 * A request with no Origin (same-origin navigation, curl, server-to-server) gets
 * none, which is correct — CORS only governs browsers, and adding the headers
 * there would say nothing.
 *
 * An Origin that is NOT on the list also gets none. The browser then refuses to
 * hand the response to that page, which is the whole mechanism working.
 */
export function corsHeaders(request) {
    const origin = request.headers.get('origin');
    if (!origin || !isAllowedOrigin(origin)) return {};
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        // The reply differs per Origin, so it must never be cached as if it did not.
        Vary: 'Origin',
    };
}
