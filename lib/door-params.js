// Query-string handling for the Jubilee ID door, read on the SERVER and handed
// to the client component as props.
//
// The door used to call useSearchParams(), which forces the whole subtree out
// of server rendering — the page came back as an empty shell and the form only
// appeared after hydration. Reading them here instead means the sign-in screen
// is in the first response, and it puts the redirect-safety rule in one place
// that /login, /signin and /signup all share.

const first = (v) => (Array.isArray(v) ? v[0] : v);

export function doorParams(searchParams) {
    const sp = searchParams || {};
    const get = (k) => {
        const v = first(sp[k]);
        return typeof v === 'string' ? v : '';
    };

    // Only same-origin, root-relative paths are followed, so a crafted
    // ?redirect= cannot bounce someone off the site after they sign in.
    // "//evil.example" is protocol-relative and would leave — hence the second test.
    const raw = get('redirect') || get('next') || get('returnTo') || '/';
    const returnUrl = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';

    return {
        returnUrl,
        // Read per request rather than baked in at build with a NEXT_PUBLIC_
        // name, so rotating the key is a restart and not a rebuild. The SECRET
        // half is never touched here — only lib/turnstile.js sees it.
        turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
        initialEmail: get('email').trim(),
        // Handed over by a page that needed a signed-in listener and sent them here.
        initialError: get('error'),
    };
}
