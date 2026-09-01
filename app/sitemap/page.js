import { SECTIONS, stationsByBlock, readCatalogue, isOnAir, readSections } from '../_catalogue';
import Year from '../_year';
import SiteHeader from '../_site-header';

export const metadata = {
    title: 'Sitemap — kJubilee.com',
    description: 'Every page and every frequency on the kJubilee band.',
    icons: {
        icon: '/images/members/JubileeInspire-Circle-200.png',
        apple: '/images/members/JubileeInspire-Circle-200.png',
    },
};

/*
 * THE SITEMAP THE FOOTER LINKS TO.
 *
 * A server component on purpose. The rest of the site renders a shell and lets
 * a script in public/js fill it, which is right for pages that respond to a
 * listener; a sitemap exists to be READ — by a person looking for a page, and
 * by a crawler that will not run scripts. Rendering it on the server means both
 * get the same complete document.
 *
 * Every frequency comes from the same stations-data.js the dial uses, so this
 * page cannot list a station the dial does not have, and a station added in a
 * publish appears here with nothing to remember. /sitemap.xml (app/sitemap.js)
 * is generated from the same source for the same reason.
 */
export default function SitemapPage() {
    const blocks = stationsByBlock();
    const { stations, totals } = readCatalogue();
    const onAir = stations.filter(isOnAir).length;

    return (
        <>
            <link rel="stylesheet" href="/css/site-header.css" precedence="kj-header" />
            <link rel="stylesheet" href="/css/pages/sitemap.css" precedence="kj-page" />
            {/* The same header every other page carries. A sitemap is a page a
                visitor LANDS on from the footer, so leaving it without the nav
                and the search box stranded them on the one page whose whole
                purpose is getting somewhere else. */}
            {/* The category bar, rendered here rather than left empty. Every
                other page fills it from a client script; this page has none, so
                it hands the header the same sections that script would read. */}
            <SiteHeader sections={readSections()} />

            <main className="sm-wrap">
                <header className="sm-head">
                    <h1>Sitemap</h1>
                    <p className="sm-sub">
                        Every page on kJubilee.com, and all {stations.length} frequencies on the band
                        {onAir ? <> — {onAir} of them on air today</> : null}.
                    </p>
                </header>

                <section className="sm-block">
                    <h2>Pages</h2>
                    <ul className="sm-pages">
                        {SECTIONS.map((s) => (
                            <li key={s.href}>
                                <a href={s.href}>{s.label}</a>
                                {s.note ? <span className="sm-note">{s.note}</span> : null}
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="sm-block">
                    <h2>The dial</h2>
                    <p className="sm-sub sm-sub-tight">
                        Five blocks, each one office of the five-fold ministry. A frequency with no
                        catalogue behind it yet is marked <em>planned</em> — the address is real, it
                        has simply not signed on.
                    </p>

                    {blocks.map((b) => {
                        const live = b.stations.filter(isOnAir).length;
                        return (
                            <div className="sm-band" key={b.name}>
                                <h3>
                                    {b.name}
                                    <span className="sm-range">
                                        HM {b.low.toFixed(2)} – {b.high.toFixed(2)}
                                    </span>
                                    <span className="sm-count">
                                        {b.office} · {b.stations.length} stations, {live} on air
                                    </span>
                                </h3>
                                <ul className="sm-stations">
                                    {b.stations.map((s) => (
                                        <li key={s.slug} className={isOnAir(s) ? 'is-live' : ''}>
                                            <a href={'/radio?station=' + encodeURIComponent(s.slug)}>
                                                <span className="sm-hm">HM {s.hm}</span>
                                                <span className="sm-name">{s.name}</span>
                                            </a>
                                            <span className="sm-state">{isOnAir(s) ? 'on air' : 'planned'}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </section>

                {totals && totals.songsInLedger ? (
                    <p className="sm-foot-note">
                        {totals.songsInLedger.toLocaleString('en-US')} songs in the catalogue,
                        counted as distinct recordings. Catalogue data generated {totals.generatedAt}.
                    </p>
                ) : null}

                <footer className="site-footer">
                    <div className="site-footer-inner">
                        Copyright © <Year /> Jubilee Software, Inc. All rights reserved.{' '}
                        <a href="/sitemap">Sitemap</a> ·{' '}
                        <a href="/terms">Terms of Use</a> ·{' '}
                        <a href="/privacy">Privacy Policy</a>
                    </div>
                </footer>
            </main>
        </>
    );
}
