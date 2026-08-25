'use strict';

// ─────────────────────────────────────────────────────────────────────────
// Server-only client for the Jubilee ID (SSO) authority — sso.jubileeinspire.com.
//
// Ported from JubileeInspire.com's src/lib/server/ssoClient.ts so the two sites
// speak the identical protocol. This module holds the client_id / client_secret
// and mints a short-lived service token, then calls the SSO API on behalf of
// kJubilee. NEVER require this from anything that ships to the browser.
//
// The Jubilee ID is the sole credential store: kJubilee keeps no password for a
// Jubilee ID account (see lib/local-account.js).
// ─────────────────────────────────────────────────────────────────────────

const IS_DEV = (process.env.NODE_ENV || 'development') !== 'production';

const SSO_BASE = process.env.SSO_BASE
    || (IS_DEV ? 'http://localhost:4031' : 'https://sso.jubileeinspire.com');
const CLIENT_ID     = process.env.SSO_CLIENT_ID || 'kjubilee';
const CLIENT_SECRET = process.env.SSO_CLIENT_SECRET || '';

// The site key this door belongs to, sent with login/register so the authority
// can record which property the identity was used on.
const SITE = process.env.SSO_SITE || 'kjubilee';

// A request to the authority should fail fast rather than hang the sign-in form.
const TIMEOUT_MS = parseInt(process.env.SSO_TIMEOUT_MS || '10000', 10);

// Cache the service token in-process until shortly before it expires, so we do
// not mint one per sign-in.
let cachedToken = null; // { token, exp }

function isConfigured() {
    return Boolean(CLIENT_SECRET);
}

async function fetchWithTimeout(url, init) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function getServiceToken() {
    const now = Date.now();
    if (cachedToken && cachedToken.exp - 60_000 > now) return cachedToken.token;

    const res = await fetchWithTimeout(`${SSO_BASE}/api/auth/service/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
    });
    if (!res.ok) throw new Error(`SSO service token mint failed: ${res.status}`);

    const data = await res.json();
    const parsed = data.expiresAt ? Date.parse(data.expiresAt) : NaN;
    cachedToken = { token: data.token, exp: Number.isNaN(parsed) ? now + 30 * 60_000 : parsed };
    return cachedToken.token;
}

// All service calls return the same discriminated shape as the JI client:
//   { ok: true, data }  |  { ok: false, status, error }
async function callSso(path, payload) {
    if (!isConfigured()) {
        return { ok: false, status: 503, error: 'SSO_CLIENT_SECRET is not configured' };
    }

    let svc;
    try {
        svc = await getServiceToken();
    } catch (e) {
        cachedToken = null;
        return { ok: false, status: 503, error: 'SSO authority unavailable' };
    }

    let res;
    try {
        res = await fetchWithTimeout(`${SSO_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svc}` },
            body: JSON.stringify(payload),
        });
    } catch {
        return { ok: false, status: 503, error: 'SSO authority unreachable' };
    }

    // Deliberately NOT clearing the cached service token on a 401. On these
    // endpoints a 401 means the PERSON's password was wrong, not ours — and
    // evicting the token there would make every mistyped password mint a new
    // service token at the authority. The token is refreshed a minute before
    // it expires (see getServiceToken), which is what keeps it fresh.

    let data = null;
    try { data = await res.json(); } catch { /* empty or non-JSON body */ }

    if (!res.ok) return { ok: false, status: res.status, error: (data && data.error) || 'sso_error' };
    return { ok: true, data };
}

// Does this email have a Jubilee ID at all?
function ssoLookup(email) {
    return callSso('/api/auth/lookup', { email });
}

// Verify { email, password } against the Jubilee ID authority.
function ssoLogin({ email, password }) {
    return callSso('/api/auth/login', { email, password, site: SITE });
}

// Create a brand-new Jubilee ID (Outcome C). 409 = the email already has one.
function ssoRegister({ first_name, last_name, email, date_of_birth, password }) {
    return callSso('/api/auth/register', {
        first_name, last_name, email,
        date_of_birth: date_of_birth || null,
        password, site: SITE,
    });
}

// Service-gated identity update BY EMAIL. Only ever called with an email that
// this server has just proved ownership of, so a caller can only change their own.
function ssoUpdateProfileByEmail(email, patch) {
    return callSso('/api/auth/service/profile', { email, ...patch });
}

// Set a new password on an identity this server has just proved the caller
// reached — the completion half of kJubilee's own reset. The authority holds
// the credential, so a reset that only updated kj_users would change nothing.
function ssoChangePasswordByEmail(email, newPassword) {
    return callSso('/api/auth/service/password', { email, new_password: newPassword });
}

// The authority's own OTP endpoints. Kept for completeness, but NOT what the
// reset uses: send-otp stores a code and deliberately does not email it, and
// outside development it does not return it either — so a site calling this
// sends nothing. kJubilee issues and emails its own token instead
// (lib/password-reset.js) and finishes with ssoChangePasswordByEmail above.
function ssoSendResetOtp(email) {
    return callSso('/api/auth/password/send-otp', { email });
}

function ssoVerifyResetOtp({ email, code }) {
    return callSso('/api/auth/password/verify-otp', { email, code });
}

function ssoResetPassword({ email, code, new_password }) {
    return callSso('/api/auth/password/reset', { email, code, new_password });
}

module.exports = {
    SSO_BASE, SITE,
    isConfigured,
    ssoLookup, ssoLogin, ssoRegister, ssoUpdateProfileByEmail, ssoChangePasswordByEmail,
    ssoSendResetOtp, ssoVerifyResetOtp, ssoResetPassword,
};
