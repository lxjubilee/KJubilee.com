'use strict';

// ─────────────────────────────────────────────────────────────────────────
// Helpers for the Next route handlers.
//
// Express gave us res.json(), res.status() and a middleware stack for free.
// Route handlers get a Web Response instead, so the small amount of glue that
// used to be middleware lives here — kept deliberately thin so the ported
// handlers read like the Express originals they came from.
// ─────────────────────────────────────────────────────────────────────────

const path = require('path');

const CDN_LOCAL_ROOT = process.env.CDN_LOCAL_ROOT
    || path.join(process.cwd(), '..', 'cdn.kjubilee.com');

// res.json(x) / res.status(n).json(x)
function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
    });
}

// The /api/time contract (streaming-services.md §4.3): a revalidated cached
// time is still a stale time, so this is no-store, not no-cache.
const NO_STORE = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
};

// trust proxy 1 — same assumption server.js makes.
function clientIp(request) {
    const xff = request.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
    return request.headers.get('x-real-ip') || 'unknown';
}

// Stands in for express-rate-limit. Same default MemoryStore semantics: state
// is per-process, so a multi-instance deploy needs a shared store here just as
// it did before. Kept on globalThis so dev hot-reload does not reset the window.
function createRateLimiter({ windowMs, max, message }) {
    const store = new Map();
    return function limit(request) {
        const now = Date.now();
        const key = clientIp(request);
        let entry = store.get(key);
        if (!entry || now > entry.reset) {
            entry = { count: 0, reset: now + windowMs };
            store.set(key, entry);
        }
        entry.count += 1;

        // Bound the store the way the Map in request-day is bounded.
        if (store.size > 10_000) {
            for (const [k, v] of store) if (now > v.reset) store.delete(k);
        }

        const remaining = Math.max(0, max - entry.count);
        const headers = {
            'RateLimit-Limit': String(max),
            'RateLimit-Remaining': String(remaining),
            'RateLimit-Reset': String(Math.ceil((entry.reset - now) / 1000)),
        };
        if (entry.count > max) {
            return json(message || { error: 'Too many requests' }, 429, {
                ...headers,
                'Retry-After': String(Math.ceil((entry.reset - now) / 1000)),
            });
        }
        return null;
    };
}

// Password endpoints get their own budget. The global limiter is sized for a
// player fetching schedules, which is far too generous for guessing a password.
const globalForLimiters = globalThis;
const ssoAuthLimiter = globalForLimiters.__kjSsoAuthLimiter || createRateLimiter({
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min
    max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX || '30', 10),
    message: { success: false, error: 'Too many attempts. Please wait a few minutes and try again.' },
});
globalForLimiters.__kjSsoAuthLimiter = ssoAuthLimiter;

// req.body — Express's express.json() with a 1mb limit, made explicit. Returns
// {} for an absent or malformed body, matching the `req.body || {}` the ported
// handlers all guard with.
async function readJson(request) {
    try {
        const text = await request.text();
        if (!text) return {};
        if (text.length > 1_048_576) return {};
        return JSON.parse(text);
    } catch { return {}; }
}

module.exports = { json, NO_STORE, clientIp, createRateLimiter, ssoAuthLimiter, readJson, CDN_LOCAL_ROOT };
