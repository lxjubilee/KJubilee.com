import SiteChrome from './_chrome';

export const metadata = {
    title: {
        default: 'kJubilee.com — The Heavenly Modulation dial',
        template: '%s',
    },
    description: 'Kingdom Jubilee Radio — the Heavenly Modulation band.',
};

export const viewport = {
    width: 'device-width',
    initialScale: 1,
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
                <link rel="stylesheet" href="/css/scrollbars.css" />
            </head>
            <body>
                {children}
                <SiteChrome />
            </body>
        </html>
    );
}
