// The dial: a tuner rather than a directory. /player and /dial both reach
// it, because people ask for it by both names.
import PlayerPage from '../player/client';

const DESCRIPTION =
    'Tune the Heavenly Modulation band. HM 308.70 Year of Jubilee and the whole '
    + 'kJubilee dial — continuous worship and teaching, day and night.';

/* Its own openGraph rather than the root's, because this is the page people
   actually share: it is the one with sound coming out of it.

   THE CARD IS NAMED AGAIN HERE, and it has to be. Declaring `openGraph` on a
   page REPLACES the layout's object outright — Next does not deep-merge
   `images` in from the parent. The first cut of this left it out on the
   assumption that it would inherit, and built a player page carrying og:title,
   og:description and og:url with no og:image at all: the exact black rectangle
   this change exists to fix, shipped under a comment claiming otherwise. The
   built HTML is the only thing that settles it — grep it. */
export const metadata = {
    title: "The Dial — kJubilee.com",
    description: DESCRIPTION,
    icons: { icon: '/images/members/JubileeInspire-Circle-200.png', apple: '/images/members/JubileeInspire-Circle-200.png' },
    openGraph: {
        type: 'music.radio_station',
        siteName: 'kJubilee.com',
        title: 'The Dial — kJubilee.com',
        description: DESCRIPTION,
    images: [{
            url: '/images/og/kjubilee-dial.png',
            width: 1200,
            height: 630,
            alt: 'kJubilee.com — the radio dial, HM 308.70 Year of Jubilee',
        }],
        url: '/dial',
    },
    twitter: {
        card: 'summary_large_image',
        images: ['/images/og/kjubilee-dial.png'],
        title: 'The Dial — kJubilee.com',
        description: DESCRIPTION,
    },
};

export default function Page() {
    return <PlayerPage />;
}
