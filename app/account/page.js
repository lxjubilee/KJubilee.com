import AccountClient from './client';

export const metadata = {
    title: 'Profile settings — kJubilee.com',
    // Nobody's settings page belongs in a search result, and there is nothing
    // here for a crawler: signed out, the page is a sign-in prompt.
    robots: { index: false, follow: false },
    icons: { icon: '/images/members/JubileeInspire-Circle-200.png' },
};

export default function Page() {
    return <AccountClient />;
}
