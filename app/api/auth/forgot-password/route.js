import { requestReset } from '@/lib/password-reset';
import { json, readJson, clientIp, ssoAuthLimiter } from '@/lib/api';
import { verifyTurnstile, HUMAN_CHECK_FAILED } from '@/lib/turnstile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/auth/forgot-password  { email }
//
// Always answers the same thing. Whether the address has a kJubilee account is
// something only the mailbox learns — otherwise this form is a free account
// enumerator, and one that needs no password guess to run.
//
// The one case that does NOT get the quiet answer is our own failure: if the
// database or Mailgun is down, saying "check your inbox" would send someone
// away to wait for a message that is never coming.
export async function POST(request) {
    const limited = ssoAuthLimiter(request);
    if (limited) return limited;

    const body = await readJson(request);
    const ip = clientIp(request);

    // Guarded too, and for a reason the sign-in screen does not have: every
    // request here sends a real email on our Mailgun account, at somebody else's
    // address. A script left pointed at this endpoint is both a bill and a way
    // to bury a stranger's inbox.
    const human = await verifyTurnstile(body.turnstileToken, ip);
    if (!human.ok) {
        console.warn('[forgot-password] turnstile rejected a request:', human.reason);
        return json({ success: false, error: HUMAN_CHECK_FAILED }, 403);
    }

    const result = await requestReset(body.email, ip);

    if (!result.success) {
        return json({
            success: false,
            error: 'We could not send the reset email just now. Please try again in a moment.',
        }, 503);
    }
    return json({ success: true });
}
