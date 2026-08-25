'use client';

/* ─────────────────────────────────────────────────────────────────────────
   Keeps the stored access token fresh.

   The access token is now ~15 minutes rather than 30 days, which is the whole
   point — a stolen one expires on its own. That only works if the browser
   quietly gets a new one before the old expires, and this is the thing that
   does it.

   ── Why keeping localStorage up to date is enough ──
   Nothing else on the site had to change for this. Every page script reads the
   token INSIDE the function that makes the request:

       home.js   function authToken()   { JSON.parse(localStorage.getItem('jv_auth')).token }
       radio.js  function getAuthData() { JSON.parse(localStorage.getItem('jubileeVerseAuth')) }
       music.js  the same

   None of them cache it at startup. So a component that keeps both keys
   current is invisible to all of them — they pick up the new token on their
   very next call, with no knowledge that anything happened.

   Mounted in the root layout, so it runs on every page and survives navigation
   along with the audio.
   ───────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef } from 'react';
import { apiUrl } from '@/lib/api-base';

const KEYS = ['jv_auth', 'jubileeVerseAuth'];

// Refresh this far ahead of expiry. Long enough that a request in flight at the
// moment of rotation still carries a valid token.
const SKEW_MS = 3 * 60 * 1000;

// The floor between checks. Cheap: it reads localStorage and usually stops there.
const TICK_MS = 60 * 1000;

function readAuth() {
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

// Both keys carry the same session in the two shapes the site already reads.
function writeAuth(next) {
    const jv = { token: next.token, user: next.user, ts: Date.now(), expiresAt: next.expiresAt, refreshToken: next.refreshToken };
    const jva = { authenticated: true, token: next.token, user: next.user, expiresAt: next.expiresAt, refreshToken: next.refreshToken };
    try {
        localStorage.setItem('jv_auth', JSON.stringify(jv));
        localStorage.setItem('jubileeVerseAuth', JSON.stringify(jva));
    } catch (e) {
        console.warn('[session] could not store the refreshed session:', e && e.message);
    }
}

function clearAuth() {
    for (const k of KEYS) { try { localStorage.removeItem(k); } catch { /* nothing to do */ } }
}

export default function SessionKeeper() {
    // Guards against two timers, two tabs' worth of effects, or a re-render
    // starting a second refresh while the first is still in flight.
    const inFlight = useRef(null);

    useEffect(() => {
        let alive = true;

        async function maybeRefresh() {
            const auth = readAuth();
            if (!auth || !auth.refreshToken) return;   // signed out, or a session from before this existed

            const expires = auth.expiresAt ? Date.parse(auth.expiresAt) : NaN;
            // No expiry recorded means a pre-split token: leave it alone and let
            // it run out rather than trading a working session for a guess.
            if (Number.isNaN(expires)) return;
            if (expires - Date.now() > SKEW_MS) return;

            if (inFlight.current) return inFlight.current;
            inFlight.current = (async () => {
                try {
                    const res = await fetch(apiUrl('/api/auth/refresh'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken: auth.refreshToken }),
                    });
                    const data = await res.json().catch(() => ({}));

                    if (res.ok && data.success && data.token) {
                        writeAuth({
                            token: data.token,
                            refreshToken: data.refreshToken || auth.refreshToken,
                            expiresAt: data.expiresAt,
                            user: auth.user,
                        });
                        return;
                    }

                    // 401 is the server saying this session is over — revoked,
                    // expired, or rotated away. Anything else is a hiccup worth
                    // retrying on the next tick rather than signing someone out over.
                    if (res.status === 401) {
                        console.warn('[session] the session has ended — clearing it');
                        clearAuth();
                    }
                } catch {
                    // Offline. The token is still valid for a few more minutes;
                    // the next tick tries again.
                } finally {
                    inFlight.current = null;
                }
            })();
            return inFlight.current;
        }

        maybeRefresh();
        const timer = setInterval(() => { if (alive) maybeRefresh(); }, TICK_MS);

        // A laptop that slept through the whole window comes back with an
        // expired token and no tick to have caught it.
        const onWake = () => { if (alive && document.visibilityState === 'visible') maybeRefresh(); };
        document.addEventListener('visibilitychange', onWake);
        window.addEventListener('focus', onWake);

        return () => {
            alive = false;
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onWake);
            window.removeEventListener('focus', onWake);
        };
    }, []);

    return null;
}
