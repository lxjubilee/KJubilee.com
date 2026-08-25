import { pool as pgPool } from '@/lib/db';
import * as sso from '@/lib/sso';
import { normalizeEmail, toYmdLocal, checkLocalEmail, updateLocalAccount } from '@/lib/local-account';
import { json, readJson, ssoAuthLimiter } from '@/lib/api';
import { respondSignedIn, localPasswordMatches, loadPasswordRow } from '@/lib/sso-door';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Outcome A: password → signed in. Also the password check for Outcome B. ──
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

    const local = await checkLocalEmail(email);
    if (!local.success) {
        return json({ success: false, error: 'Sign-in is temporarily unavailable. Please try again in a moment.' }, 503);
    }

    // ── Legacy / no-authority path: this site's own password ──────────────
    // Reached when the box has no SSO credentials, or when the email has a
    // kJubilee row that still carries a local hash. Without this, every account
    // created before the Jubilee ID door would be locked out.
    const passwordRow = local.exists ? await loadPasswordRow(email) : null;
    const hasLocalPassword = Boolean(passwordRow && passwordRow.password_hash);

    if (!sso.isConfigured()) {
        if (!local.exists) {
            return json({ success: false, redirect: 'signup', email, error: "No account for this email — let's create one." }, 404);
        }
        if (!hasLocalPassword) {
            return json({ success: false, error: 'Sign-in is temporarily unavailable. Please try again in a moment.' }, 503);
        }
        if (!localPasswordMatches(password, passwordRow)) {
            return json({ success: false, error: 'Invalid email or password' }, 401);
        }
        return respondSignedIn(local.user, rememberMe);
    }

    // 1) Does this email have a Jubilee ID at all?
    const lookup = await sso.ssoLookup(email);
    if (!lookup.ok) {
        // The authority is unreachable. A legacy account can still get in on its
        // own password rather than being told to come back later.
        if (hasLocalPassword && localPasswordMatches(password, passwordRow)) {
            return respondSignedIn(local.user, rememberMe);
        }
        console.error('[sso/login] lookup', lookup.status, lookup.error);
        return json({ success: false, error: 'Sign-in is temporarily unavailable. Please try again in a moment.' }, 503);
    }

    if (!lookup.data.exists) {
        // No Jubilee ID. A pre-door kJubilee account signs in on its local password.
        if (hasLocalPassword) {
            if (!localPasswordMatches(password, passwordRow)) {
                return json({ success: false, error: 'Invalid email or password' }, 401);
            }
            return respondSignedIn(local.user, rememberMe);
        }
        return json({
            success: false, redirect: 'signup', email,
            error: "No Jubilee ID for this email — let's create one.",
        }, 404);
    }

    // 2) Verify the password at the authority.
    const result = await sso.ssoLogin({ email, password });
    if (!result.ok) {
        const message = result.status === 401
            ? 'Invalid email or password'
            : 'Sign-in is temporarily unavailable. Please try again in a moment.';
        return json({ success: false, error: message }, result.status === 401 ? 401 : 503);
    }
    const ssoUser = result.data.user;

    // 3) Password is good — is there a kJubilee account for it?
    if (!local.exists) {
        // Outcome B. The door now shows the Create Account screen, pre-filled
        // with whatever the Jubilee ID already knows. Nothing is created yet —
        // that is the point of making the step visible.
        return json({
            success: false,
            redirect: 'signup-existing',
            email,
            first_name: ssoUser.first_name || '',
            last_name: ssoUser.last_name || '',
            date_of_birth: toYmdLocal(ssoUser.date_of_birth),
        }, 200);
    }

    // Outcome A. Refresh the local mirror's name from the authority so a name
    // changed on any family site lands here on this sign-in. Best-effort.
    await updateLocalAccount({ email, first_name: ssoUser.first_name, last_name: ssoUser.last_name });
    local.user.first_name = ssoUser.first_name || local.user.first_name;
    local.user.last_name  = ssoUser.last_name  || local.user.last_name;
    if (!local.user.jubilee_id && ssoUser.id) {
        await pgPool.query(`UPDATE kj_users SET jubilee_id = $2::uuid WHERE email = $1 AND jubilee_id IS NULL`, [email, ssoUser.id])
            .catch((e) => console.error('[sso/login] adopt jubilee_id', e.message));
        local.user.jubilee_id = ssoUser.id;
    }
    return respondSignedIn(local.user, rememberMe);
}
