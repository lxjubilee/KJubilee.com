import SiteChrome from './_chrome';
import InspireRail from './_inspire-rail';

/*
 * THE SHARE CARD. A link to this site pasted into iMessage, WhatsApp, Slack or
 * a tweet came back as a black rectangle, because the site emitted no Open
 * Graph tags at all — no og:image, no og:title, nothing. Those scrapers do not
 * run JavaScript: whatever is not in the server's HTML does not exist to them,
 * which is why the dial rendering perfectly in a browser was no help.
 *
 * `metadataBase` is the part that is easy to leave out and silently breaks it.
 * og:image must be an ABSOLUTE url — a scraper has no page to resolve
 * `/images/...` against — and this is what Next uses to make it one.
 *
 * The card itself is public/images/og/kjubilee-dial.png, 1200x630, generated
 * rather than drawn: see the note beside it. Pages may override `openGraph`,
 * and anything they leave out falls back to here.
 */
const SHARE_CARD = {
    url: '/images/og/kjubilee-dial.png',
    width: 1200,
    height: 630,
    alt: 'kJubilee.com — the radio dial, HM 308.70 Year of Jubilee',
};

export const metadata = {
    metadataBase: new URL('https://www.kjubilee.com'),
    title: {
        default: 'kJubilee.com — The Heavenly Modulation dial',
        template: '%s',
    },
    description: 'Kingdom Jubilee Radio — the Heavenly Modulation band.',
    openGraph: {
        type: 'website',
        siteName: 'kJubilee.com',
        title: 'kJubilee.com — The Heavenly Modulation dial',
        description: 'Kingdom Jubilee Radio — the Heavenly Modulation band.',
        images: [SHARE_CARD],
    },
    twitter: {
        // The large card is what makes the image the message rather than a
        // thumbnail beside it, which on a phone is the whole difference
        // between a link somebody taps and one they scroll past.
        card: 'summary_large_image',
        title: 'kJubilee.com — The Heavenly Modulation dial',
        description: 'Kingdom Jubilee Radio — the Heavenly Modulation band.',
        images: ['/images/og/kjubilee-dial.png'],
    },
};

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    /* viewport-fit=cover is what makes env(safe-area-inset-*) report anything
       other than zero on iOS. The footer player is pinned to bottom:0 and would
       otherwise put its transport under the iPhone home indicator, where the
       first tap belongs to the OS rather than to the button. Nothing else on
       the site draws into the inset, so covering costs nothing elsewhere. */
    viewportFit: 'cover',
};

/*
 * The root layout is what makes the audio survive navigation: SiteChrome, and
 * therefore the footer player and its <audio>, is mounted here once and is
 * never unmounted as pages come and go beneath it. public/js/kj-nav.js used to
 * achieve that by refusing to load documents at all; this achieves it by there
 * only ever being one document.
 */
export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                {/* The union of what the pages asked for individually, so a
                    move between pages never re-requests a face. */}
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700&family=Open+Sans:wght@300;400;600;700&display=swap"
                />
                {/* The ground colour and the margin reset, before anything
                    else. Every page paints its own surface over this; base.css
                    is only what shows where one does not reach the edge — which
                    used to be the browser's white. It is a plain link rather
                    than a hoisted one so it is in the document ahead of every
                    page stylesheet, and any page rule wins over it. */}
                <link rel="stylesheet" href="/css/base.css" />
                <link rel="stylesheet" href="/css/scrollbars.css" />
            </head>
            <body>
                {/* The JubileeInspire rail, mounted here for the same reason
                    SiteChrome is: once, above the pages, so it is on every
                    route without any page having to ask for it. */}
                <InspireRail />
                {children}
                <SiteChrome />
            </body>
        </html>
    );
}
