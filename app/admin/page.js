import AdminClient from './client';

export const metadata = {
    title: 'Administration — kJubilee.com',
    // The gate is the API route, not this tag; noindex simply keeps the page
    // out of results so nobody arrives here expecting to be let in.
    robots: { index: false, follow: false },
    icons: { icon: '/images/members/JubileeInspire-Circle-200.png' },
};

export default function Page() {
    return <AdminClient />;
}
