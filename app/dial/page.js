// The dial: a tuner rather than a directory. /player and /dial both reach
// it, because people ask for it by both names.
import PlayerPage from '../player/client';

export const metadata = {
    title: "The Dial — kJubilee.com",
    icons: { icon: '/images/members/JubileeInspire-Circle-200.png', apple: '/images/members/JubileeInspire-Circle-200.png' },
};

export default function Page() {
    return <PlayerPage />;
}
