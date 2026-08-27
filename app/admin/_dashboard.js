'use client';

import { num, hours, ago, when } from './_api';

/*
 * The website dashboard — the front of the console.
 *
 * IT RENDERS WHAT THE SHELL ALREADY FETCHED. /api/admin/overview is the panel's
 * gate, so by the time any section is on screen its payload has arrived. Making
 * this component fetch again would mean two round trips for one screen and a
 * second spinner for data already in memory.
 *
 * EVERY NUMBER NAMES ITS SOURCE. An operator looking at "7,729 distinct songs"
 * needs to know whether that is live or a figure build-analytics-index wrote at
 * 04:10 — otherwise the dashboard becomes a thing people stop trusting and go
 * back to the terminal for. The freshness line under the network cards is the
 * whole reason that block is grouped separately.
 */

function Stat({ label, value, hint, tone }) {
    return (
        <div className={'adm-stat-card' + (tone ? ' adm-stat-card--' + tone : '')}>
            <span className="adm-stat-label">{label}</span>
            <strong className="adm-stat-value">{value}</strong>
            <span className="adm-stat-hint">{hint || ''}</span>
        </div>
    );
}

function Panel({ title, action, children }) {
    return (
        <section className="adm-panel">
            <div className="adm-panel-head">
                <h2 className="adm-panel-title">{title}</h2>
                {action}
            </div>
            {children}
        </section>
    );
}

/** A labelled proportion. Width is clamped so a zero total cannot divide by 0. */
function Bar({ label, value, total, meta }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return (
        <div className="adm-bar">
            <div className="adm-bar-head">
                <span className="adm-bar-label">{label}</span>
                <span className="adm-bar-meta">{meta}</span>
            </div>
            <div className="adm-bar-track" role="presentation">
                <div className="adm-bar-fill" style={{ width: pct + '%' }} />
            </div>
        </div>
    );
}

export default function Dashboard({ data }) {
    const net = data?.network || {};
    const inbox = data?.inbox;
    const ratings = data?.ratings || {};
    const catalog = data?.catalog;
    const audience = data?.audience;
    const site = data?.site || {};

    const onAir = Number(net.stations_on_air) || 0;
    const total = Number(net.stations_total) || 0;
    const unaired = Number(net.songs_unaired);

    return (
        <div className="adm-content">

            {/* ── the dial ─────────────────────────────────────────────── */}
            <div className="adm-stat-grid">
                <Stat label="Stations on air" value={num(onAir)} tone="green"
                      hint={total ? 'of ' + num(total) + ' on the dial' : null} />
                <Stat label="Planned" value={num(net.stations_planned)}
                      hint="built, not yet broadcasting" />
                <Stat label="Songs scheduled" value={num(net.songs_scheduled)}
                      hint={num(net.songs_distinct) + ' distinct recordings'} />
                <Stat label="Albums on air" value={num(net.albums_on_air)}
                      hint={num(net.albums_planned) + ' planned'} />
                <Stat label="Airtime" value={hours(net.duration_s)}
                      hint="total scheduled duration" />
                {/* Unaired is the one figure here that is a to-do rather than a
                    statistic: a song in the ledger that no selection rule picked
                    up is music nobody can hear. */}
                <Stat label="Songs on no station" value={num(net.songs_unaired)}
                      tone={unaired > 0 ? 'amber' : 'green'}
                      hint={unaired > 0 ? 'a selection rule did not fire' : 'every track has a home'} />
            </div>

            <p className="adm-fine">
                From <code>public/data/analytics-stations.json</code>, written by{' '}
                <code>{data?.index?.generator || 'build-analytics-index.js'}</code>{' '}
                <strong>{ago(data?.index?.generated_at)}</strong> ({when(data?.index?.generated_at)}).
                Re-run the build to refresh these.
            </p>

            {/* ── coverage ─────────────────────────────────────────────── */}
            <div className="adm-cols2">
                {Boolean(data?.bands?.length) && (
                    <Panel title="Coverage by band">
                        <div className="adm-bars">
                            {data.bands.map(b => (
                                <Bar key={b.key} label={b.label} value={b.onAir} total={b.total}
                                     meta={b.onAir + ' on air of ' + b.total} />
                            ))}
                        </div>
                    </Panel>
                )}

                {Boolean(data?.languages?.length) && (
                    <Panel title="Coverage by language">
                        <div className="adm-chips">
                            {data.languages.map(l => (
                                <span key={l.key} className={'adm-chip' + (l.onAir ? ' is-live' : '')}>
                                    {l.label}
                                    <b>{l.onAir}/{l.total}</b>
                                </span>
                            ))}
                        </div>
                        <p className="adm-fine" style={{ marginTop: 12 }}>
                            A language is live once at least one of its frequencies is on air.
                        </p>
                    </Panel>
                )}
            </div>

            {/* ── programming + listeners ──────────────────────────────── */}
            <h2 className="adm-h2">Programming &amp; listeners</h2>
            <div className="adm-stat-grid">
                <Stat label="Songs promoted" value={num(ratings.total)}
                      hint={ratings.a + ' rated A · ' + ratings.b + ' rated B'} />
                <Stat label="Stations with promotions" value={num(ratings.stations_rated)}
                      hint={'last change ' + ago(ratings.updated_at)} />
                {inbox ? (
                    <>
                        <Stat label="Listener events (7d)" value={num(inbox.events_7d)}
                              hint={num(inbox.comments_7d) + ' were typed comments'} />
                        <Stat label="Voicemail waiting" value={num(inbox.voicemail_pending)}
                              tone={inbox.voicemail_pending > 0 ? 'amber' : undefined}
                              hint={inbox.voicemail_pending > 0 ? 'unplayed in the queue' : 'queue is clear'} />
                        {/* A request record means a listener's player asked for a
                            day file that was not there. It is a programming hole,
                            not feedback — flagged rather than counted quietly. */}
                        <Stat label="Missing day files (7d)" value={num(inbox.requests_7d)}
                              tone={inbox.requests_7d > 0 ? 'red' : 'green'}
                              hint={inbox.requests_7d > 0 ? 'a player asked and got nothing' : 'no gaps reported'} />
                    </>
                ) : (
                    <Stat label="Listener inbox" value="—" tone="amber"
                          hint="the CDN tree could not be read" />
                )}
                {audience && (
                    <Stat label="Members" value={num(audience.members)}
                          hint={num(audience.members_7d) + ' joined this week'} />
                )}
            </div>

            {/* ── catalogue + runtime ──────────────────────────────────── */}
            <h2 className="adm-h2">Catalogue &amp; runtime</h2>
            <div className="adm-stat-grid">
                {catalog
                    ? <Stat label="Album rows" value={num(catalog.total)}
                            hint={Object.entries(catalog.by_status || {}).map(([k, v]) => v + ' ' + k).join(' · ') || 'none yet'} />
                    : <Stat label="Album rows" value="—" tone="amber" hint="database did not answer" />}
                {audience && (
                    <Stat label="Saved by listeners" value={num(audience.favorites)}
                          hint={num(audience.follows) + ' station follows'} />
                )}
                <Stat label="Environment" value={site.env || '—'} hint={'node ' + (site.node || '?')} />
                <Stat label="Database" value={site.db === 'ok' ? 'ok' : 'unreachable'}
                      tone={site.db === 'ok' ? 'green' : 'red'}
                      hint={site.db === 'ok' ? 'pool answering' : 'queries are failing'} />
                <Stat label="Process uptime" value={hours(site.uptime_s)} hint="since the last restart" />
            </div>
        </div>
    );
}
