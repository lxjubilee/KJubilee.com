import ResetPasswordPage from './client';

export const metadata = {
    title: 'kJubilee — Choose a new password',
    robots: { index: false, follow: false },
    icons: { icon: '/images/members/JubileeNova-Circle-200.png', apple: '/images/members/JubileeNova-Circle-200.png' },
};

// The token arrives in the emailed link. It is read here rather than in the
// client so the page is dynamic — a reset screen must never be cached.
export default async function Page({ searchParams }) {
    const sp = (await searchParams) || {};
    const raw = Array.isArray(sp.token) ? sp.token[0] : sp.token;
    return <ResetPasswordPage token={typeof raw === 'string' ? raw : ''} />;
}
