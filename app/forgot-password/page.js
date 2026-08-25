import ForgotPasswordPage from './client';

export const metadata = {
    title: 'kJubilee — Reset your password',
    robots: { index: false, follow: false },
    icons: { icon: '/images/members/JubileeNova-Circle-200.png', apple: '/images/members/JubileeNova-Circle-200.png' },
};

// ?email= is carried over from the door, so nobody retypes the address they
// just entered on the sign-in screen.
export default async function Page({ searchParams }) {
    const sp = (await searchParams) || {};
    const raw = Array.isArray(sp.email) ? sp.email[0] : sp.email;
    return (
        <ForgotPasswordPage
            initialEmail={typeof raw === 'string' ? raw.trim() : ''}
            turnstileSiteKey={process.env.TURNSTILE_SITE_KEY || ''}
        />
    );
}
