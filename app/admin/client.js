'use client';

import { useEffect, useState } from 'react';

/*
 * /admin — the administrator's shelf.
 *
 * THE GATE HERE IS NOT THE SECURITY. What makes this page safe is that the
 * document lives behind /api/admin/band-plan, which asks the database who is
 * calling before it hands over a byte. Everything below is only about showing
 * the right thing to a human: a signed-out visitor gets a sign-in prompt rather
 * than a broken frame, and a signed-in non-admin gets a plain "no" rather than
 * a spinner that never resolves. Someone who defeats this component still gets
 * a 403 from the route.
 *
 * The document is rendered into an iframe via srcDoc rather than
 * dangerouslySetInnerHTML. It is a complete standalone page with its own
 * <style> block — dropping that into this DOM would let its rules (body
 * background, :root tokens, table styles) escape and repaint the whole site.
 * An iframe gives it the isolated document it was written for, and `sandbox`
 * without allow-same-origin keeps it from reaching back into the parent.
 */

/** The access token, from wherever the session keeper last wrote it. */
function authToken() {
    for (const key of ['jv_auth', 'jubileeVerseAuth']) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const t = (JSON.parse(raw) || {}).token;
            if (t) return t;
        } catch (e) { /* malformed entry — try the other key */ }
    }
    return null;
}

const DOCS = [
    {
        id: 'band-plan',
        title: 'HM Band Reallocation',
        blurb: 'All 105 stations mapped onto the five-fold blocks, with the flagship pinned at 308.70.',
        href: '/api/admin/band-plan',
    },
];

export default function AdminClient() {
    const [state, setState] = useState('checking');   // checking | anon | denied | ready | error
    const [html, setHtml] = useState('');
    const [open, setOpen] = useState(DOCS[0].id);

    useEffect(() => {
        const token = authToken();
        if (!token) { setState('anon'); return; }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(DOCS.find(d => d.id === open).href, {
                    headers: { Authorization: 'Bearer ' + token },
                    cache: 'no-store',
                });
                if (cancelled) return;
                if (res.status === 403) { setState('denied'); return; }
                if (!res.ok) { setState('error'); return; }
                setHtml(await res.text());
                setState('ready');
            } catch (e) {
                if (!cancelled) setState('error');
            }
        })();
        return () => { cancelled = true; };
    }, [open]);

    const doc = DOCS.find(d => d.id === open);

    return (
        <main className="adm">
            <link rel="stylesheet" href="/css/pages/admin.css" precedence="kj-page" />

            <header className="adm-head">
                <div>
                    <p className="adm-eyebrow">Administration</p>
                    <h1 className="adm-title">Station documents</h1>
                </div>
                <a className="adm-back" href="/">Back to the dial</a>
            </header>

            <nav className="adm-tabs" aria-label="Documents">
                {DOCS.map(d => (
                    <button
                        key={d.id}
                        type="button"
                        className={'adm-tab' + (d.id === open ? ' is-open' : '')}
                        aria-current={d.id === open ? 'page' : undefined}
                        onClick={() => { setState('checking'); setOpen(d.id); }}
                    >
                        <span className="adm-tab-name">{d.title}</span>
                        <span className="adm-tab-blurb">{d.blurb}</span>
                    </button>
                ))}
            </nav>

            {state === 'checking' && <p className="adm-note">Checking your access…</p>}

            {state === 'anon' && (
                <div className="adm-note adm-note--stop">
                    <strong>You are not signed in.</strong>
                    <p>These documents are for administrators. <a href="/signin">Sign in</a> and come back.</p>
                </div>
            )}

            {state === 'denied' && (
                <div className="adm-note adm-note--stop">
                    <strong>Your account does not have administrator rights.</strong>
                    <p>If that is wrong, ask an administrator to set your role.</p>
                </div>
            )}

            {state === 'error' && (
                <div className="adm-note adm-note--stop">
                    <strong>That document could not be loaded.</strong>
                    <p>The server did not return it. Try again, and if it keeps happening the route or the
                       database is the place to look.</p>
                </div>
            )}

            {state === 'ready' && (
                <iframe
                    className="adm-doc"
                    title={doc.title}
                    srcDoc={html}
                    sandbox=""
                />
            )}
        </main>
    );
}
