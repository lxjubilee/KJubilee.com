'use strict';

// ─────────────────────────────────────────────────────────────────────────
// THE JUBILEE ID FAMILY SESSION, SEALED IN A COOKIE.
//
// kJubilee's own session is not a cookie at all: sign-in answers with a JWT
// access token and a refresh token, and the browser keeps them in storage
// (public/js/jubilee-id.js, app/_session-keeper.js). That works because every
// later call is an XHR this site's own script makes, and it can attach the
// header itself.
//
// It does NOT work for a LINK. Clicking "Bible Talks" is a plain navigation:
// the browser sends what it has in cookies and nothing else, so a server route
// that has to vouch for the reader before handing them to a sibling site has no
// way to know who they are. That is the whole reason this file exists — one
// httpOnly cookie, read only on the server, holding the credential the ticket
// is minted from.
//
// WHAT IS IN IT. The 90-day Jubilee ID session token, plus the email it belongs
// to. The token is a live family-wide credential, so it is SEALED (AES-256-GCM)
// rather than merely signed — the same treatment JubileeBibleTalks gives it in
// app/lib/session.js. A cookie the browser cannot read, and could not interpret
// if it did.
//
// The email rides along so a dead session can be re-opened without making the
// reader sign in again to repair a token they cannot see: signing out on any
// sibling revokes the family session, and nothing can reach into this cookie to
// say so.
// ─────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

const COOKIE = 'kj_family';

// Matches the Jubilee ID session's own lifetime (JubileeSSO services/sessions.js
// SESSION_TTL_MS). A cookie outliving the credential inside it would just mean
// minting tickets that the authority refuses.
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

const IS_PROD = (process.env.NODE_ENV || 'development') === 'production';

// Derived, never used raw: JWT_SECRET signs access tokens, and reusing one key
// for two algorithms is how key-separation bugs start.
function key() {
    const secret = process.env.JWT_SECRET || '';
    if (!secret) return null;
    return crypto.createHash('sha256').update(`kj-family:${secret}`).digest();
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (str) => Buffer.from(str, 'base64url');

function seal(payload) {
    const k = key();
    if (!k) return null;
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', k, iv);
    const enc = Buffer.concat([c.update(JSON.stringify(payload), 'utf8'), c.final()]);
    return `${b64u(iv)}.${b64u(enc)}.${b64u(c.getAuthTag())}`;
}

function open(token) {
    const k = key();
    if (!k || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const d = crypto.createDecipheriv('aes-256-gcm', k, unb64u(parts[0]));
        d.setAuthTag(unb64u(parts[2]));
        const out = Buffer.concat([d.update(unb64u(parts[1])), d.final()]).toString('utf8');
        const data = JSON.parse(out);
        if (!data.exp || Date.now() > data.exp) return null;
        return data;
    } catch {
        // Wrong key, tampered ciphertext, or a cookie from before this shipped.
        return null;
    }
}

/**
 * The Set-Cookie value that carries a family session.
 *
 * SameSite=Lax, deliberately. This cookie has exactly one reader — kJubilee's
 * own /api/go/* routes, reached by the reader clicking a link on a kJubilee
 * page. Lax covers that (it is a top-level GET navigation) and refuses to send
 * it on any cross-site request, which is the property worth having on a cookie
 * holding a family credential.
 */
function familyCookie(sessionToken, email) {
    const sealed = seal({ t: sessionToken, e: email || '', exp: Date.now() + TTL_MS });
    if (!sealed) return null;
    const bits = [
        `${COOKIE}=${sealed}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${Math.floor(TTL_MS / 1000)}`,
    ];
    if (IS_PROD) bits.push('Secure');
    return bits.join('; ');
}

/** The cleared form — sign-out, and any read that finds a cookie it cannot open. */
function clearedFamilyCookie() {
    const bits = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
    if (IS_PROD) bits.push('Secure');
    return bits.join('; ');
}

/**
 * Read the family session out of a Request.
 *
 * SPLITS ON ";", NEVER A REGEX. A hand-built cookie pattern is what cost this
 * family a day of "auto-login is broken": `"(?:^|;\s*)"` in a JS string loses
 * its backslash, becomes `(?:^|;s*)`, and then only ever matches a cookie that
 * happens to be FIRST — which every clean-profile test is, and no returning
 * browser is.
 *
 * @returns {{ token: string, email: string }|null}
 */
function readFamily(request) {
    const header = request.headers.get('cookie') || '';
    if (!header) return null;
    let raw = null;
    for (const part of header.split(';')) {
        const s = part.trim();
        const eq = s.indexOf('=');
        if (eq > 0 && s.slice(0, eq) === COOKIE) { raw = s.slice(eq + 1); break; }
    }
    if (!raw) return null;
    const data = open(raw);
    if (!data || !data.t) return null;
    return { token: data.t, email: data.e || '' };
}

module.exports = { COOKIE, TTL_MS, familyCookie, clearedFamilyCookie, readFamily };
