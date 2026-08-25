import { pool as pgPool } from '@/lib/db';
import * as sso from '@/lib/sso';
import { hashPassword, createSalt } from '@/lib/auth';
import { normalizeEmail, checkLocalEmail, linkLocalAccount } from '@/lib/local-account';
import { json, readJson, ssoAuthLimiter } from '@/lib/api';
import { EMAIL_RE, validateDob, respondSignedIn } from '@/lib/sso-door';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Outcome C: create the Jubilee ID and the kJubilee account together ───
export async function POST(request) {
    const limited = ssoAuthLimiter(request);
    if (limited) return limited;

    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const firstName = (body.first_name || '').trim();
    const lastName  = (body.last_name || '').trim();
    const dob       = (body.date_of_birth || '').trim();
    const password  = body.password || '';
    const rememberMe = body.rememberMe !== false;

    if (!firstName || !lastName) {
        return json({ success: false, error: 'Please enter your first and last name.' }, 400);
    }
    if (!email || !EMAIL_RE.test(email)) {
        return json({ success: false, error: 'Please enter a valid email address.' }, 400);
    }
    const dobError = validateDob(dob);
    if (dobError) return json({ success: false, error: dobError }, 400);
    if (password.length < 8) {
        return json({ success: false, error: 'Password must be at least 8 characters.' }, 400);
    }

    // Already a member here? Stop before touching the authority, so a failed
    // sign-up cannot leave an orphaned Jubilee ID for an email we already hold.
    const existing = await checkLocalEmail(email);
    if (!existing.success) {
        return json({ success: false, error: 'Sign-up is temporarily unavailable. Please try again in a moment.' }, 503);
    }
    if (existing.exists) {
        return json({ success: false, existsLocally: true, error: 'An account already exists for this email — please sign in.' }, 409);
    }

    // No authority credentials → create a local-only account with a local
    // password, exactly as /api/auth/register always has.
    if (!sso.isConfigured()) {
        const salt = createSalt();
        const hash = hashPassword(password, salt);
        try {
            const { rows: [row] } = await pgPool.query(
                `INSERT INTO kj_users (email, password_hash, password_salt, first_name, last_name, name, date_of_birth, email_verified)
                 VALUES ($1,$2,$3,$4,$5,NULLIF(TRIM(COALESCE($4,'') || ' ' || COALESCE($5,'')), ''),$6::date,FALSE)
                 RETURNING id, email, first_name, last_name, name, role, jubilee_id, is_active, is_locked, email_verified`,
                [email, hash, salt, firstName, lastName, dob || null]
            );
            return respondSignedIn(row, rememberMe);
        } catch (e) {
            if (e.code === '23505') {
                return json({ success: false, error: 'An account already exists for this email — please sign in.' }, 409);
            }
            console.error('[sso/signup/register] local', e.message);
            return json({ success: false, error: 'Could not create your account. Please try again.' }, 500);
        }
    }

    // Create the master identity. The authority holds the password; this site
    // never sees it again.
    const result = await sso.ssoRegister({
        first_name: firstName, last_name: lastName, email,
        date_of_birth: dob || null, password,
    });
    if (!result.ok) {
        if (result.status === 409) {
            return json({ success: false, error: 'An account already exists for this email — please sign in.' }, 409);
        }
        console.error('[sso/signup/register]', result.status, result.error);
        return json({ success: false, error: 'Could not create your account. Please try again.' }, 503);
    }

    // Create the passwordless kJubilee account linked to the new Jubilee ID.
    // email_verified: false — nothing in this path proved the address. This is
    // the ONLY caller that opts out of verified-by-default; the door shows the
    // dismissible "please confirm your email" banner off the back of it.
    const ssoUser = result.data.user;
    const linked = await linkLocalAccount({
        email: ssoUser.email || email,
        first_name: ssoUser.first_name || firstName,
        last_name: ssoUser.last_name || lastName,
        date_of_birth: dob || null,
        jubilee_id: ssoUser.id,
        email_verified: false,
    });
    if (!linked.success) {
        // The Jubilee ID now exists but this site has no row for it, so the
        // person lands on Outcome B next time rather than a broken account.
        console.error('[sso/signup/register] local link failed for', email);
        return json({ success: false, error: 'Your Jubilee ID was created, but kJubilee setup failed. Please try signing in.' }, 503);
    }

    return respondSignedIn(linked.user, rememberMe);
}
