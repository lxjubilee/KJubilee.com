import JubileeIdDoor from '../_jubilee-id-door';
import { doorParams } from '@/lib/door-params';

export const metadata = {
    title: "kJubilee — Create your account",
    robots: { index: false, follow: false },
    icons: { icon: '/images/members/JubileeNova-Circle-200.png', apple: '/images/members/JubileeNova-Circle-200.png' },
};

/*
 * One door: /login, /signin and /signup all render the SAME email-first screen,
 * which then routes to sign-in or to a visible Create Account step. The flow is
 * app/_jubilee-id-door.js, so the heading and the behaviour are identical
 * whichever URL someone arrived on.
 *
 * Reading searchParams here makes the route dynamic, which is what these pages
 * want anyway: they are noindex, per-visitor, and must never be cached.
 */
export default async function Page({ searchParams }) {
    return <JubileeIdDoor {...doorParams(await searchParams)} />;
}
