import Year from './_year';

/*
 * The frame both legal documents sit in.
 *
 * A SERVER COMPONENT WITH NO STATE. These pages are text; nothing here needs
 * the browser, so nothing here ships to it.
 *
 * DELIBERATELY NOT THE SITE HEADER. /terms and /privacy are opened in a new tab
 * from the sign-up form, where there is no site chrome and the reader is in the
 * middle of creating an account — a full navigation bar invites them to wander
 * off mid-signup. They get the wordmark, which says whose document this is, and
 * one way back. The same page still reads correctly when reached from a footer.
 */
export default function LegalPage({ eyebrow, title, updated, effective, lede, children }) {
    return (
        <main className="legal">
            <link rel="stylesheet" href="/css/pages/legal.css" precedence="kj-page" />

            <div className="legal-top">
                <div className="legal-top-in">
                    <a className="legal-brand" href="/" aria-label="kJubilee.com home">
                        <img src="/images/members/JubileeInspire-Circle-200.png" alt="" width="30" height="30" />
                        <span className="legal-brand-name"><span className="k">k</span>Jubilee.com</span>
                    </a>
                    <a className="legal-back" href="/">← Back to the dial</a>
                </div>
            </div>

            <article className="legal-doc">
                <p className="legal-eyebrow">{eyebrow}</p>
                <h1 className="legal-title">{title}</h1>
                <p className="legal-dates">
                    Effective {effective} · Last updated {updated}
                </p>
                <p className="legal-lede">{lede}</p>

                {children}

                <div className="legal-foot">
                    <p>Copyright © <Year /> Jubilee Software, Inc. All rights reserved.</p>
                    <p>
                        <a href="/terms">Terms of Use</a> · <a href="/privacy">Privacy Policy</a> ·{' '}
                        <a href="/sitemap">Sitemap</a> · <a href="/">kJubilee.com</a>
                    </p>
                </div>
            </article>
        </main>
    );
}
