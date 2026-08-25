import { refreshSession } from '@/lib/sessions';
import { json, readJson, clientIp } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/auth/refresh  { refreshToken }  ->  a fresh access token
//
// Deliberately NOT behind the sign-in rate limiter. This is called by every
// signed-in browser on a timer; sharing a budget sized for password guessing
// would sign people out for the crime of leaving a tab open.
//
// The reply says only that the session ended. Which of expired / revoked /
// never-existed applies goes to the server log — telling the caller would tell
// them how close they got.
export async function POST(request) {
    const body = await readJson(request);
    const result = await refreshSession(body.refreshToken, {
        userAgent: request.headers.get('user-agent'),
        ip: clientIp(request),
    });

    if (!result.success) {
        return json({ success: false, error: 'Your session has ended. Please sign in again.' }, 401);
    }
    return json({
        success: true,
        token: result.token,
        expiresAt: result.expiresAt,
        refreshToken: result.refreshToken,
        refreshExpiresAt: result.refreshExpiresAt,
    });
}
