'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, num, ago, when, ApiError } from './_api';

/*
 * The listener inbox.
 *
 * THREE THINGS ARRIVE HERE AND THEY ARE NOT THE SAME KIND OF THING:
 *
 *   feedback  — a listener pressed a button or typed a comment on a segment.
 *   voicemail — a listener recorded audio; the file is sitting in the queue.
 *   request   — a player asked the CDN for a day file that did not exist.
 *
 * The third is not listener feedback at all. It is a hole in the programming
 * that a real listener walked into, which is why it is styled as a problem
 * rather than a message and is not mixed into the comment count.
 *
 * READ-ONLY. The CDN tree is append-only by design so the record of what
 * listeners said cannot be quietly edited; the route offers no DELETE and this
 * screen offers no button for one.
 */

const KINDS = [
    { id: 'all', label: 'Everything' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'voicemail', label: 'Voicemail' },
    { id: 'requests', label: 'Missing day files' },
];

const WINDOWS = [
    { id: 7, label: 'Last 7 days' },
    { id: 30, label: 'Last 30 days' },
    { id: 90, label: 'Last 90 days' },
];

/* A request is not feedback, so it does not get feedback's colour. Red matches
   the rail on its card and says the same thing the card does: this one is a
   hole in the programming, not a message from a listener. */
const KIND_TONE = { feedback: 'indigo', voicemail: 'violet', request: 'red' };

function KindTag({ kind }) {
    const label = kind === 'request' ? 'missing day file' : kind;
    return <span className={'adm-badge adm-tone-' + (KIND_TONE[kind] || 'neutral')}>{label}</span>;
}

function Item({ item }) {
    return (
        <li className={'adm-item adm-item--' + item.kind}>
            <div className="adm-item-head">
                <KindTag kind={item.kind} />
                <span className="adm-item-station">
                    {item.station_name || item.station_id || 'unknown station'}
                    {item.station_id && <code>{item.station_id}</code>}
                </span>
                <span className="adm-item-when" title={when(item.at)}>{ago(item.at)}</span>
            </div>

            {item.kind === 'feedback' && (
                <div className="adm-item-body">
                    {item.comment
                        ? <blockquote className="adm-quote">{item.comment}</blockquote>
                        : <span className="adm-cell-dim">{item.event_type || 'event'}</span>}
                    <span className="adm-cell-dim adm-cell-dim--faint">
                        {item.event_type}
                        {item.segment_type ? ' · ' + item.segment_type : ''}
                        {item.segment_id ? ' · ' + item.segment_id : ''}
                        {' · '}{item.signed_in ? 'signed in' : 'anonymous'}
                    </span>
                </div>
            )}

            {item.kind === 'voicemail' && (
                <div className="adm-item-body">
                    <span className="adm-cell-dim">
                        {item.duration_s ? item.duration_s + 's recording' : 'recording'}
                        {item.bytes ? ' · ' + Math.round(item.bytes / 1024) + ' KB' : ''}
                        {' · '}{item.signed_in ? 'signed in' : 'anonymous'}
                    </span>
                    {/* The file, not a player. Streaming listener audio through
                        the panel needs its own gated route; until that exists the
                        path is how an operator finds it on the box. */}
                    <span className="adm-cell-dim adm-cell-dim--faint">
                        <code>radio/_voicemail/{item.station_id}/pending/{item.audio_file || item.id}</code>
                    </span>
                </div>
            )}

            {item.kind === 'request' && (
                <div className="adm-item-body">
                    <span className="adm-cell-dim">
                        A player asked for day file <code>{item.missing_date}</code> and it was not there.
                    </span>
                    <span className="adm-cell-dim adm-cell-dim--faint">
                        Build and publish that station&rsquo;s schedule, then re-check the delivery tree.
                    </span>
                </div>
            )}
        </li>
    );
}

export default function Feedback() {
    const [data, setData] = useState(null);
    const [state, setState] = useState('loading');
    const [error, setError] = useState(null);
    const [kind, setKind] = useState('all');
    const [days, setDays] = useState(7);
    const [commentsOnly, setCommentsOnly] = useState(false);

    const load = useCallback(async () => {
        setState('loading');
        try {
            const params = new URLSearchParams({ kind, days: String(days) });
            if (commentsOnly) params.set('comments', '1');
            setData(await api('/api/admin/feedback?' + params));
            setState('ready');
        } catch (e) {
            setError(e instanceof ApiError && e.status === 403
                ? 'Your account no longer has administrator rights.'
                : (e.message || 'The inbox could not be read.'));
            setState('error');
        }
    }, [kind, days, commentsOnly]);

    useEffect(() => { load(); }, [load]);

    if (state === 'error') {
        return (
            <div className="adm-content">
                <div className="adm-notice adm-notice--stop">
                    <strong>{error}</strong>
                    <p>
                        The inbox reads the CDN tree at <code>radio/_feedback</code>, <code>radio/_requests</code> and{' '}
                        <code>radio/_voicemail</code>. If those are on another volume, <code>CDN_LOCAL_ROOT</code> is
                        what points this server at them.
                    </p>
                </div>
            </div>
        );
    }

    const items = data?.items || [];

    return (
        <div className="adm-content">
            <div className="adm-toolbar">
                <select className="adm-select" value={kind} onChange={e => setKind(e.target.value)}>
                    {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
                <select className="adm-select" value={days}
                        onChange={e => setDays(Number(e.target.value))}>
                    {WINDOWS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                </select>
                <label className="adm-check">
                    <input type="checkbox" checked={commentsOnly}
                           onChange={e => setCommentsOnly(e.target.checked)}
                           disabled={kind === 'voicemail' || kind === 'requests'} />
                    Typed comments only
                </label>
                <span className="adm-count">
                    {state === 'loading' ? 'Reading…' : num(data?.matched ?? 0) + ' in window'}
                </span>
                <button type="button" className="adm-btn" onClick={load} disabled={state === 'loading'}>
                    Refresh
                </button>
            </div>

            {data?.truncated && (
                <p className="adm-fine">
                    {num(data.matched)} records matched; the newest {num(items.length)} are shown.
                    Narrow the kind or the window to see further back.
                </p>
            )}

            {state === 'loading' && (
                <div className="adm-state"><span className="adm-spinner" />Reading the inbox…</div>
            )}

            {state === 'ready' && !items.length && (
                <div className="adm-notice">
                    <strong>Nothing in this window.</strong>
                    <p>
                        No listener has pressed a button, recorded a message or hit a missing day file
                        in the last {days} days — or nothing has been written to the CDN tree yet.
                    </p>
                </div>
            )}

            <ul className="adm-items">
                {items.map((it, i) => <Item key={(it.id || it.station_id || 'x') + '-' + i} item={it} />)}
            </ul>
        </div>
    );
}
