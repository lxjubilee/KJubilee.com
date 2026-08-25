'use client';

/* ─────────────────────────────────────────────────────────────────────────
   The frame every auth screen sits in — the Jubilee ID door, and the two
   password-reset pages that hang off it.

   Left: the wordmark and whatever the screen is. Right: the photographs, the
   drifting bubbles and the scripture. Extracted so /forgot-password and
   /reset-password are visibly the same place as /signin rather than a plainer
   cousin of it — someone halfway through signing in should not feel handed off
   to a different site.

   Look: public/css/jubilee-id.css.
   ───────────────────────────────────────────────────────────────────────── */

import { useState, useEffect } from 'react';

const BACKDROPS = [
    'https://images.unsplash.com/photo-1507692049790-de58290a4334?w=1200&q=80',
    'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=1200&q=80',
    'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=1200&q=80',
    'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=1200&q=80',
];

const QUOTES = [
    { text: '"For I know the plans I have for you," declares the Lord, "plans to prosper you and not to harm you, plans to give you hope and a future."', cite: '— Jeremiah 29:11' },
    { text: '"Sing to the Lord a new song; sing to the Lord, all the earth. Sing to the Lord, praise his name; proclaim his salvation day after day."', cite: '— Psalm 96:1-2' },
    { text: '"Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight."', cite: '— Proverbs 3:5-6' },
    { text: '"Let the message of Christ dwell among you richly … through psalms, hymns, and songs from the Spirit, singing to God with gratitude in your hearts."', cite: '— Colossians 3:16' },
    { text: '"Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go."', cite: '— Joshua 1:9' },
];

function BackdropPanel() {
    const [slide, setSlide] = useState(0);
    const [quote, setQuote] = useState(0);
    const [fading, setFading] = useState(false);

    useEffect(() => {
        const t = setInterval(() => setSlide((i) => (i + 1) % BACKDROPS.length), 5000);
        return () => clearInterval(t);
    }, []);

    // Fade the words out, swap them, fade back in — the same two-step the
    // original page did with a 500ms timeout.
    useEffect(() => {
        const t = setInterval(() => {
            setFading(true);
            setTimeout(() => {
                setQuote((i) => (i + 1) % QUOTES.length);
                setFading(false);
            }, 500);
        }, 8000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="auth-bg-panel" aria-hidden="true">
            {BACKDROPS.map((src, i) => (
                <div key={src} className={`bg-slide${i === slide ? ' active' : ''}`}
                     style={{ backgroundImage: `url('${src}')` }} />
            ))}
            <div className="bg-overlay" />
            <ul className="bubbles">
                {Array.from({ length: 10 }, (_, i) => <li key={i} />)}
            </ul>
            <div className="scripture-quote" style={{ opacity: fading ? 0 : 1 }}>
                <span>{QUOTES[quote].text}</span>
                <cite>{QUOTES[quote].cite}</cite>
            </div>
        </div>
    );
}

export default function AuthShell({ children }) {
    return (
        <>
            <link rel="stylesheet" href="/css/jubilee-id.css" precedence="kj-page" />
            <div className="wave-bar" />

            <div className="auth-row">
                <div className="auth-form-panel">
                    <div className="auth-form-inner">
                        <div className="auth-logo">
                            <a href="/" aria-label="kJubilee.com home">
                                <img src="/images/members/JubileeNova-Circle-200.png" alt=""
                                     className="auth-logo-img" width="92" height="92" />
                                <span className="auth-logo-text">
                                    <span className="k">k</span><span className="jubilee">Jubilee</span>.com
                                </span>
                            </a>
                        </div>

                        {children}
                    </div>

                    <div className="auth-footer">
                        <p className="copyright">
                            &copy; {new Date().getFullYear()} kJubilee.com |{' '}
                            <a href="https://www.jubileeinspire.com/help/terms" target="_blank" rel="noopener">Terms of Use</a> |{' '}
                            <a href="https://www.jubileeinspire.com/help/privacy" target="_blank" rel="noopener">Privacy Policy</a>
                        </p>
                    </div>
                </div>

                <BackdropPanel />
            </div>
        </>
    );
}
