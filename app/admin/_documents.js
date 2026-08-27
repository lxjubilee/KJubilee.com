'use client';

import { useEffect, useState } from 'react';
import { api } from './_api';

/*
 * Station documents — the original shelf, unchanged in what it does.
 *
 * The document is rendered into an iframe via srcDoc rather than
 * dangerouslySetInnerHTML. It is a complete standalone page with its own
 * <style> block — dropping that into this DOM would let its rules (body
 * background, :root tokens, table styles) escape and repaint the whole panel.
 * An iframe gives it the isolated document it was written for, and `sandbox`
 * without allow-same-origin keeps it from reaching back into the parent.
 *
 * The bytes still come from /api/admin/band-plan, which asks the database who
 * is calling before it hands over any of them. This component only decides what
 * a human sees; someone who defeats it still gets a 403 from the route.
 */

const DOCS = [
    {
        id: 'band-plan',
        title: 'HM Band Reallocation',
        blurb: 'All 105 stations mapped onto the five-fold blocks, with the flagship pinned at 308.70.',
        href: '/api/admin/band-plan',
    },
];

export default function Documents() {
    const [open, setOpen] = useState(DOCS[0].id);
    const [html, setHtml] = useState('');
    const [state, setState] = useState('loading');

    useEffect(() => {
        let cancelled = false;
        setState('loading');
        (async () => {
            try {
                const doc = DOCS.find(d => d.id === open);
                const text = await api(doc.href);
                if (!cancelled) { setHtml(text); setState('ready'); }
            } catch (e) {
                if (!cancelled) setState('error');
            }
        })();
        return () => { cancelled = true; };
    }, [open]);

    const doc = DOCS.find(d => d.id === open);

    return (
        <div className="adm-content">
            {/* A list rather than a strip: "HM Band Reallocation" alone does not
                tell anyone whether it is the document they want. */}
            <nav className="adm-docs" aria-label="Documents">
                {DOCS.map(d => (
                    <button
                        key={d.id}
                        type="button"
                        className={'adm-doc-card' + (d.id === open ? ' is-open' : '')}
                        aria-current={d.id === open ? 'true' : undefined}
                        onClick={() => setOpen(d.id)}
                    >
                        <span className="adm-doc-name">{d.title}</span>
                        <span className="adm-doc-blurb">{d.blurb}</span>
                    </button>
                ))}
            </nav>

            {state === 'loading' && (
                <div className="adm-state"><span className="adm-spinner" />Loading the document…</div>
            )}

            {state === 'error' && (
                <div className="adm-notice adm-notice--stop">
                    <strong>That document could not be loaded.</strong>
                    <p>The server did not return it. Try again, and if it keeps happening the route or the
                       database is the place to look.</p>
                </div>
            )}

            {state === 'ready' && (
                <iframe className="adm-doc" title={doc.title} srcDoc={html} sandbox="" />
            )}
        </div>
    );
}
