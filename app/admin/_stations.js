'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, num, hours, ago, ApiError } from './_api';

/*
 * Stations & ratings — the dial, and the A/B/C promotion of songs on it.
 *
 * IT READS TWO ENDPOINTS THAT ALREADY EXIST AND ADDS NO THIRD.
 * /data/analytics-stations.json is the built index (public, and already in the
 * browser cache because /analytics uses it), and /api/radio/ratings is the
 * promotion store. An /api/admin/stations that joined them server-side would be
 * a third copy of the dial to keep in step with build-analytics-index.
 *
 * THE MANIFEST IS LOADED PER STATION, ON DEMAND, AND NEVER UP FRONT. One
 * station's music.json is ~1.3 MB; the 41 on air are over 50 MB. The table
 * renders from the index alone, and a station's tracks arrive only when
 * somebody opens it.
 *
 * C IS THE ABSENCE OF AN ENTRY, NOT A STORED VALUE — the store's own rule
 * (app/api/radio/ratings/route.js). Setting a song back to C here sends "C",
 * and the server deletes the row rather than writing one — which is why
 * demoting takes the same single click as promoting and needs no other call.
 */

const INDEX_URL = '/data/analytics-stations.json';
// Rendering 1,633 rows at once is a locked tab on a laptop. The filter box is
// the way to reach a specific song; this cap keeps the first paint honest and
// says so on screen rather than silently showing a slice.
const TRACK_CAP = 300;

/**
 * The three-way rating control for one song.
 *
 * Buttons, not a <select>: the point of this screen is moving through a list
 * promoting things, and a select costs two clicks and a popup per song.
 */
function RatingPicker({ value, onChange, disabled }) {
    return (
        <span className="adm-rate" role="group" aria-label="Rotation rating">
            {['A', 'B', 'C'].map(r => (
                <button
                    key={r}
                    type="button"
                    disabled={disabled}
                    className={'adm-rate-btn' + (value === r ? ' is-on is-on--' + r : '')}
                    aria-pressed={value === r}
                    onClick={() => onChange(r)}
                >{r}</button>
            ))}
        </span>
    );
}

/** The songs of one station, each rating written the moment it is clicked. */
function StationTracks({ station, saved, onSaved }) {
    const [manifest, setManifest] = useState(null);
    const [state, setState] = useState('loading');   // loading | ready | error
    const [filter, setFilter] = useState('');
    const [promotedOnly, setPromotedOnly] = useState(false);
    // SongID -> true while that one song's write is in flight. Per song, not
    // per table: promoting a rack of tracks should not lock the whole list
    // behind whichever request happens to be slowest.
    const [busy, setBusy] = useState({});
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!station.manifest) { setState('error'); return; }
        let cancelled = false;
        setState('loading');
        (async () => {
            try {
                const res = await fetch(station.manifest, { cache: 'force-cache' });
                if (!res.ok) throw new Error(String(res.status));
                const doc = await res.json();
                if (!cancelled) { setManifest(doc); setState('ready'); }
            } catch (e) {
                if (!cancelled) setState('error');
            }
        })();
        return () => { cancelled = true; };
    }, [station.manifest]);

    // The manifest nests tracks inside albums; the rating store is keyed by
    // SongID alone. Flattening once here is what lets the filter and the cap
    // work on one list instead of a tree.
    const tracks = useMemo(() => {
        const out = [];
        for (const album of manifest?.albums || []) {
            for (const t of album.tracks || []) {
                out.push({
                    id: t.track_id,
                    title: t.title,
                    artist: t.artist,
                    album: album.title,
                    duration_s: t.duration_s,
                });
            }
        }
        return out;
    }, [manifest]);

    const ratingOf = id => saved[id]?.r ?? 'C';

    const shown = useMemo(() => {
        const q = filter.trim().toLowerCase();
        return tracks.filter(t => {
            if (promotedOnly && ratingOf(t.id) === 'C') return false;
            if (!q) return true;
            return (t.title || '').toLowerCase().includes(q)
                || (t.album || '').toLowerCase().includes(q)
                || (t.artist || '').toLowerCase().includes(q)
                || (t.id || '').toLowerCase().includes(q);
        });
    }, [tracks, filter, promotedOnly, saved]);

    /*
     * ONE CLICK IS THE WHOLE ACTION. There used to be a pending map and a Save
     * button, which meant a promotion could be typed and then lost by closing
     * the station — and the count in the toolbar never said WHICH song was
     * unsaved. Each click now writes on its own.
     *
     * The store already expected this shape: the route takes a map so a rack of
     * promotions can go in one request, and a map of one is a perfectly good
     * map. Setting C still deletes the entry rather than storing a C, so
     * demoting needs no separate call.
     */
    async function setRating(id, r) {
        if (busy[id]) return;
        // Clicking the rating a song already has is not a change, and a write
        // that changes nothing is still a write somebody waits for.
        if (r === (saved[id]?.r ?? 'C')) return;

        setBusy(prev => ({ ...prev, [id]: true }));
        setError(null);
        try {
            const result = await api('/api/radio/ratings', {
                method: 'POST',
                body: { station: station.id, ratings: { [id]: r } },
            });
            // The response carries the station's whole map after the write, so
            // the parent is handed the server's truth rather than this
            // component's guess at it. Nothing is painted before the server
            // agrees: a rating that silently failed would be worse than one
            // that took a moment to appear.
            onSaved(station.id, result.station || {});
        } catch (e) {
            setError(e instanceof ApiError && e.status === 403
                ? 'Your role no longer includes Stations & ratings.'
                : (e.message || 'That rating could not be saved.'));
        } finally {
            setBusy(prev => { const next = { ...prev }; delete next[id]; return next; });
        }
    }

    const savingCount = Object.keys(busy).length;

    if (state === 'loading') {
        return <div className="adm-state"><span className="adm-spinner" />Loading this station&rsquo;s music…</div>;
    }
    if (state === 'error') {
        return (
            <div className="adm-notice adm-notice--stop">
                <strong>No manifest for this station.</strong>
                <p>
                    {station.manifest
                        ? <>The CDN did not return <code>{station.manifest}</code>. Run the station build, then deploy the delivery tree.</>
                        : <>This frequency is planned but has no delivery tree yet, so there is nothing to rate.</>}
                </p>
            </div>
        );
    }

    return (
        <div className="adm-tracks">
            <div className="adm-toolbar">
                <input
                    type="search"
                    className="adm-search"
                    placeholder="Filter by song, album, artist or SongID…"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
                <label className="adm-check">
                    <input type="checkbox" checked={promotedOnly}
                           onChange={e => setPromotedOnly(e.target.checked)} />
                    Promoted only
                </label>
                <span className="adm-count">
                    {shown.length === tracks.length
                        ? num(tracks.length) + ' songs'
                        : num(shown.length) + ' of ' + num(tracks.length)}
                </span>
                {/* No Save button, because there is nothing to save. This only
                    reports whether a click is still in the air. */}
                <span className="adm-savestate">
                    {savingCount
                        ? <><span className="adm-spinner adm-spinner--sm" />Saving…</>
                        : 'Ratings save as you click'}
                </span>
            </div>

            {error && <div className="adm-notice adm-notice--stop"><strong>{error}</strong></div>}

            {shown.length > TRACK_CAP && (
                <p className="adm-fine">
                    Showing the first {num(TRACK_CAP)} of {num(shown.length)} matches — narrow the filter to reach the rest.
                </p>
            )}

            {/* Capped height with its own scrollbar and a pinned header row:
                three hundred songs should scroll inside the station that owns
                them, not push the next station off the bottom of the page. */}
            <div className="adm-table-wrap adm-table-wrap--tall">
                <table className="adm-table adm-table--tracks">
                    <thead>
                        <tr>
                            <th scope="col">Song</th>
                            <th scope="col">Album</th>
                            <th scope="col" className="adm-num">Time</th>
                            <th scope="col">Rating</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.slice(0, TRACK_CAP).map(t => {
                            const r = ratingOf(t.id);
                            const inFlight = Boolean(busy[t.id]);
                            const by = saved[t.id]?.by;
                            return (
                                <tr key={t.id} className={inFlight ? 'is-saving' : undefined}>
                                    <td>
                                        <span className="adm-cell-primary">{t.title}</span>
                                        <span className="adm-cell-dim">{t.artist} · <code>{t.id}</code></span>
                                    </td>
                                    <td>
                                        <span className="adm-cell-dim">{t.album}</span>
                                        {/* Who promoted it, kept from the store. A
                                            programming decision with no name on it is
                                            one nobody can ask about later. */}
                                        {by && r !== 'C' && (
                                            <span className="adm-cell-dim adm-cell-dim--faint">promoted by {by}</span>
                                        )}
                                    </td>
                                    <td className="adm-num">
                                        {t.duration_s
                                            ? Math.floor(t.duration_s / 60) + ':' + String(t.duration_s % 60).padStart(2, '0')
                                            : '—'}
                                    </td>
                                    <td>
                                        <RatingPicker value={r} disabled={inFlight}
                                                      onChange={v => setRating(t.id, v)} />
                                    </td>
                                </tr>
                            );
                        })}
                        {!shown.length && (
                            <tr><td colSpan={4} className="adm-empty">No song matches that filter.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function Stations() {
    const [stations, setStations] = useState([]);
    const [ratings, setRatings] = useState({});
    const [state, setState] = useState('loading');
    const [query, setQuery] = useState('');
    const [band, setBand] = useState('all');
    const [onAirOnly, setOnAirOnly] = useState(false);
    const [open, setOpen] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // The index is public and the ratings GET is public too, but the
                // token still goes on the ratings call — the same request is
                // what tells the store to answer `admin: true`.
                const [indexRes, rated] = await Promise.all([
                    fetch(INDEX_URL, { cache: 'no-store' }).then(r => r.json()),
                    api('/api/radio/ratings'),
                ]);
                if (cancelled) return;
                setStations(Array.isArray(indexRes?.stations) ? indexRes.stations : []);
                setRatings(rated?.stations || {});
                setState('ready');
            } catch (e) {
                if (!cancelled) setState('error');
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const bands = useMemo(() => {
        const seen = new Map();
        for (const s of stations) if (!seen.has(s.band)) seen.set(s.band, s.pill || s.band);
        return [...seen.entries()];
    }, [stations]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const matched = stations.filter(s => {
            if (onAirOnly && !s.onAir) return false;
            if (band !== 'all' && s.band !== band) return false;
            if (!q) return true;
            return [s.id, s.name, s.freq, s.format, s.lang, s.hostCity]
                .some(v => String(v || '').toLowerCase().includes(q));
        });
        /* ON AIR FIRST. The index is ordered by frequency, which scattered the
           41 stations somebody can actually act on among the 75 that are only
           planned. Within each group the index's own order is kept — sort is
           stable, so this reorders by one key and disturbs nothing else. */
        return matched.sort((a, b) => (b.onAir ? 1 : 0) - (a.onAir ? 1 : 0));
    }, [stations, query, band, onAirOnly]);

    /** Count the promotions the store holds for one station. */
    function tally(id) {
        const songs = ratings[id] || {};
        let a = 0, b = 0;
        for (const e of Object.values(songs)) {
            if (String(e?.r).toUpperCase() === 'A') a++;
            else if (String(e?.r).toUpperCase() === 'B') b++;
        }
        return { a, b };
    }

    if (state === 'loading') {
        return (
            <div className="adm-content">
                <div className="adm-state"><span className="adm-spinner" />Loading the dial…</div>
            </div>
        );
    }
    if (state === 'error') {
        return (
            <div className="adm-content">
                <div className="adm-notice adm-notice--stop">
                    <strong>The dial could not be loaded.</strong>
                    <p>
                        <code>{INDEX_URL}</code> is written by <code>tools/build-analytics-index.js</code>,
                        which runs after <code>build-home-data.js</code>. If it is missing, that build has not run.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="adm-content">
            <div className="adm-toolbar">
                <input type="search" className="adm-search" placeholder="Search frequency, name, format, city…"
                       value={query} onChange={e => setQuery(e.target.value)} />
                <select className="adm-select" value={band} onChange={e => setBand(e.target.value)}>
                    <option value="all">All bands</option>
                    {bands.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                <label className="adm-check">
                    <input type="checkbox" checked={onAirOnly} onChange={e => setOnAirOnly(e.target.checked)} />
                    On air only
                </label>
                <span className="adm-count">{num(shown.length)} of {num(stations.length)} stations</span>
            </div>

            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr>
                            <th scope="col">Frequency</th>
                            <th scope="col">Station</th>
                            <th scope="col">Band</th>
                            <th scope="col" className="adm-num">Songs</th>
                            <th scope="col" className="adm-num">Albums</th>
                            <th scope="col" className="adm-num">Airtime</th>
                            <th scope="col">Promoted</th>
                            <th scope="col"><span className="adm-sr">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map(s => {
                            const t = tally(s.id);
                            const isOpen = open === s.id;
                            return [
                                <tr key={s.id} className={isOpen ? 'is-open' : undefined}>
                                    <td>
                                        <span className="adm-cell-primary">{s.freq}</span>
                                        <span className="adm-cell-dim"><code>{s.id}</code></span>
                                    </td>
                                    <td>
                                        <span className="adm-cell-primary">{s.name}</span>
                                        <span className="adm-cell-dim">
                                            {s.format} · {s.lang}{s.hostCity ? ' · ' + s.hostCity : ''}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={'adm-badge ' + (s.onAir ? 'adm-tone-green' : 'adm-tone-neutral')}>
                                            {s.pill || s.band}
                                        </span>
                                        {!s.onAir && <span className="adm-cell-dim adm-cell-dim--faint">planned</span>}
                                    </td>
                                    <td className="adm-num">{num(s.songs)}</td>
                                    <td className="adm-num">{num(s.albums)}</td>
                                    <td className="adm-num">{hours(s.duration_s)}</td>
                                    <td>
                                        {t.a || t.b
                                            ? <span className="adm-tally"><b className="is-a">{t.a} A</b><b className="is-b">{t.b} B</b></span>
                                            : <span className="adm-cell-dim adm-cell-dim--faint">none yet</span>}
                                    </td>
                                    <td>
                                        <button type="button" className="adm-btn adm-btn--sm"
                                                aria-expanded={isOpen}
                                                onClick={() => setOpen(isOpen ? null : s.id)}>
                                            {isOpen ? 'Close' : 'Rate songs'}
                                        </button>
                                    </td>
                                </tr>,
                                isOpen && (
                                    <tr key={s.id + '-open'} className="adm-row-open">
                                        <td colSpan={8}>
                                            <p className="adm-fine" style={{ marginBottom: 12 }}>
                                                <strong>{s.name}</strong> — {s.selection || 'no selection rule recorded'}.
                                                Built {ago(s.built_at)}.
                                            </p>
                                            <StationTracks
                                                station={s}
                                                saved={ratings[s.id] || {}}
                                                onSaved={(id, map) => setRatings(prev => ({ ...prev, [id]: map }))}
                                            />
                                        </td>
                                    </tr>
                                ),
                            ];
                        })}
                        {!shown.length && (
                            <tr><td colSpan={8} className="adm-empty">No station matches those filters.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
