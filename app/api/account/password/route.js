import { requireAccount, changePassword } from '@/lib/account';
import { json, readJson, ssoAuthLimiter, clientIp } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
 * POST /api/account/password  { currentPassword, newPassword, rememberMe? }
 *
 * Rate-limited on the same budget as the sign-in door. The current password is
 * checked here, so without the limiter this endpoint is a password oracle that
 * happens to require a fifteen-minute token — a worse door than the front one,
 * because nobody is watching it.
 *
 * The reply carries a NEW session. Changing a password revokes every session on
 * the account, this browser's included; handing back a fresh pair is what keeps
 * the person who just succeeded from being thrown out for succeeding.
 */
export async function POST(request) {
    const limited = ssoAuthLimiter(request);
    if (limited) return limited;

    const gate = await requireAccount(request);
    if (gate.error) return json({ success: false, error: gate.error }, gate.status);

    const body = await readJson(request);
    const result = await changePassword(gate.user.id, {
        currentPassword: body.currentPassword || '',
        newPassword: body.newPassword || '',
        // Absent means yes: someone changing a password in a tab they are
        // already signed into has not asked to be signed out of it.
        rememberMe: body.rememberMe !== false,
        userAgent: request.headers.get('user-agent') || '',
        ip: clientIp(request),
    });

    if (!result.success) return json({ success: false, error: result.error }, result.status || 400);

    return json({
        success: true,
        // 'jubilee-id' means the change landed at the authority and applies to
        // every Jubilee site. The screen says which, because the person is
        // entitled to know how far what they just did reaches.
        scope: result.scope,
        reauthenticate: result.reauthenticate || false,
        token: result.token,
        expiresAt: result.expiresAt,
        refreshToken: result.refreshToken,
        refreshExpiresAt: result.refreshExpiresAt,
    });
}
