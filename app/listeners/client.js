'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PlainHeader from '../_plain-header';

/*
 * THE LIVE AUDIENCE, ONE THIN ROW EACH.
 *
 * ══ IT POLLS, AND THE INTERVAL IS NOT ARBITRARY ══
 *
 * A listener's row expires 62 seconds after their last heartbeat, and they beat
 * every 20. Refreshing every 10 seconds means a row appears within one beat of
 * somebody tuning in and disappears within one sweep of them leaving, without
 * asking the server anything it does not already have in memory. Faster would
 * show the same Map again; slower would let the page claim an audience that had
 * gone home.
 *
 * ══ WHAT IT CANNOT SHOW, AND SAYS SO ══
 *
 * Location comes from Cloudflare's own headers on the request, which means it
 * is as precise as the plan allows and no more — city on Business and above,
 * country on Free. The page prints what arrived rather than implying a
 * precision nobody sent, and the empty state explains the difference instead of
 * leaving a column of dashes to be read as a bug.
 *
 * ══ WHEN THE AUDIENCE IS A DRILL, THE PAGE SAYS SO ══
 *
 * With STRESS_TEST_LISTENERS on, /api/admin/listeners appends a hundred-odd
 * fictional rows from data/stress-listeners so the grid can be practised
 * against at a size it never reaches on a quiet Tuesday
 * (setup/radio-stress-testing.md). Those rows are marked, and the banner above
 * the grid is not optional and has no switch of its own.
 *
 * That is deliberate. The drill is realistic because the grid is FULL, not
 * because the page is lying about what is in it: a screenshot of this page can
 * end up in a report, and an operator who cannot tell a fixture from an
 * audience will eventually quote one as the other. Everything needed to tell
 * them apart is on screen — the banner, the `sim` tag, and the simulated tally
 * beside the real one.
 *
 * ══ THE DEVICE COLUMN IS ONLY EVER POPULATED BY A FIXTURE ══
 *
 * lib/presence.js does not ask a browser what it is running on, because a
 * browser that could state its own platform could state any. So a real row's
 * Device cell is always a dash, and a filled one is itself proof the row came
 * from the fixture. The column exists because the device mix — 40% iPhone — is
 * one of the things the drill is there to exercise.
 */

const REFRESH_MS = 10_000;
const AUTH_KEYS = ['jv_auth', 'jubileeVerseAuth'];

/* The same pair every other reader on this site uses — app/_session-store.js is
   the authority. Reading either is enough. */
function token() {
    for (const key of AUTH_KEYS) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed?.token) return parsed.token;
        } catch { /* unreadable — try the other */ }
    }
    return null;
}

function duration(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
}

/* An IPv6 address is 39 characters and would set the column width for everyone.
   The full value stays in the title, so it is one hover away and still
   copyable from the tooltip. */
function shortIp(ip) {
    if (!ip) return '—';
    if (ip.length <= 24) return ip;
    return ip.slice(0, 12) + '…' + ip.slice(-8);
}

function place(geo) {
    if (!geo) return null;
    const parts = [geo.city, geo.region, geo.country].filter(Boolean);
    if (!parts.length) return null;
    // City and region are frequently the same word — "Singapore, Singapore".
    return parts.filter((p, i) => parts.indexOf(p) === i).join(', ');
}

export default function ListenersClient() {
    const [state, setState] = useState('loading');   // loading | anon | denied | ok | error
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const timer = useRef(null);

    const load = useCallback(async () => {
        const t = token();
        if (!t) { setState('anon'); return; }

        try {
            const r = await fetch('/api/admin/listeners', {
                headers: { Authorization: 'Bearer ' + t },
                cache: 'no-store',
            });
            /* 401 IS A DEAD TOKEN AND 403 IS THE WRONG ROLE, and they need
               different sentences. Collapsing them into "no access" sends
               somebody whose session simply expired off to ask for permission
               they already have. */
            if (r.status === 401) { setState('anon'); return; }
            if (r.status === 403) { setState('denied'); return; }
            if (!r.ok) throw new Error('HTTP ' + r.status);
            setData(await r.json());
            setState('ok');
        } catch (e) {
            setError(String(e.message || e));
            setState((s) => (s === 'ok' ? 'ok' : 'error'));   // keep the last good grid
        }
    }, []);

    useEffect(() => {
        load();
        timer.current = setInterval(load, REFRESH_MS);
        return () => clearInterval(timer.current);
    }, [load]);

    const listeners = data?.listeners || [];

    return (
        <>
            <link rel="stylesheet" href="/css/pages/listeners.css" precedence="kj-page" />
            <PlainHeader back="/player" backLabel="← Back to the dial" />

            <main className="lsn">
                <header className="lsn-head">
                    <div>
                        <h1>Listeners</h1>
                        <p className="lsn-sub">
                            Everyone tuned to the dial right now. A row disappears about a
                            minute after its browser stops answering.
                        </p>
                    </div>

                    {state === 'ok' && (
                        <div className="lsn-tallies">
                            <div className="t"><b>{data.total}</b><span>on the dial</span></div>
                            <div className="t"><b>{data.playing}</b><span>playing</span></div>
                            <div className="t"><b>{data.signedIn}</b><span>signed in</span></div>
                            {data.simulated > 0 && (
                                <div className="t sim" title="Rows generated by the stress fixture">
                                    <b>{data.simulated}</b><span>simulated</span>
                                </div>
                            )}
                            <div className="t"><b>{data.stations.length}</b><span>stations</span></div>
                        </div>
                    )}
                </header>

                {/* NOT BEHIND A SWITCH. See the note at the top of this file. */}
                {state === 'ok' && data.stress?.active && (
                    <div className="lsn-drill">
                        <b>Simulated audience</b>
                        <span>
                            {data.simulated} of these {data.total} rows are a stress fixture —
                            hour {String(data.stress.hour).padStart(2, '0')} UTC
                            {data.stress.pinned ? ' (pinned)' : ''}, {data.stress.suitableFor} mix,
                            energy {data.stress.energy} ({data.stress.energyLabel}), part{' '}
                            {data.stress.segment} of {data.stress.segments}. Next change in{' '}
                            {data.stress.nextChangeMin} min.
                            {data.stress.publicCount
                                ? ' They are also counted on the public dial.'
                                : ' They are not counted on the public dial.'}
                        </span>
                        <code>STRESS_TEST_LISTENERS=false</code>
                    </div>
                )}

                {state === 'loading' && <p className="lsn-note">Reading the dial…</p>}

                {state === 'anon' && (
                    <div className="lsn-panel">
                        <h2>Sign in to see this</h2>
                        <p>
                            This page shows individual listeners, so it asks who you are.
                        </p>
                        <a className="lsn-btn" href={'/signin?redirect=' + encodeURIComponent('/listeners')}>
                            Sign in
                        </a>
                    </div>
                )}

                {state === 'denied' && (
                    <div className="lsn-panel">
                        <h2>This one is for station staff</h2>
                        <p>
                            Who is listening, and from where, is kept to the people who run
                            the network. If you need it, an administrator can grant your
                            role the <b>Listeners</b> section in Roles &amp; permissions.
                        </p>
                        <a className="lsn-btn" href="/player">Back to the dial</a>
                    </div>
                )}

                {state === 'error' && (
                    <div className="lsn-panel">
                        <h2>Could not read the dial</h2>
                        <p className="lsn-err">{error}</p>
                    </div>
                )}

                {state === 'ok' && listeners.length === 0 && (
                    <div className="lsn-panel">
                        <h2>Nobody is listening</h2>
                        <p>
                            The dial is quiet. This page fills the moment a browser starts
                            beating — usually within twenty seconds of somebody pressing play.
                        </p>
                    </div>
                )}

                {state === 'ok' && listeners.length > 0 && (
                    <>
                        {/* The stations strip, so the shape of the audience is readable
                            before any individual row is. */}
                        <div className="lsn-strip">
                            {data.stations.map((s) => (
                                <span className="chip" key={s.station}>
                                    <b>{s.n}</b> {s.name}
                                    {s.hm ? <i>HM {s.hm}</i> : null}
                                </span>
                            ))}
                        </div>

                        <div className="lsn-gridwrap">
                            <table className="lsn-grid">
                                <thead>
                                    <tr>
                                        <th className="c-live" />
                                        <th className="c-who">Listener</th>
                                        <th className="c-stn">Station</th>
                                        <th className="c-hm">HM</th>
                                        <th className="c-loc">From</th>
                                        <th className="c-ip">Address</th>
                                        <th className="c-dev">Device</th>
                                        <th className="c-for">For</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {listeners.map((l) => {
                                        const where = place(l.geo);
                                        return (
                                            <tr key={l.session}>
                                                {/* Green is sound coming out; grey is tuned but
                                                    paused. Both are listeners — the dial counts
                                                    them the same — so this is a dot, not a
                                                    column of the word "paused". */}
                                                <td className="c-live">
                                                    <i className={l.playing ? 'dot on' : 'dot'}
                                                       title={l.playing ? 'Playing' : 'Tuned, paused'} />
                                                </td>
                                                <td className="c-who">
                                                    {l.user
                                                        ? <span className="who named" title={'Account #' + l.user.id}>
                                                              {l.user.email || ('#' + l.user.id)}
                                                          </span>
                                                        : <span className="who anon">Not signed in</span>}
                                                    {/* THE MARK LIVES HERE, not next to the
                                                        address, because the address column is
                                                        dropped below 820px and the Listener column
                                                        never is. A tag that disappears on a phone
                                                        is not a tag — it is a tag on a desktop. */}
                                                    {l.synthetic && (
                                                        <i className="sim" title="Stress fixture, not a real listener">sim</i>
                                                    )}
                                                </td>
                                                <td className="c-stn" title={l.station}>{l.stationName}</td>
                                                <td className="c-hm">{l.hm ? l.hm : '—'}</td>
                                                <td className={where ? 'c-loc' : 'c-loc dim'}>
                                                    {where || 'unknown'}
                                                </td>
                                                <td className="c-ip" title={l.ip || ''}>{shortIp(l.ip)}</td>
                                                <td className={l.device ? 'c-dev' : 'c-dev dim'}
                                                    title={l.agent || 'A real heartbeat does not report its platform'}>
                                                    {l.device || '—'}
                                                </td>
                                                <td className="c-for">{duration(l.sinceMs)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <p className="lsn-foot">
                            Live — refreshed every {REFRESH_MS / 1000} seconds. Nothing on this
                            page is stored: it is read from memory and every row expires{' '}
                            {Math.round((data.ttlMs || 62000) / 1000)} seconds after that
                            listener&rsquo;s browser last checked in. Location is whatever the
                            edge put on the address, which is a city on some connections and a
                            country on others. Device is blank for a real listener — a browser
                            that could state its own platform could state anything, so nothing
                            here asks it.
                            {data.stress?.active && (
                                <> Rows tagged <b>sim</b> are generated from{' '}
                                <code>data/stress-listeners</code> and are not people.</>
                            )}
                        </p>
                    </>
                )}
            </main>
        </>
    );
}
