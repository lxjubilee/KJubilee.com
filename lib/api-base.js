// Where the browser sends API calls.
//
// Empty (the default) means same-origin — /api/… against whatever host served
// the page, which is what every deployment did before the auth API got its own
// hostname, and what keeps development a single process.
//
// Set NEXT_PUBLIC_API_BASE=https://api.kjubilee.com to send them to the API
// host instead. Same name and meaning as JubileeInspire's, so the family reads
// the same way.
//
// ⚠ NEXT_PUBLIC_ values are inlined AT BUILD TIME. Changing this is a rebuild,
// not a restart — unlike the server-side settings, which are read per request.
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/+$/, '');

/** apiUrl('/api/sso/login') -> '/api/sso/login' or 'https://api.kjubilee.com/api/sso/login' */
export function apiUrl(path) {
    return API_BASE + path;
}
