'use client';

/* ─────────────────────────────────────────────────────────────────────────
   The one control in the header that knows whether anyone is signed in.

   The header used to be a hardcoded "Sign In" anchor, so it said Sign In
   whether or not you already were — the door worked, the page just never
   admitted it. This reads the session the door stores and shows the person's
   name instead, with a way back out.

   ── Why it renders "Sign In" first, every time ──
   localStorage does not exist on the server, so the markup React sends and the
   markup it first builds in the browser have to agree on something. They agree
   on the signed-out state, and the name appears in an effect immediately after.
   Reading storage during render instead would be a hydration mismatch, and
   React would throw away the whole tree and re-render it — a visible flash on
   every page, to save one frame here.

   The session lives in localStorage under two keys because the rest of the
   site already reads it there (`jubileeVerseAuth` on radio and music,
   `jv_auth` on the home page). This writes neither — it only reads and, on
   sign-out, clears both.
   ───────────────────────────────────────────────────────────────────────── */

import { useState, useEffect, useRef } from 'react';
import { AUTH_EVENT } from './_session-store';

function readSession() {
    try {
        const raw = localStorage.getItem('jv_auth') || localStorage.getItem('jubileeVerseAuth');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const user = parsed && parsed.user;
        if (!user || !user.email) return null;

        // A token past its expiry is not a session. Treating it as one means the
        // header greets someone whose next API call will 401.
        const expires = parsed.expiresAt ? Date.parse(parsed.expiresAt) : NaN;
        if (!Number.isNaN(expires) && expires <= Date.now()) return null;

        return user;
    } catch {
        return null; // private mode, or something else wrote nonsense to the key
    }
}

function clearSession() {
    for (const k of ['jv_auth', 'jubileeVerseAuth']) {
        try { localStorage.removeItem(k); } catch { /* nothing we can do */ }
    }
}

// "Ezra Kade" -> "Ezra"; falls back to the part of the address before the @, so
// there is always something to show.
function shortName(user) {
    const first = (user.first_name || '').trim();
    if (first) return first;
    const name = (user.name || '').trim();
    if (name) return name.split(/\s+/)[0];
    return (user.email || '').split('@')[0];
}

// The whole name, for the menu. The button has room for one word; the panel
// under it has room for the person's actual name, and that is the thing worth
// showing before "Profile settings" and "Sign out".
//
// Built from the parts first: `name` is a mirror of them (lib/local-account.js
// writes first + last into it), so an account whose parts are set and whose
// mirror is stale should be read from the parts. Never falls through to the
// address — the address is already on the line beneath, and printing it twice
// says nothing.
function fullName(user) {
    const joined = [user.first_name, user.last_name]
        .map((p) => (p || '').trim()).filter(Boolean).join(' ');
    if (joined) return joined;
    const name = (user.name || '').trim();
    if (name) return name.replace(/\s+/g, ' ');
    return shortName(user);
}

export default function AccountButton() {
    const [user, setUser] = useState(null);
    const [open, setOpen] = useState(false);
    const boxRef = useRef(null);

    useEffect(() => {
        setUser(readSession());

        // Signing in or out in another tab should not leave this one lying.
        const onStorage = (e) => {
            if (!e.key || e.key === 'jv_auth' || e.key === 'jubileeVerseAuth') setUser(readSession());
        };
        // `storage` fires in every tab EXCEPT the one that wrote, so a name
        // changed on /account would update the header everywhere but the window
        // the person is looking at. This is that window's notification.
        const onLocal = () => setUser(readSession());
        window.addEventListener('storage', onStorage);
        window.addEventListener(AUTH_EVENT, onLocal);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener(AUTH_EVENT, onLocal);
        };
    }, []);

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    async function signOut() {
        // Clearing localStorage only ever removed the copy in front of us; the
        // token itself stayed valid for its whole life in anyone else's hands.
        // This is the half that actually ends the session, and it is why there
        // is a session table at all.
        try {
            const raw = localStorage.getItem('jv_auth') || localStorage.getItem('jubileeVerseAuth');
            const refreshToken = raw ? (JSON.parse(raw) || {}).refreshToken : null;
            if (refreshToken) {
                await fetch('/api/auth/signout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken }),
                });
            }
        } catch {
            // Offline, or the token was already gone. Sign out locally anyway —
            // refusing to would strand someone signed in on a shared machine.
        }
        clearSession();
        setUser(null);
        setOpen(false);
        // A full load, not a router push: the page scripts cached a token when
        // they started and have no way to be told it is gone.
        window.location.href = '/';
    }

    // React 19 hoists and dedupes this, so five headers asking for it load it once.
    const styles = <link rel="stylesheet" href="/css/account.css" precedence="kj-page" />;

    if (!user) {
        return (
            <>
                {styles}
                <a className="btn-outline" href="/login">Sign In</a>
            </>
        );
    }

    return (
        <div className="kj-account" ref={boxRef}>
            {styles}
            <button
                type="button"
                className="btn-outline kj-account-trigger"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                title={user.email}
            >
                <span className="kj-account-initial" aria-hidden="true">
                    {shortName(user).charAt(0).toUpperCase()}
                </span>
                <span className="kj-account-name">{shortName(user)}</span>
            </button>

            {open && (
                <div className="kj-account-menu" role="menu">
                    {/* The name says WHO, the address says WHICH ACCOUNT — two
                        different questions, and someone with a work address and
                        a home one needs the second answered before they act. */}
                    <div className="kj-account-who">
                        <div className="kj-account-fullname">{fullName(user)}</div>
                        <div className="kj-account-email" title={user.email}>{user.email}</div>
                    </div>
                    <a className="kj-account-item" role="menuitem" href="/account">Profile settings</a>
                    <button type="button" role="menuitem" onClick={signOut}>Sign out</button>
                </div>
            )}
        </div>
    );
}
