import * as sso from '@/lib/sso';
import { normalizeEmail, checkLocalEmail } from '@/lib/local-account';
import { json, readJson, clientIp, ssoAuthLimiter } from '@/lib/api';
import { verifyTurnstile, HUMAN_CHECK_FAILED } from '@/lib/turnstile';
import { EMAIL_RE } from '@/lib/sso-door';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Screen 1: which of the three outcomes is this email? ─────────────────
export async function POST(request) {
    const limited = ssoAuthLimiter(request);
    if (limited) return limited;

    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    if (!email || !EMAIL_RE.test(email)) {
        return json({ success: false, error: 'Please enter a valid email address.' }, 400);
    }

    // Human verification. Checked BEFORE the account lookup below, because that
    // lookup is what a script would be here for: it answers whether an address
    // has a Jubilee ID, one address per request, for free.
    const human = await verifyTurnstile(body.turnstileToken, clientIp(request));
    if (!human.ok) {
        console.warn('[sso/lookup] turnstile rejected a request:', human.reason);
        return json({ success: false, error: HUMAN_CHECK_FAILED }, 403);
    }

    // Checked FIRST, so Outcome A still works when the authority is down: a
    // person who already has a kJubilee account never needs the lookup below.
    const local = await checkLocalEmail(email);
    if (local.success && local.exists) {
        return json({ success: true, existsLocally: true, existsInSso: true });
    }
    if (!local.success) {
        return json({ success: false, error: 'We are having trouble reaching your account right now. Please try again in a moment.' }, 503);
    }

    // No authority credentials on this box → nobody can have a Jubilee ID we can
    // see, so a new email goes to Outcome C and creates a local-only account.
    if (!sso.isConfigured()) {
        return json({ success: true, existsLocally: false, existsInSso: false, ssoConfigured: false });
    }

    const result = await sso.ssoLookup(email);
    if (!result.ok) {
        console.error('[sso/lookup]', result.status, result.error);
        return json({ success: false, error: 'Sign-in is temporarily unavailable. Please try again in a moment.' }, 503);
    }
    // exists → Outcome B (confirm the Jubilee ID, then Create Account here)
    // else   → Outcome C (create the Jubilee ID and this account together)
    return json({ success: true, existsLocally: false, existsInSso: Boolean(result.data.exists) });
}
