import * as sso from '@/lib/sso';
import { normalizeEmail, linkLocalAccount } from '@/lib/local-account';
import { json, readJson, ssoAuthLimiter } from '@/lib/api';
import { validateDob, respondSignedIn } from '@/lib/sso-door';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Outcome B, second screen: create the kJubilee account (no password) ──
// The person proved they own the Jubilee ID on the previous screen; this call
// re-verifies that same password server-side so the creation cannot be forged,
// then creates the row and signs them in.
export async function POST(request) {
    const limited = ssoAuthLimiter(request);
    if (limited) return limited;

    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const password = body.password || '';
    const rememberMe = body.rememberMe !== false;

    if (!email || !password) {
        return json({ success: false, error: 'Email and password are required.' }, 400);
    }
    const dobError = validateDob((body.date_of_birth || '').trim());
    if (dobError) return json({ success: false, error: dobError }, 400);

    if (!sso.isConfigured()) {
        return json({ success: false, error: 'Sign-up is temporarily unavailable. Please try again in a moment.' }, 503);
    }

    const result = await sso.ssoLogin({ email, password });
    if (!result.ok) {
        const message = result.status === 401
            ? "That password doesn't match. Try again."
            : 'Sign-up is temporarily unavailable. Please try again in a moment.';
        return json({ success: false, error: message }, result.status === 401 ? 401 : 503);
    }
    const ssoUser = result.data.user;

    // The pre-filled details are editable, so honour what was submitted and push
    // any change back to the Jubilee ID — best-effort, since the identity, not
    // this site, is where a date of birth belongs.
    const firstName = (body.first_name != null ? body.first_name : ssoUser.first_name || '').trim();
    const lastName  = (body.last_name  != null ? body.last_name  : ssoUser.last_name  || '').trim();
    const dob       = (body.date_of_birth || '').trim();
    const ssoDob    = ssoUser.date_of_birth ? String(ssoUser.date_of_birth).slice(0, 10) : '';
    const nameChanged = firstName !== (ssoUser.first_name || '') || lastName !== (ssoUser.last_name || '');
    const dobChanged  = Boolean(dob) && dob !== ssoDob;
    if (nameChanged || dobChanged) {
        const patch = {};
        if (firstName) patch.first_name = firstName;
        if (lastName)  patch.last_name  = lastName;
        if (dob)       patch.date_of_birth = dob;
        const upd = await sso.ssoUpdateProfileByEmail(ssoUser.email, patch);
        if (!upd.ok) console.error('[sso/signup/verify] profile update', upd.status, upd.error);
    }

    const linked = await linkLocalAccount({
        email: ssoUser.email || email,
        first_name: firstName || ssoUser.first_name,
        last_name: lastName || ssoUser.last_name,
        date_of_birth: dob || ssoDob,
        jubilee_id: ssoUser.id,
    });
    if (!linked.success) {
        return json({ success: false, error: 'Could not set up your kJubilee account. Please try again.' }, 503);
    }
    return respondSignedIn(linked.user, rememberMe);
}
