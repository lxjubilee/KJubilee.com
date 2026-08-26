'use client';

/* ─────────────────────────────────────────────────────────────────────────
   The stored session, read and written in one place.

   The site keeps the same session under TWO localStorage keys, because the
   pages that read it were written at different times: `jubileeVerseAuth` on
   radio and music, `jv_auth` on the home page. Every writer therefore has to
   write both, and until now every writer had its own copy of that rule —
   storeAuth in the Jubilee ID door, writeAuth in the session keeper. A third
   copy in the settings screen is where a pair of keys starts drifting apart.

   ── The event ──
   `storage` fires in OTHER tabs, never in the one that wrote. So a name changed
   on /account updates the header everywhere except the window the person is
   looking at — the one place they will check. AUTH_EVENT is the same
   notification for the tab that made the change.
   ───────────────────────────────────────────────────────────────────────── */

const KEYS = ['jv_auth', 'jubileeVerseAuth'];

/** Both keys carry one session, in the two shapes the site already reads. */
export const AUTH_EVENT = 'kj-auth-changed';

export function readAuth() {
    for (const k of KEYS) {
        try {
            const raw = localStorage.getItem(k);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed && parsed.token) return parsed;
        } catch { /* unreadable — try the other key */ }
    }
    return null;
}

export function authToken() {
    const auth = readAuth();
    return auth ? auth.token : null;
}

function announce() {
    try { window.dispatchEvent(new CustomEvent(AUTH_EVENT)); } catch { /* pre-hydration */ }
}

export function writeAuth(next) {
    try {
        localStorage.setItem('jv_auth', JSON.stringify({
            token: next.token, user: next.user, ts: Date.now(),
            expiresAt: next.expiresAt, refreshToken: next.refreshToken,
        }));
        localStorage.setItem('jubileeVerseAuth', JSON.stringify({
            authenticated: true, token: next.token, user: next.user,
            expiresAt: next.expiresAt, refreshToken: next.refreshToken,
        }));
    } catch (e) {
        // Private mode with storage blocked. The session still works for this
        // page load; do not fail what the person just did over where it is kept.
        console.warn('[session] could not store the session:', e && e.message);
    }
    announce();
}

/**
 * Merge into what is already stored — a new name, or a new token pair — without
 * the caller having to know the rest of the session to avoid erasing it.
 */
export function patchAuth(patch) {
    const current = readAuth();
    if (!current) return null;
    const next = {
        token: patch.token || current.token,
        refreshToken: patch.refreshToken || current.refreshToken,
        expiresAt: patch.expiresAt || current.expiresAt,
        user: patch.user ? { ...current.user, ...patch.user } : current.user,
    };
    writeAuth(next);
    return next;
}

export function clearAuth() {
    for (const k of KEYS) { try { localStorage.removeItem(k); } catch { /* nothing to do */ } }
    announce();
}
